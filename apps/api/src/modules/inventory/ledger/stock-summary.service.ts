import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, SelectQueryBuilder } from "typeorm";
import {
  CompareFilterDto,
  CompareOperator,
  StringFilterDto,
} from "../../../common/filters/filter.dto";
import { FilterBuilder } from "../../../common/filters/filter.builder";
import { StockBalanceEntity } from "./stock-balance.entity";
import { StockStateFilter } from "./dto/stock-summary-query.dto";

export interface StockSummaryQuery {
  organizationId: string;
  page?: number;
  pageSize?: number;
  search?: string;
  branchId?: string;
  storageId?: string;
  categoryId?: string;
  brand?: string | StringFilterDto;
  unit?: string | StringFilterDto;
  isActive?: boolean;
  isPosVisible?: boolean;
  stockState?: StockStateFilter;
  /** YYYY-MM-DD inclusive */
  movementFrom?: string;
  /** YYYY-MM-DD inclusive (end of day) */
  movementTo?: string;
  /** YYYY-MM-DD inclusive */
  startDate?: string;
  /** YYYY-MM-DD inclusive (end of day) */
  endDate?: string;
  excludeReservations?: boolean;
  itemCode?: StringFilterDto;
  itemName?: StringFilterDto;
  category?: StringFilterDto;
  storage?: StringFilterDto;
  quantity?: CompareFilterDto;
  openingQty?: CompareFilterDto;
  inQty?: CompareFilterDto;
  outQty?: CompareFilterDto;
  transferOutQty?: CompareFilterDto;
  incomingQty?: CompareFilterDto;
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
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  closingQty: number;
  closingValue: number;
  transferOutQty: number;
  incomingQty: number;
  reservedQty: number;
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

export interface StockSummaryDetailsQuery {
  organizationId: string;
  branchId: string;
  itemId: string;
  storageId: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface StockSummaryDetailRow {
  referenceType: string;
  referenceId: string;
  postedAt: string;
  quantity: number;
  unitCost: number;
  lineValue: number;
  notes: string | null;
}

export interface StockSummaryDetailsResponse {
  data: StockSummaryDetailRow[];
  total: number;
  page: number;
  pageSize: number;
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

interface RawPeriodRow {
  item_id: string;
  storage_id: string;
  opening_qty: string | number | null;
  opening_value: string | number | null;
  in_qty: string | number | null;
  in_value: string | number | null;
  out_qty: string | number | null;
  out_value: string | number | null;
}

interface RawPendingTransferRow {
  item_id: string;
  storage_id: string;
  transfer_out_qty: string | number | null;
  incoming_qty: string | number | null;
}

interface RawDetailRow {
  reference_type: string;
  reference_id: string;
  posted_at: Date;
  quantity: string | number;
  unit_cost: string | number | null;
  line_value: string | number | null;
  notes: string | null;
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
    const needsDerivedFilter = Boolean(
      query.openingQty ||
      query.inQty ||
      query.outQty ||
      query.transferOutQty ||
      query.incomingQty,
    );

    const pageQb = this.applyHaving(
      this.buildGroupedQuery(query),
      query.stockState,
      query.quantity,
    )
      .orderBy("item.code", "ASC")
      .addOrderBy("storage.name", "ASC");
    if (!needsDerivedFilter) {
      pageQb.limit(pageSize).offset((page - 1) * pageSize);
    }

    const aggQb = this.applyHaving(
      this.buildGroupedQuery(query),
      query.stockState,
      query.quantity,
    );
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

