import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { StockBalanceEntity } from './stock-balance.entity';
import { StockStateFilter } from './dto/stock-summary-query.dto';

export interface StockSummaryQuery {
  organizationId: string;
  page?: number;
  pageSize?: number;
  search?: string;
  branchId?: string;
  storageId?: string;
  categoryId?: string;
  brand?: string;
  unit?: string;
  isActive?: boolean;
  isPosVisible?: boolean;
  stockState?: StockStateFilter;
  /** YYYY-MM-DD inclusive */
  movementFrom?: string;
  /** YYYY-MM-DD inclusive (end of day) */
  movementTo?: string;
}

export interface StockSummaryRow {
  itemId: string;
  storageId: string;
  item: {
    id: string;
    code: string;
    name: string;
    unit: string;
    brand: string | null;
    isActive: boolean;
    categoryName: string | null;
  };
  storage: {
    id: string;
    name: string;
    branchId: string;
  };
  quantity: number;
  lastMovementAt: string | null;
}

export interface StockSummaryResponse {
  data: StockSummaryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalQuantity: number;
}

export interface StockSummaryFilterOptions {
  brands: string[];
  units: string[];
}

interface RawPageRow {
  item_id: string;
  item_code: string;
  item_name: string;
  item_unit: string;
  item_brand: string | null;
  item_is_active: boolean;
  category_name: string | null;
  storage_id: string;
  storage_name: string;
  branch_id: string;
  quantity: string;
  last_movement_at: Date | null;
}

@Injectable()
export class StockSummaryService {
  constructor(
    @InjectRepository(StockBalanceEntity)
    private readonly balanceRepo: Repository<StockBalanceEntity>,
  ) {}

