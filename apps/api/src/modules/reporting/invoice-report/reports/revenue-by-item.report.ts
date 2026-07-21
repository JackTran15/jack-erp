import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  INVOICE_REPORT_COLUMN_LABELS_VI,
  InvoiceReportResult,
  ReportColumnHeader,
  ReportGroupBy,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { ItemEntity } from '../../../inventory/location/item.entity';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import { LocationEntity } from '../../../inventory/location/location.entity';
import { StorageEntity } from '../../../inventory/location/storage.entity';
import { ProductEntity } from '../../../inventory/product/product.entity';
import { ItemStorageLocationEntity } from '../../../inventory/product/item-storage-location.entity';
import { StockBalanceEntity } from '../../../inventory/ledger/stock-balance.entity';
import { InvoiceEntity } from '../../../pos/entities/invoice.entity';
import { InvoiceItemEntity } from '../../../pos/entities/invoice-item.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { InvoiceReportSearchDto } from '../dto/invoice-report-search.dto';
import { matchColumnFilter } from '../invoice-report.aggregator';
import {
  aggregateByItem,
  buildItemGroupRow,
  buildItemGroupTotals,
  ItemGrain,
  itemGroupCellValue,
  RevenueByItemRowInput,
} from '../revenue-by-item.aggregator';
import {
  isKnownRevenueByItemColumn,
  REVENUE_BY_ITEM_COLUMNS,
} from '../revenue-by-item.columns';
import { enrichHeader } from '../report-column.util';
import {
  applyBranchScope,
  applyInvoiceStatusFilter,
  CONSOLIDATED_PERMISSION,
  resolveBranchIds,
} from '../../report-core/report-query.util';
import {
  InvoiceReportColumnsFilterDto,
  ReportDefinition,
} from '../report-definition';

interface ItemMeta {
  categoryId: string | null;
  category: string | null;
  brand: string | null;
  parentId: string | null;
  parentSku: string | null;
  parentName: string | null;
}

/** Map the public statBy + statisticByBrand flags onto the internal row grain. */
function resolveGrain(
  statBy: ReportGroupBy | undefined,
  statisticByBrand: boolean | undefined,
): ItemGrain {
  if (statisticByBrand) return 'brand';
  if (statBy === ReportGroupBy.PARENT) return 'parent';
  if (statBy === ReportGroupBy.GROUP) return 'group';
  return 'item';
}