    const periodDataMap = new Map<string, RawPeriodRow>();
    if (rows.length > 0 && (query.startDate || query.endDate)) {
      const startDate = query.startDate || "1970-01-01";
      const endDate = query.endDate ? addOneDay(query.endDate) : "2999-12-31";
      const itemIds = rows.map((r) => r.item_id);
      const storageIds = rows.map((r) => r.storage_id);

      const periodQuery = `
        SELECT
          sle.item_id,
          loc.storage_id,
          SUM(CASE WHEN sle.posted_at < $1 THEN sle.quantity ELSE 0 END)::numeric AS opening_qty,
          SUM(CASE WHEN sle.posted_at < $1 THEN sle.line_value ELSE 0 END)::numeric AS opening_value,
          SUM(CASE WHEN sle.posted_at >= $1 AND sle.posted_at < $2 AND sle.quantity > 0 THEN sle.quantity ELSE 0 END)::numeric AS in_qty,
          SUM(CASE WHEN sle.posted_at >= $1 AND sle.posted_at < $2 AND sle.quantity > 0 THEN sle.line_value ELSE 0 END)::numeric AS in_value,
          SUM(CASE WHEN sle.posted_at >= $1 AND sle.posted_at < $2 AND sle.quantity < 0 THEN ABS(sle.quantity) ELSE 0 END)::numeric AS out_qty,
          SUM(CASE WHEN sle.posted_at >= $1 AND sle.posted_at < $2 AND sle.quantity < 0 THEN ABS(sle.line_value) ELSE 0 END)::numeric AS out_value
        FROM stock_ledger_entries sle
        INNER JOIN locations loc ON loc.id = sle.location_id
        INNER JOIN unnest($4::uuid[], $5::uuid[]) AS pair(item_id, storage_id)
          ON pair.item_id = sle.item_id
         AND pair.storage_id = loc.storage_id
        WHERE sle.organization_id = $3
        GROUP BY sle.item_id, loc.storage_id
      `;
      const periodResult = await this.balanceRepo.manager.query<RawPeriodRow[]>(
        periodQuery,
        [startDate, endDate, query.organizationId, itemIds, storageIds],
      );
      for (const row of periodResult) {
        periodDataMap.set(`${row.item_id}:${row.storage_id}`, row);
      }
    }

    const pendingTransferMap = new Map<string, RawPendingTransferRow>();
    if (rows.length > 0) {
      const itemIds = rows.map((r) => r.item_id);
      const storageIds = rows.map((r) => r.storage_id);
      const pendingTransferQuery = `
        SELECT
          pairs.item_id,
          pairs.storage_id,
          COALESCE(SUM(
            CASE
              WHEN transfer_order.source_branch_id = $1
               AND COALESCE(line.source_storage_id, transfer_order.source_storage_id) = pairs.storage_id
              THEN line.requested_qty
              ELSE 0
            END
          ), 0)::numeric AS transfer_out_qty,
          COALESCE(SUM(
            CASE
              WHEN transfer_order.destination_branch_id = $1
               AND transfer_order.destination_storage_id = pairs.storage_id
              THEN line.requested_qty
              ELSE 0
            END
          ), 0)::numeric AS incoming_qty
        FROM unnest($3::uuid[], $4::uuid[]) AS pairs(item_id, storage_id)
        LEFT JOIN transfer_order_lines line
          ON line.item_id = pairs.item_id
         AND line.organization_id = $2
        LEFT JOIN transfer_orders transfer_order
          ON transfer_order.id = line.transfer_order_id
         AND transfer_order.organization_id = $2
         AND transfer_order.status = 'IN_PROGRESS'
         AND transfer_order.deleted_at IS NULL
        GROUP BY pairs.item_id, pairs.storage_id
      `;
      const pendingRows = await this.balanceRepo.manager.query<
        RawPendingTransferRow[]
      >(pendingTransferQuery, [
        query.branchId,
        query.organizationId,
        itemIds,
        storageIds,
      ]);
      for (const row of pendingRows) {
        pendingTransferMap.set(`${row.item_id}:${row.storage_id}`, row);
      }
    }

    let data: StockSummaryRow[] = rows.map((r) => {
      const pd = periodDataMap.get(`${r.item_id}:${r.storage_id}`);
      const pending = pendingTransferMap.get(`${r.item_id}:${r.storage_id}`);
      const openingQty = Number(pd?.opening_qty ?? 0);
      const openingValue = Number(pd?.opening_value ?? 0);
      const inQty = Number(pd?.in_qty ?? 0);
      const inValue = Number(pd?.in_value ?? 0);
      const outQty = Number(pd?.out_qty ?? 0);
      const outValue = Number(pd?.out_value ?? 0);
      const hasPeriod = query.startDate || query.endDate;
      const closingQty = hasPeriod
        ? openingQty + inQty - outQty
        : Number(r.quantity);
      const closingValue = hasPeriod ? openingValue + inValue - outValue : 0;

      return {
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
        openingQty,
        openingValue,
        inQty,
        inValue,
        outQty,
        outValue,
        closingQty,
        closingValue,
        transferOutQty: Number(pending?.transfer_out_qty ?? 0),
        incomingQty: Number(pending?.incoming_qty ?? 0),
        reservedQty: 0,
      };
    });

