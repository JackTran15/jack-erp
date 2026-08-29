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
  resolveDescendantCategoryIds,
  resolveInventoryBranchIds,
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
  // `branches` has no code column: every query selects NULL (ADR-05).
  { key: 'branchCode', type: STRING, filterKind: 'none', width: 130 },
  { key: 'branch', type: STRING, width: 180 },
  { key: 'openingQty', type: NUMBER, band: 'opening', width: 110 },
  { key: 'openingValue', type: NUMBER, band: 'opening', width: 130 },
  { key: 'inQty', type: NUMBER, band: 'in', width: 110 },
  { key: 'inValue', type: NUMBER, band: 'in', width: 130 },
  { key: 'outQty', type: NUMBER, band: 'out', width: 110 },
  { key: 'outValue', type: NUMBER, band: 'out', width: 130 },
  { key: 'endingQty', type: NUMBER, band: 'ending', width: 110 },
  { key: 'endingValue', type: NUMBER, band: 'ending', width: 140 },
];

const CATALOG_KEYS = new Set(COLUMNS.map((c) => c.key));

/**
 * Report column key → the field `StockPeriodService` knows it by (ADR-03).
 *
 * `branchCode` is absent on purpose: `branches` has no code column, so every
 * query selects `NULL::text` for it. Filtering a column that can only ever be
 * null answers 400 instead of looking active while matching nothing.
 */
const KEY_MAP = {
  name: 'itemName',
  group: 'categoryName',
  branch: 'branchName',
  endingQty: 'closingQty',
  endingValue: 'closingValue',
} as const;

/** "Tổng hợp nhập xuất tồn kho theo cửa hàng" — one row per item × branch. */
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
  parent: new Set(['parentSku', 'parentName', 'color', 'size', 'unit', 'group', 'brand', 'branch']),
  group: new Set(['sku', 'parentSku', 'parentName', 'color', 'size', 'unit', 'brand', 'branch']),
};

/** The unfilled set for one grain; the item grain fills everything. */
function unfilledAt(statBy: string | undefined): ReadonlySet<string> {
  return statBy === 'parent' || statBy === 'group'
    ? UNFILLED_BY_GRAIN[statBy]
    : new Set();
}

@Injectable()
export class StockSummaryByStoreReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.STOCK_SUMMARY_BY_STORE;

  constructor(
    private readonly stockPeriod: StockPeriodService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
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
    const branchIds = await resolveInventoryBranchIds(
      this.branches,
      filters.store,
      actor,
    );

    return {
      organizationId: actor.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      groupBy: 'item_branch' as const,
      itemGroupBy: filters.statBy,
      branchIds,
      // A parent group holds no items of its own — only its leaves do — so the
      // filter has to carry the whole subtree (ADR-01).
      categoryIds: await resolveDescendantCategoryIds(
        this.categories,
        filters.categoryId,
        actor.organizationId,
      ),
      search: filters.search,
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
      // branches has no code column (see transfer-report.service.ts).
      branchCode: r.branchCode,
      branch: r.branchName,
      openingQty: r.openingQty,
      openingValue: r.openingValue,
      inQty: r.inQty,
      inValue: r.inValue,
      outQty: r.outQty,
      outValue: r.outValue,
      endingQty: r.closingQty,
      endingValue: r.closingValue,
    };
  }
}