  async getSummary(query: StockSummaryQuery): Promise<StockSummaryResponse> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize ?? 50)));

    const pageQb = this.applyHaving(
      this.buildGroupedQuery(query),
      query.stockState,
    )
      .orderBy('item.code', 'ASC')
      .addOrderBy('storage.name', 'ASC')
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    // Count + totalQuantity over the *aggregated* set (respects HAVING).
    // We wrap the grouped query in a subquery so SUM-over-subquery gives the
    // correct total quantity across all aggregated rows.
    const aggQb = this.applyHaving(this.buildGroupedQuery(query), query.stockState);
    // getQueryAndParameters returns [sql_with_$1_$2, parameters_array] which
    // is exactly what `manager.query` expects.
    const [aggSql, aggParams] = aggQb.getQueryAndParameters();
    const aggregateSql = `SELECT COUNT(*)::int AS total, COALESCE(SUM(sub.quantity), 0)::numeric AS total_quantity FROM (${aggSql}) sub`;

    const [rows, aggResult] = await Promise.all([
      pageQb.getRawMany<RawPageRow>(),
      this.balanceRepo.manager.query<
        Array<{ total: number; total_quantity: string }>
      >(aggregateSql, aggParams),
    ]);

    const total = Number(aggResult?.[0]?.total ?? 0);
    const totalQuantity = Number(aggResult?.[0]?.total_quantity ?? 0);

    const data: StockSummaryRow[] = rows.map((r) => ({
      itemId: r.item_id,
      storageId: r.storage_id,
      item: {
        id: r.item_id,
        code: r.item_code,
        name: r.item_name,
        unit: r.item_unit,
        brand: r.item_brand,
        isActive: r.item_is_active,
        categoryName: r.category_name,
      },
      storage: {
        id: r.storage_id,
        name: r.storage_name,
        branchId: r.branch_id,
      },
      quantity: Number(r.quantity),
      lastMovementAt: r.last_movement_at
        ? r.last_movement_at.toISOString()
        : null,
    }));

    return { data, total, page, pageSize, totalQuantity };
  }

  async getFilterOptions(organizationId: string): Promise<StockSummaryFilterOptions> {
    const [brandRows, unitRows] = await Promise.all([
      this.balanceRepo.manager.query<Array<{ brand: string }>>(
        `SELECT DISTINCT item.brand AS brand
           FROM items item
          WHERE item.organization_id = $1
            AND item.brand IS NOT NULL
            AND item.brand <> ''
          ORDER BY item.brand ASC`,
        [organizationId],
      ),
      this.balanceRepo.manager.query<Array<{ unit: string }>>(
        `SELECT DISTINCT item.unit AS unit
           FROM items item
          WHERE item.organization_id = $1
            AND item.unit IS NOT NULL
            AND item.unit <> ''
          ORDER BY item.unit ASC`,
        [organizationId],
      ),
    ]);

    return {
      brands: brandRows.map((r) => r.brand),
      units: unitRows.map((r) => r.unit),
    };
  }

  private buildGroupedQuery(
    query: StockSummaryQuery,
  ): SelectQueryBuilder<StockBalanceEntity> {
    return this.buildBaseQuery(query)
      .select('item.id', 'item_id')
      .addSelect('item.code', 'item_code')
      .addSelect('item.name', 'item_name')
      .addSelect('item.unit', 'item_unit')
      .addSelect('item.brand', 'item_brand')
      .addSelect('item.is_active', 'item_is_active')
      .addSelect('cat.name', 'category_name')
      .addSelect('storage.id', 'storage_id')
      .addSelect('storage.name', 'storage_name')
      .addSelect('storage.branch_id', 'branch_id')
      .addSelect('SUM(sb.quantity)', 'quantity')
      .addSelect('MAX(sb.last_movement_at)', 'last_movement_at')
      .groupBy('item.id')
      .addGroupBy('item.code')
      .addGroupBy('item.name')
      .addGroupBy('item.unit')
      .addGroupBy('item.brand')
      .addGroupBy('item.is_active')
      .addGroupBy('cat.name')
      .addGroupBy('storage.id')
      .addGroupBy('storage.name')
      .addGroupBy('storage.branch_id');
  }

  private applyHaving(
    qb: SelectQueryBuilder<StockBalanceEntity>,
    stockState: StockStateFilter | undefined,
  ): SelectQueryBuilder<StockBalanceEntity> {
    if (!stockState || stockState === StockStateFilter.ALL) return qb;
    if (stockState === StockStateFilter.IN_STOCK) {
      qb.having('SUM(sb.quantity) > 0');
    } else if (stockState === StockStateFilter.OUT_OF_STOCK) {
      qb.having('SUM(sb.quantity) = 0');
    } else if (stockState === StockStateFilter.NEGATIVE) {
      qb.having('SUM(sb.quantity) < 0');
    }
    return qb;
  }

  private buildBaseQuery(
    query: StockSummaryQuery,
  ): SelectQueryBuilder<StockBalanceEntity> {
    const qb = this.balanceRepo
      .createQueryBuilder('sb')
      .innerJoin('items', 'item', 'item.id = sb.item_id')
      .innerJoin('locations', 'loc', 'loc.id = sb.location_id')
      .innerJoin('storages', 'storage', 'storage.id = loc.storage_id')
      .leftJoin(
        'inventory_item_categories',
        'cat',
        'cat.id = item.category_id',
      )
      .where('sb.organization_id = :organizationId', {
        organizationId: query.organizationId,
      });

    if (query.branchId) {
      qb.andWhere('sb.branch_id = :branchId', { branchId: query.branchId });
    }
    if (query.storageId) {
      qb.andWhere('loc.storage_id = :storageId', {
        storageId: query.storageId,
      });
    }
    if (query.categoryId) {
      qb.andWhere('item.category_id = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.search && query.search.trim()) {
      qb.andWhere('(item.code ILIKE :q OR item.name ILIKE :q)', {
        q: `%${query.search.trim()}%`,
      });
    }
    if (query.brand && query.brand.trim()) {
      qb.andWhere('item.brand ILIKE :brandQ', {
        brandQ: `%${query.brand.trim()}%`,
      });
    }
    if (query.unit && query.unit.trim()) {
      qb.andWhere('item.unit = :unit', { unit: query.unit.trim() });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('item.is_active = :isActive', { isActive: query.isActive });
    }
    if (query.isPosVisible !== undefined) {
      qb.andWhere('item.is_pos_visible = :isPosVisible', {
        isPosVisible: query.isPosVisible,
      });
    }
    if (query.movementFrom) {
      qb.andWhere('sb.last_movement_at >= :movementFrom', {
        movementFrom: query.movementFrom,
      });
    }
    if (query.movementTo) {
      qb.andWhere('sb.last_movement_at < :movementToPlus1', {
        movementToPlus1: addOneDay(query.movementTo),
      });
    }

    return qb;
  }
}

function addOneDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
