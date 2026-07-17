import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  PROFIT_REPORT_COLUMN_LABELS_VI,
  InvoiceReportResult,
  ReportColumnHeader,
  ReportGroupBy,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import { ItemEntity } from '../../../inventory/location/item.entity';
import { LocationEntity } from '../../../inventory/location/location.entity';
import { StorageEntity } from '../../../inventory/location/storage.entity';
import { ProductEntity } from '../../../inventory/product/product.entity';
import { ItemStorageLocationEntity } from '../../../inventory/product/item-storage-location.entity';
import { StockBalanceEntity } from '../../../inventory/ledger/stock-balance.entity';
import { InvoiceEntity } from '../../../pos/entities/invoice.entity';
import { InvoiceItemEntity } from '../../../pos/entities/invoice-item.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { matchColumnFilter } from '../../report-core/column-filter.util';
import { ProfitReportFilterDto } from '../dto/profit-report-filter.dto';
import { ProfitReportSearchDto } from '../dto/profit-report-search.dto';
import {
  aggregateProfitByItem,
  buildItemGroupRow,
  buildItemGroupTotals,
  ProfitByItemRowInput,
  ProfitItemGrain,
  itemGroupCellValue,
} from '../profit-by-item.aggregator';
import {
  isKnownProfitByItemColumn,
  PROFIT_BY_GROUP_COLUMNS,
  PROFIT_BY_ITEM_COLUMNS,
} from '../profit-by-item.columns';
import { enrichHeader } from '../report-column.util';
import {
  applyBranchScope,
  applyInvoiceStatusFilter,
  CONSOLIDATED_PERMISSION,
  resolveBranchIds,
} from '../../report-core/report-query.util';
import { ReportDefinition } from '../report-definition';

interface ItemMeta {
  categoryId: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  parentId: string | null;
  parentSku: string | null;
  parentName: string | null;
}

/** Map the "Thống kê theo" filter onto the internal aggregation grain. */
function resolveGrain(statBy: ReportGroupBy | undefined): ProfitItemGrain {
  if (statBy === ReportGroupBy.PARENT) return 'parent';
  if (statBy === ReportGroupBy.GROUP) return 'group';
  return 'item';
}

/** "Lợi nhuận theo mặt hàng" — one aggregated row per item / parent product / category. */
@Injectable()
export class ProfitByItemReport implements ReportDefinition {
  readonly key = 'profit-by-item';

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly lineItems: Repository<InvoiceItemEntity>,
    @InjectRepository(ItemEntity)
    private readonly catalogItems: Repository<ItemEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>,
    @InjectRepository(StorageEntity)
    private readonly storages: Repository<StorageEntity>,
    @InjectRepository(LocationEntity)
    private readonly locations: Repository<LocationEntity>,
    @InjectRepository(ItemStorageLocationEntity)
    private readonly itemStorageLocations: Repository<ItemStorageLocationEntity>,
    @InjectRepository(StockBalanceEntity)
    private readonly stockBalances: Repository<StockBalanceEntity>,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(
    _actor: ActorContext,
    filters?: ProfitReportFilterDto,
  ): Promise<ReportColumnHeader[]> {
    if (filters?.statBy === ReportGroupBy.GROUP) {
      return PROFIT_BY_GROUP_COLUMNS.map((c) =>
        enrichHeader({
          col: c.key,
          name: PROFIT_REPORT_COLUMN_LABELS_VI[c.key] ?? c.key,
          desc: null,
          type: c.type,
          group: null,
        }),
      );
    }
    // "Vị trí" only applies at item grain (statBy=item, "Hàng hoá") — a parent
    // product row spans multiple items, so no single warehouse location fits.
    const defs =
      filters?.statBy === ReportGroupBy.PARENT
        ? PROFIT_BY_ITEM_COLUMNS.filter((c) => c.key !== 'location')
        : PROFIT_BY_ITEM_COLUMNS;
    return defs.map((c) =>
      enrichHeader({
        col: c.key,
        name: PROFIT_REPORT_COLUMN_LABELS_VI[c.key] ?? c.key,
        desc: null,
        type: c.type,
        group: null,
      }),
    );
  }

