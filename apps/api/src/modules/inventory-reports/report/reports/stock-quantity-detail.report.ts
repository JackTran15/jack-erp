import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  INVENTORY_REPORT_KEYS,
  InventoryReportResult,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../../branch/branch.entity';
import { LocationEntity } from '../../../inventory/location/location.entity';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { resolvePeriod } from '../../services/date-range-resolver';
import {
  StockPeriodRow,
  StockPeriodService,
} from '../../services/stock-period.service';
import {
  InventoryReportColumnsFilterDto,
  InventoryReportDefinition,
} from '../inventory-report-definition';
import {
  buildInventoryHeaders,
  InventoryColumnDef,
} from '../inventory-report-column.util';
import { CountedRows } from '../../../reporting/report-core/report-definition';
import { toEngineFilters } from '../report-column-mapper.util';
import {
  assertKnownColumns,
  projectRows,
  toTotalsRow,
} from '../report-data.util';
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import {
  resolveInventoryBranchIds,
  resolveWarehouseLocationIds,
  resolveDescendantCategoryIds,
} from '../report-scope.util';

const { STRING, NUMBER } = ReportColumnDataType;

const COLUMNS: InventoryColumnDef[] = [
  { key: 'sku', type: STRING, width: 140 },
  { key: 'name', type: STRING, width: 220 },
  { key: 'parentSku', type: STRING, width: 140 },
  { key: 'parentName', type: STRING, width: 150 },
  { key: 'color', type: STRING, width: 100 },
  { key: 'size', type: STRING, width: 80 },
  { key: 'unit', type: STRING, width: 110 },
  { key: 'group', type: STRING, width: 140 },
  { key: 'brand', type: STRING, width: 120 },
  { key: 'openingQty', type: NUMBER, width: 110 },
  { key: 'inTotal', type: NUMBER, band: 'in', width: 100 },
  { key: 'inPurchase', type: NUMBER, band: 'in', width: 110 },
  { key: 'inTransfer', type: NUMBER, band: 'in', width: 120 },
  { key: 'inReturn', type: NUMBER, band: 'in', width: 120 },
  // No movement subtype backs this column yet: toRow hard-codes null (ADR-05).
  { key: 'inWh', type: NUMBER, filterKind: 'none', band: 'in', width: 110 },
  { key: 'inAdjust', type: NUMBER, band: 'in', width: 110 },
  // No movement subtype backs this column yet: toRow hard-codes null (ADR-05).
  { key: 'inOther', type: NUMBER, filterKind: 'none', band: 'in', width: 100 },
  { key: 'outTotal', type: NUMBER, band: 'out', width: 100 },
  { key: 'outSale', type: NUMBER, band: 'out', width: 110 },
  { key: 'outTransfer', type: NUMBER, band: 'out', width: 120 },
  // No movement subtype backs this column yet: toRow hard-codes null (ADR-05).
  { key: 'outPurchaseReturn', type: NUMBER, filterKind: 'none', band: 'out', width: 140 },
  // No movement subtype backs this column yet: toRow hard-codes null (ADR-05).
  { key: 'outWh', type: NUMBER, filterKind: 'none', band: 'out', width: 110 },
  { key: 'outAdjust', type: NUMBER, band: 'out', width: 110 },
  // No movement subtype backs this column yet: toRow hard-codes null (ADR-05).
  { key: 'outVoid', type: NUMBER, filterKind: 'none', band: 'out', width: 110 },
  // No movement subtype backs this column yet: toRow hard-codes null (ADR-05).
  { key: 'outOther', type: NUMBER, filterKind: 'none', band: 'out', width: 100 },
  { key: 'endingQty', type: NUMBER, width: 120 },
];

const CATALOG_KEYS = new Set(COLUMNS.map((c) => c.key));

/**
 * Report column key → the field `StockPeriodService` knows it by (ADR-03).
 *
 * Six columns are missing on purpose — `inWh`, `inOther`, `outPurchaseReturn`,
 * `outWh`, `outVoid`, `outOther`. `toRow` assigns them `null` because no
 * movement subtype backs them yet, so there is nothing to filter on and no SQL
 * expression to point at. Filtering one answers 400, which is a better answer
 * than an empty page that looks filtered.
 */
const KEY_MAP = {
  name: 'itemName',
  group: 'categoryName',
  inTotal: 'inQty',
  inPurchase: 'inQtyPurchase',
  inTransfer: 'inQtyTransferIn',
  inReturn: 'inQtyReturn',
  inAdjust: 'inQtyAdjustIn',
  outTotal: 'outQty',
  outSale: 'outQtySale',
  outTransfer: 'outQtyTransferOut',
  outAdjust: 'outQtyAdjustOut',
  endingQty: 'closingQty',
} as const;