    if (needsDerivedFilter) {
      data = data.filter(
        (row) =>
          matchesCompare(row.openingQty, query.openingQty) &&
          matchesCompare(row.inQty, query.inQty) &&
          matchesCompare(row.outQty, query.outQty) &&
          matchesCompare(row.transferOutQty, query.transferOutQty) &&
          matchesCompare(row.incomingQty, query.incomingQty),
      );
      const filteredTotal = data.length;
      const filteredTotalQuantity = data.reduce(
        (sum, row) => sum + row.quantity,
        0,
      );
      data = data.slice((page - 1) * pageSize, page * pageSize);
      return {
        data,
        total: filteredTotal,
        page,
        pageSize,
        totalQuantity: filteredTotalQuantity,
      };
    }

    return { data, total, page, pageSize, totalQuantity };
  }

  async getDetails(
    query: StockSummaryDetailsQuery,
  ): Promise<StockSummaryDetailsResponse> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize ?? 20)));
    const offset = (page - 1) * pageSize;
    const startDate = query.startDate || "1970-01-01";
    const endDate = query.endDate ? addOneDay(query.endDate) : "2999-12-31";
    const params = [
      query.organizationId,
      query.itemId,
      query.storageId,
      query.branchId,
      startDate,
      endDate,
    ];

    const baseSql = `
      FROM stock_ledger_entries sle
      INNER JOIN locations loc ON loc.id = sle.location_id
      WHERE sle.organization_id = $1
        AND sle.item_id = $2
        AND loc.storage_id = $3
        AND sle.branch_id = $4
        AND sle.posted_at >= $5
        AND sle.posted_at < $6
    `;
    const dataSql = `
      SELECT
        sle.reference_type,
        sle.reference_id,
        sle.posted_at,
        sle.quantity,
        sle.unit_cost,
        sle.line_value,
        sle.notes
      ${baseSql}
      ORDER BY sle.posted_at DESC, sle.id DESC
      LIMIT $7 OFFSET $8
    `;
    const countSql = `SELECT COUNT(*)::int AS total ${baseSql}`;

    const [rows, countRows] = await Promise.all([
      this.balanceRepo.manager.query<RawDetailRow[]>(dataSql, [
        ...params,
        pageSize,
        offset,
      ]),
      this.balanceRepo.manager.query<Array<{ total: number | string }>>(
        countSql,
        params,
      ),
    ]);

    return {
      data: rows.map((row) => ({
        referenceType: row.reference_type,
        referenceId: row.reference_id,
        postedAt: row.posted_at.toISOString(),
        quantity: Number(row.quantity),
        unitCost: Number(row.unit_cost ?? 0),
        lineValue: Number(row.line_value ?? 0),
        notes: row.notes ?? null,
      })),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  async getFilterOptions(
    organizationId: string,
  ): Promise<StockSummaryFilterOptions> {
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
      .select("item.id", "item_id")
      .addSelect("item.code", "item_code")
      .addSelect("item.name", "item_name")
      .addSelect("item.unit", "item_unit")
      .addSelect("item.brand", "item_brand")
      .addSelect("item.is_active", "item_is_active")
      .addSelect("cat.name", "category_name")
      .addSelect("storage.id", "storage_id")
      .addSelect("storage.name", "storage_name")
      .addSelect("storage.branch_id", "branch_id")
      .addSelect("SUM(sb.quantity)", "quantity")
      .addSelect("MAX(sb.last_movement_at)", "last_movement_at")
      .groupBy("item.id")
      .addGroupBy("item.code")
      .addGroupBy("item.name")
      .addGroupBy("item.unit")
      .addGroupBy("item.brand")
      .addGroupBy("item.is_active")
      .addGroupBy("cat.name")
      .addGroupBy("storage.id")
      .addGroupBy("storage.name")
      .addGroupBy("storage.branch_id");
  }

  private applyHaving(
    qb: SelectQueryBuilder<StockBalanceEntity>,
    stockState: StockStateFilter | undefined,
    quantity?: CompareFilterDto,
  ): SelectQueryBuilder<StockBalanceEntity> {
    if (stockState === StockStateFilter.IN_STOCK) {
      qb.having("SUM(sb.quantity) > 0");
    } else if (stockState === StockStateFilter.OUT_OF_STOCK) {
      qb.having("SUM(sb.quantity) = 0");
    } else if (stockState === StockStateFilter.NEGATIVE) {
      qb.having("SUM(sb.quantity) < 0");
    }
    if (
      quantity &&
      quantity.value !== undefined &&
      quantity.value !== null &&
      quantity.value !== ""
    ) {
      qb.andHaving(
        `SUM(sb.quantity) ${compareSql(quantity.operator)} :quantityFilter`,
        { quantityFilter: Number(quantity.value) },
      );
    }
    return qb;
  }

  private buildBaseQuery(
    query: StockSummaryQuery,
  ): SelectQueryBuilder<StockBalanceEntity> {
    const qb = this.balanceRepo
      .createQueryBuilder("sb")
      .innerJoin("items", "item", "item.id = sb.item_id")
      .innerJoin("locations", "loc", "loc.id = sb.location_id")
      .innerJoin("storages", "storage", "storage.id = loc.storage_id")
      .leftJoin("inventory_item_categories", "cat", "cat.id = item.category_id")
      .where("sb.organization_id = :organizationId", {
        organizationId: query.organizationId,
      });

    if (query.branchId) {
      qb.andWhere("sb.branch_id = :branchId", { branchId: query.branchId });
    }
    if (query.storageId) {
      qb.andWhere("loc.storage_id = :storageId", {
        storageId: query.storageId,
      });
    }
    if (query.categoryId) {
      qb.andWhere("item.category_id = :categoryId", {
        categoryId: query.categoryId,
      });
    }
    if (query.search && query.search.trim()) {
      qb.andWhere("(item.code ILIKE :q OR item.name ILIKE :q)", {
        q: `%${query.search.trim()}%`,
      });
    }
    new FilterBuilder(qb)
      .applyString("item.code", query.itemCode)
      .applyString("item.name", query.itemName)
      .applyString(
        "item.unit",
        typeof query.unit === "object" ? query.unit : undefined,
      )
      .applyString("cat.name", query.category)
      .applyString(
        "item.brand",
        typeof query.brand === "object" ? query.brand : undefined,
      )
      .applyString("storage.name", query.storage);
    if (typeof query.brand === "string" && query.brand.trim()) {
      qb.andWhere("item.brand ILIKE :brandQ", {
        brandQ: `%${query.brand.trim()}%`,
      });
    }
    if (typeof query.unit === "string" && query.unit.trim()) {
      qb.andWhere("item.unit = :unit", { unit: query.unit.trim() });
    }
    if (query.isActive !== undefined) {
      qb.andWhere("item.is_active = :isActive", { isActive: query.isActive });
    }
    if (query.isPosVisible !== undefined) {
      qb.andWhere("item.is_pos_visible = :isPosVisible", {
        isPosVisible: query.isPosVisible,
      });
    }
    if (query.movementFrom) {
      qb.andWhere("sb.last_movement_at >= :movementFrom", {
        movementFrom: query.movementFrom,
      });
    }
    if (query.movementTo) {
      qb.andWhere("sb.last_movement_at < :movementToPlus1", {
        movementToPlus1: addOneDay(query.movementTo),
      });
    }

    return qb;
  }
}

function compareSql(operator: CompareOperator): string {
  return (
    {
      [CompareOperator.EQUALS]: "=",
      [CompareOperator.LT]: "<",
      [CompareOperator.LTE]: "<=",
      [CompareOperator.GT]: ">",
      [CompareOperator.GTE]: ">=",
    }[operator] ?? "="
  );
}

function matchesCompare(value: number, filter?: CompareFilterDto): boolean {
  if (
    !filter ||
    filter.value === undefined ||
    filter.value === null ||
    filter.value === ""
  ) {
    return true;
  }
  const target = Number(filter.value);
  if (!Number.isFinite(target)) return true;
  switch (filter.operator) {
    case CompareOperator.EQUALS:
      return value === target;
    case CompareOperator.LT:
      return value < target;
    case CompareOperator.LTE:
      return value <= target;
    case CompareOperator.GT:
      return value > target;
    case CompareOperator.GTE:
      return value >= target;
  }
}

function addOneDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