  async buildData(
    dto: ProfitReportSearchDto,
    actor: ActorContext,
  ): Promise<InvoiceReportResult> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;

    if (!dto.filters?.issuedAt?.from) {
      throw new BadRequestException('filters.issuedAt.from is required');
    }

    const referenced = [
      ...dto.columns,
      ...(dto.columnFilters ?? []).map((f) => f.col),
    ];
    const unknown = referenced.filter((k) => !isKnownProfitByItemColumn(k));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown report columns: ${[...new Set(unknown)].join(', ')}`,
      );
    }

    const hasConsolidated = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      CONSOLIDATED_PERMISSION,
    );
    const branchIds = resolveBranchIds(
      hasConsolidated,
      dto.filters.store,
      dto.filters.branchId,
      actor,
    );

    const qb = this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.organizationId = :orgId', { orgId: actor.organizationId });
    applyBranchScope(qb, 'invoice', branchIds);
    applyInvoiceStatusFilter(qb, 'invoice', {});
    new FilterBuilder(qb).applyDateRange('invoice.issuedAt', dto.filters.issuedAt);
    const invoiceRows = (await qb.getMany()).filter((i) => i.issuedAt);
    const invoiceIds = invoiceRows.map((i) => i.id);

    const lines = invoiceIds.length
      ? await this.lineItems.find({ where: { invoiceId: In(invoiceIds) } })
      : [];

    const metaByItemId = await this.loadItemMeta(lines, actor.organizationId);

    const grain = resolveGrain(dto.filters.statBy);
    // "Vị trí" only resolved at item grain, and only when actually requested.
    const needsLocation = grain === 'item' && referenced.includes('location');
    const locationByItemId = needsLocation
      ? await this.loadItemLocations(
          [...new Set(lines.map((l) => l.itemId).filter((id): id is string => !!id))],
          actor,
        )
      : new Map<string, string | null>();

    let rows: ProfitByItemRowInput[] = lines.map((li) => {
      const meta = li.itemId ? metaByItemId.get(li.itemId) : undefined;
      return {
        itemId: li.itemId ?? null,
        itemCode: li.itemCode,
        itemName: li.itemName,
        parentId: meta?.parentId ?? null,
        parentSku: meta?.parentSku ?? null,
        parentName: meta?.parentName ?? null,
        categoryId: meta?.categoryId ?? null,
        categoryCode: meta?.categoryCode ?? null,
        categoryName: meta?.categoryName ?? null,
        unit: li.unit ?? null,
        location: li.itemId ? locationByItemId.get(li.itemId) ?? null : null,
        direction: li.direction,
        quantity: Number(li.quantity ?? 0),
        lineTotal: Number(li.lineTotal ?? 0),
        costPrice: Number(li.costPrice ?? 0),
      };
    });

    if (dto.filters.categoryId) {
      rows = rows.filter((r) => r.categoryId === dto.filters.categoryId);
    }

    const groups = aggregateProfitByItem(rows, grain);

    const filtered = dto.columnFilters?.length
      ? groups.filter((g) =>
          dto.columnFilters!.every((f) =>
            matchColumnFilter(itemGroupCellValue(f.col, g), f),
          ),
        )
      : groups;

    const total = filtered.length;
    const offset = (page - 1) * limit;
    const pageRows = filtered.slice(offset, offset + limit);

    const rows2 = pageRows.map((g) => buildItemGroupRow(dto.columns, g));
    const totals = filtered.length ? buildItemGroupTotals(dto.columns, filtered) : null;

    return { rows: rows2, totals, total };
  }

  /** Category code/name + parent product per itemId (inline-resolved relations). */
  private async loadItemMeta(
    lines: InvoiceItemEntity[],
    organizationId: string,
  ): Promise<Map<string, ItemMeta>> {
    const map = new Map<string, ItemMeta>();
    const itemIds = [
      ...new Set(lines.map((l) => l.itemId).filter((id): id is string => !!id)),
    ];
    if (!itemIds.length) return map;
    const items = await this.catalogItems.find({
      where: { id: In(itemIds), organizationId },
    });
    const categoryIds = [
      ...new Set(items.map((i) => i.categoryId).filter((id): id is string => !!id)),
    ];
    const categories = categoryIds.length
      ? await this.categories.find({ where: { id: In(categoryIds), organizationId } })
      : [];
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    const productIds = [
      ...new Set(items.map((i) => i.productId).filter((id): id is string => !!id)),
    ];
    const products = productIds.length
      ? await this.products.find({ where: { id: In(productIds), organizationId } })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));

    for (const i of items) {
      const parent = i.productId ? productById.get(i.productId) : undefined;
      const category = i.categoryId ? categoryById.get(i.categoryId) : undefined;
      map.set(i.id, {
        categoryId: i.categoryId ?? null,
        categoryCode: category?.code ?? null,
        categoryName: category?.name ?? null,
        parentId: i.productId ?? null,
        parentSku: parent?.code ?? null,
        parentName: parent?.name ?? null,
      });
    }
    return map;
  }

  /**
   * "Vị trí" — each item's current location in the acting branch's WAREHOUSE
   * (non-showroom) storage(s), explicitly excluding the showroom — mirrors
   * `resolve-item-locations.handler.ts`'s priority order (preferred shelf,
   * then highest-stock location) but scoped to `isMainStorage=false` only.
   */
  private async loadItemLocations(
    itemIds: string[],
    actor: ActorContext,
  ): Promise<Map<string, string | null>> {
    const map = new Map<string, string | null>();
    if (!itemIds.length || !actor.branchId) return map;

    const warehouses = await this.storages.find({
      where: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        isMainStorage: false,
        isActive: true,
      },
    });
    const warehouseIds = warehouses.map((w) => w.id);
    if (!warehouseIds.length) return map;

    const locationIdByItemId = new Map<string, string>();

    const preferred = await this.itemStorageLocations.find({
      where: {
        itemId: In(itemIds),
        storageId: In(warehouseIds),
        organizationId: actor.organizationId,
      },
    });
    for (const p of preferred) {
      if (!locationIdByItemId.has(p.itemId)) locationIdByItemId.set(p.itemId, p.locationId);
    }

    const remaining = itemIds.filter((id) => !locationIdByItemId.has(id));
    if (remaining.length) {
      const balances = await this.stockBalances
        .createQueryBuilder('sb')
        .innerJoin(LocationEntity, 'loc', 'loc.id = sb.locationId')
        .where('sb.itemId IN (:...remaining)', { remaining })
        .andWhere('sb.organizationId = :orgId', { orgId: actor.organizationId })
        .andWhere('sb.quantity > 0')
        .andWhere('sb.isTracked = true')
        .andWhere('loc.storageId IN (:...warehouseIds)', { warehouseIds })
        .orderBy('sb.quantity', 'DESC')
        .select('sb.itemId', 'itemId')
        .addSelect('sb.locationId', 'locationId')
        .getRawMany<{ itemId: string; locationId: string }>();
      for (const b of balances) {
        if (!locationIdByItemId.has(b.itemId)) locationIdByItemId.set(b.itemId, b.locationId);
      }
    }

    // The preferred-shelf mapping (ItemStorageLocationEntity) has no isTracked
    // flag of its own — cross-check its (item, location) pair against
    // StockBalanceEntity and drop it if that specific pair was explicitly
    // "Ngừng theo dõi" (blank, not a different location — matches how the
    // Inventory Items UI hides untracked pairs rather than substituting one).
    if (locationIdByItemId.size) {
      const untracked = await this.stockBalances.find({
        where: [...locationIdByItemId.entries()].map(([itemId, locationId]) => ({
          itemId,
          locationId,
          organizationId: actor.organizationId,
          isTracked: false,
        })),
      });
      for (const u of untracked) locationIdByItemId.delete(u.itemId);
    }

    const locationIds = [...new Set(locationIdByItemId.values())];
    const locations = locationIds.length
      ? await this.locations.find({ where: { id: In(locationIds) } })
      : [];
    const codeByLocationId = new Map(locations.map((l) => [l.id, l.code]));

    for (const itemId of itemIds) {
      const locationId = locationIdByItemId.get(itemId);
      map.set(itemId, locationId ? codeByLocationId.get(locationId) ?? null : null);
    }
    return map;
  }
}