/** "Chi tiết số lượng nhập xuất tồn kho" — quantities with IN/OUT breakdown. */
/**
 * Columns the aggregate grains leave empty, and so cannot filter on (ADR-07).
 *
 * The parent and group grains re-aggregate in SQL and select NULL for every
 * identity column they cannot speak for: a row spanning a whole product model
 * has no single colour, and one spanning a category has no single SKU. Drawing
 * a filter box over them answers 400. The lists are measured against real data
 * — see `evidence/probe-aggregate-grain-columns.txt` — not guessed from the SQL.
 *
 * The `item` grain fills everything, so it is absent.
 */
const UNFILLED_BY_GRAIN: Record<'parent' | 'group', ReadonlySet<string>> = {
  parent: new Set(['parentSku', 'parentName', 'color', 'size', 'unit', 'group', 'brand']),
  group: new Set(['sku', 'parentSku', 'parentName', 'color', 'size', 'unit', 'brand']),
};

/** The unfilled set for one grain; the item grain fills everything. */
function unfilledAt(statBy: string | undefined): ReadonlySet<string> {
  return statBy === 'parent' || statBy === 'group'
    ? UNFILLED_BY_GRAIN[statBy]
    : new Set();
}

@Injectable()
export class StockQuantityDetailReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.STOCK_QUANTITY_DETAIL;

  constructor(
    private readonly stockPeriod: StockPeriodService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(LocationEntity)
    private readonly locations: Repository<LocationEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
  ) {}

  buildColumns(
    _actor: ActorContext,
    filters?: InventoryReportColumnsFilterDto,
  ): Promise<ReportColumnHeader[]> {
    return Promise.resolve(
      buildInventoryHeaders(this.key, COLUMNS, ['sku'], unfilledAt(filters?.statBy)),
    );
  }

  async buildData(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<InventoryReportResult> {
    assertKnownColumns(dto, CATALOG_KEYS);
    const scope = await this.scopedQuery(dto, actor);

    const result = await this.stockPeriod.aggregate({
      ...scope,
      page: dto.page ?? 1,
      pageSize: dto.limit ?? 20,
    });

    return {
      rows: projectRows(result.data.map((r) => this.toRow(r)), dto.columns),
      totals: toTotalsRow(dto.columns, result.totals, KEY_MAP),
      total: result.total,
    };
  }

  /** Whole-set count for the export path's cap check (ADR-01). */
  async countRows(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<CountedRows> {
    const scope = await this.scopedQuery(dto, actor);
    const result = await this.stockPeriod.aggregate({
      ...scope,
      page: 1,
      pageSize: 1,
    });
    return { total: result.total, subject: 'rows' };
  }

  /** Shared by buildData and countRows so the two can never disagree. */
  private async scopedQuery(dto: InventoryReportSearchDto, actor: ActorContext) {
    const filters = dto.filters;
    const period = resolvePeriod({
      preset: filters.period?.from || filters.period?.to ? undefined : filters.preset,
      startDate: filters.period?.from,
      endDate: filters.period?.to,
    });
    const [branchIds, locationIds] = await Promise.all([
      resolveInventoryBranchIds(this.branches, filters.store, actor),
      resolveWarehouseLocationIds(
        this.locations,
        filters.warehouseIds,
        actor.organizationId,
      ),
    ]);

    return {
      organizationId: actor.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      groupBy: 'item_location' as const,
      itemGroupBy: filters.statBy,
      branchIds,
      locationIds,
      // A parent group holds no items of its own — only its leaves do — so the
      // filter has to carry the whole subtree (ADR-01).
      categoryIds: await resolveDescendantCategoryIds(
        this.categories,
        filters.categoryId,
        actor.organizationId,
      ),
      search: filters.search,
      includeBreakdown: true,
      hideZeroRows: filters.hideZeroRows ?? true,
      columnFilters: toEngineFilters(dto.columnFilters, KEY_MAP, {
        unit: filters.unit,
        brand: filters.brand,
      }),
    };
  }

  private toRow(r: StockPeriodRow): ReportRow {
    return {
      sku: r.sku,
      name: r.itemName,
      parentSku: r.parentSku,
      parentName: r.parentName,
      color: r.color ?? null,
      size: r.size ?? null,
      unit: r.unit,
      group: r.categoryName,
      brand: r.brand ?? null,
      openingQty: r.openingQty,
      inTotal: r.inQty,
      inPurchase: r.inQtyPurchase ?? 0,
      inTransfer: r.inQtyTransferIn ?? 0,
      inReturn: r.inQtyReturn ?? 0,
      // No backing movement subtype today — null, not a fake zero.
      inWh: null,
      inAdjust: r.inQtyAdjustIn ?? 0,
      inOther: null,
      outTotal: r.outQty,
      outSale: r.outQtySale ?? 0,
      outTransfer: r.outQtyTransferOut ?? 0,
      outPurchaseReturn: null,
      outWh: null,
      outAdjust: r.outQtyAdjustOut ?? 0,
      outVoid: null,
      outOther: null,
      endingQty: r.closingQty,
    };
  }
}