/** MISA-style "Doanh thu theo mặt hàng" — one aggregated row per item / category / brand. */
@Injectable()
export class RevenueByItemReport implements ReportDefinition {
  readonly key = 'revenue-by-item';

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
    actor: ActorContext,
    filters?: InvoiceReportColumnsFilterDto,
  ): Promise<ReportColumnHeader[]> {
    // "Vị trí"/"Mã vị trí" only apply at item grain (statBy=item, "Hàng hoá") AND
    // when the request resolves to exactly one store — a parent/category row
    // spans multiple items, and a multi-store row has no single location.
    let showLocation = !filters?.statBy || filters.statBy === ReportGroupBy.ITEM;
    if (showLocation) {
      try {
        const hasConsolidated = await this.rbac.hasPermission(
          actor.userId,
          actor.organizationId,
          CONSOLIDATED_PERMISSION,
        );
        const branchIds = resolveBranchIds(
          hasConsolidated,
          filters?.store,
          filters?.branchId,
          actor,
        );
        showLocation = Array.isArray(branchIds) && branchIds.length === 1;
      } catch {
        // No resolvable store scope (e.g. no branch, no consolidated access) —
        // the columns catalog should still render; buildData handles this the
        // same way when it actually needs the scope for data, not headers.
        showLocation = false;
      }
    }
    const defs = showLocation
      ? REVENUE_BY_ITEM_COLUMNS
      : REVENUE_BY_ITEM_COLUMNS.filter(
          (c) => c.key !== 'locationCode' && c.key !== 'locationName',
        );
    // Flat catalog — no bands, no dynamic payment-method columns.
    return defs.map((c) =>
      enrichHeader({
        col: c.key,
        name: INVOICE_REPORT_COLUMN_LABELS_VI[c.key] ?? c.key,
        desc: null,
        type: c.type,
        group: null,
      }),
    );
  }

  async buildData(
    dto: InvoiceReportSearchDto,
    actor: ActorContext,
  ): Promise<InvoiceReportResult> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 31;

    if (!dto.filters?.issuedAt?.from) {
      throw new BadRequestException('filters.issuedAt.from is required');
    }

    const referenced = [
      ...dto.columns,
      ...(dto.columnFilters ?? []).map((f) => f.col),
    ];
    const unknown = referenced.filter((k) => !isKnownRevenueByItemColumn(k));
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
      dto.branchId ?? dto.filters.branchId,
      actor,
    );

    const qb = this.invoices
      .createQueryBuilder('invoice')
      .where('invoice.organizationId = :orgId', { orgId: actor.organizationId });
    applyBranchScope(qb, 'invoice', branchIds);
    applyInvoiceStatusFilter(qb, 'invoice', dto.filters);
    new FilterBuilder(qb)
      .applyDateRange('invoice.issuedAt', dto.filters.issuedAt)
      .applyEnum('invoice.type', dto.filters.type?.value);
    const invoiceRows = (await qb.getMany()).filter((i) => i.issuedAt);
    const invoiceIds = invoiceRows.map((i) => i.id);

    const lines = invoiceIds.length
      ? await this.lineItems.find({ where: { invoiceId: In(invoiceIds) } })
      : [];

    const metaByItemId = await this.loadItemMeta(lines, actor.organizationId);

    const grain = resolveGrain(dto.filters.statBy, dto.filters.statisticByBrand);
    // "Vị trí"/"Mã vị trí" only resolved at item grain, only when actually
    // requested, and only when the query resolves to exactly ONE store — a
    // multi-store row has no single warehouse location.
    const needsLocation =
      grain === 'item' &&
      Array.isArray(branchIds) &&
      branchIds.length === 1 &&
      referenced.some((c) => c === 'locationCode' || c === 'locationName');
    const locationByItemId = needsLocation
      ? await this.loadItemLocations(
          [...new Set(lines.map((l) => l.itemId).filter((id): id is string => !!id))],
          actor.organizationId,
          branchIds![0],
        )
      : new Map<string, { code: string | null; name: string | null }>();

    let rows: RevenueByItemRowInput[] = lines.map((li) => {
      const meta = li.itemId ? metaByItemId.get(li.itemId) : undefined;
      const location = li.itemId ? locationByItemId.get(li.itemId) : undefined;
      return {
        itemId: li.itemId ?? null,
        itemCode: li.itemCode,
        itemName: li.itemName,
        parentId: meta?.parentId ?? null,
        parentSku: meta?.parentSku ?? null,
        parentName: meta?.parentName ?? null,
        categoryId: meta?.categoryId ?? null,
        itemCategory: meta?.category ?? null,
        brand: meta?.brand ?? null,
        unit: li.unit ?? null,
        locationCode: location?.code ?? null,
        locationName: location?.name ?? null,
        direction: li.direction,
        quantity: Number(li.quantity ?? 0),
        unitPrice: Number(li.unitPrice ?? 0),
        lineDiscount: Number(li.lineDiscount ?? 0),
        lineTotal: Number(li.lineTotal ?? 0),
      };
    });

    if (dto.filters.categoryId) {
      rows = rows.filter((r) => r.categoryId === dto.filters.categoryId);
    }
    if (dto.filters.brand) {
      rows = rows.filter((r) => r.brand === dto.filters.brand);
    }
    // NOTE: `productType` (product/service/combo) and `allocateComboRevenue`
    // have no backing field on the catalogue item, so they are accepted but
    // currently have no effect. Revisit when item kind / combo composition exists.

    const groups = aggregateByItem(rows, grain);

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

  /** Category name + brand + parent product per itemId (inline-resolved relations). */
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
    const nameByCategoryId = new Map(categories.map((c) => [c.id, c.name]));

    const productIds = [
      ...new Set(items.map((i) => i.productId).filter((id): id is string => !!id)),
    ];
    const products = productIds.length
      ? await this.products.find({ where: { id: In(productIds), organizationId } })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));

    for (const i of items) {
      const parent = i.productId ? productById.get(i.productId) : undefined;
      map.set(i.id, {
        categoryId: i.categoryId ?? null,
        category: i.categoryId ? nameByCategoryId.get(i.categoryId) ?? null : null,
        brand: i.brand ?? null,
        parentId: i.productId ?? null,
        parentSku: parent?.code ?? null,
        parentName: parent?.name ?? null,
      });
    }
    return map;
  }

  /**
   * "Vị trí"/"Mã vị trí" — each item's current location in the given branch's
   * WAREHOUSE (non-showroom) storage(s), explicitly excluding the showroom —
   * mirrors `ProfitByItemReport.loadItemLocations` (preferred shelf, then
   * highest-stock location), but scoped to a caller-supplied `branchId`
   * (the resolved store filter, not necessarily the actor's active branch)
   * and returning both code and name.
   */
  private async loadItemLocations(
    itemIds: string[],
    organizationId: string,
    branchId: string,
  ): Promise<Map<string, { code: string | null; name: string | null }>> {
    const map = new Map<string, { code: string | null; name: string | null }>();
    if (!itemIds.length) return map;

    const warehouses = await this.storages.find({
      where: { organizationId, branchId, isMainStorage: false, isActive: true },
    });
    const warehouseIds = warehouses.map((w) => w.id);
    if (!warehouseIds.length) return map;

    const locationIdByItemId = new Map<string, string>();

    const preferred = await this.itemStorageLocations.find({
      where: { itemId: In(itemIds), storageId: In(warehouseIds), organizationId },
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
        .andWhere('sb.organizationId = :orgId', { orgId: organizationId })
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

    // The preferred-shelf mapping has no isTracked flag of its own — cross-check
    // its (item, location) pair against StockBalanceEntity and drop it if that
    // specific pair was explicitly "Ngừng theo dõi" (matches ProfitByItemReport).
    if (locationIdByItemId.size) {
      const untracked = await this.stockBalances.find({
        where: [...locationIdByItemId.entries()].map(([itemId, locationId]) => ({
          itemId,
          locationId,
          organizationId,
          isTracked: false,
        })),
      });
      for (const u of untracked) locationIdByItemId.delete(u.itemId);
    }

    const locationIds = [...new Set(locationIdByItemId.values())];
    const locationRows = locationIds.length
      ? await this.locations.find({ where: { id: In(locationIds) } })
      : [];
    const byLocationId = new Map(locationRows.map((l) => [l.id, l]));

    for (const itemId of itemIds) {
      const locationId = locationIdByItemId.get(itemId);
      const loc = locationId ? byLocationId.get(locationId) : undefined;
      map.set(itemId, { code: loc?.code ?? null, name: loc?.name ?? null });
    }
    return map;
  }
}
