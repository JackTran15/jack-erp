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
import { InventoryReportDefinition } from '../inventory-report-definition';
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
import {
  resolveInventoryBranchIds,
  resolveWarehouseLocationIds,
} from '../report-scope.util';

const { STRING, NUMBER } = ReportColumnDataType;

const COLUMNS: InventoryColumnDef[] = [
  { key: 'name', type: STRING, width: 240 },
  { key: 'parentSku', type: STRING, width: 140 },
  { key: 'parentName', type: STRING, width: 160 },
  { key: 'color', type: STRING, width: 100 },
  { key: 'size', type: STRING, width: 80 },
  { key: 'unit', type: STRING, width: 110 },
  { key: 'group', type: STRING, width: 140 },
  { key: 'brand', type: STRING, width: 120 },
  { key: 'sku', type: STRING, width: 140 },
  { key: 'positionCode', type: STRING, width: 110 },
  { key: 'positionName', type: STRING, width: 110 },
  { key: 'openingQty', type: NUMBER, band: 'opening', width: 110 },
  { key: 'openingValue', type: NUMBER, band: 'opening', width: 130 },
  { key: 'inQty', type: NUMBER, band: 'in', width: 110 },
  { key: 'inValue', type: NUMBER, band: 'in', width: 130 },
  { key: 'outQty', type: NUMBER, band: 'out', width: 110 },
  { key: 'outValue', type: NUMBER, band: 'out', width: 130 },
  { key: 'endingQty', type: NUMBER, band: 'ending', width: 110 },
  { key: 'endingValue', type: NUMBER, band: 'ending', width: 140 },
  { key: 'transferOutQty', type: NUMBER, band: 'transferOut', width: 110 },
  { key: 'transferOutValue', type: NUMBER, band: 'transferOut', width: 130 },
  { key: 'incomingQty', type: NUMBER, band: 'incoming', width: 110 },
  { key: 'incomingValue', type: NUMBER, band: 'incoming', width: 130 },
  { key: 'supplier', type: STRING, width: 160 },
];

const CATALOG_KEYS = new Set(COLUMNS.map((c) => c.key));

/**
 * Report column key → the field `StockPeriodService` knows it by (ADR-03).
 *
 * Only the disagreements are listed; everything else matches by name — including
 * `supplier` and the four transfer columns, which UOW-03 gave SQL expressions of
 * their own. Every column in the catalog now filters under SQL.
 */
const KEY_MAP = {
  name: 'itemName',
  group: 'categoryName',
  positionCode: 'locationCode',
  positionName: 'locationName',
  endingQty: 'closingQty',
  endingValue: 'closingValue',
} as const;

/** "Tổng hợp nhập xuất tồn kho" — one row per item × location over a period. */
@Injectable()
export class StockSummaryReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.STOCK_SUMMARY;

  constructor(
    private readonly stockPeriod: StockPeriodService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(LocationEntity)
    private readonly locations: Repository<LocationEntity>,
  ) {}

  buildColumns(): Promise<ReportColumnHeader[]> {
    return Promise.resolve(
      buildInventoryHeaders(this.key, COLUMNS, ['name']),
    );
  }

  async buildData(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<InventoryReportResult> {
    assertKnownColumns(dto, CATALOG_KEYS);
    const scope = await this.scopedQuery(dto, actor);

    // Filtering, counting, totalling and paging all happen in SQL. This used to
    // pull the entire result set into memory to do the same four things, which
    // is what made a 74k-row organisation answer 400 for a 50-row page.
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

  /**
   * Row count for the whole set, without reading a row.
   *
   * `ReportExportService` only enforces the row cap for definitions that offer
   * this; without it, removing `assertUnderRowCap` from `buildData` would leave
   * the export path with nothing guarding it (ADR-01).
   */
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

  /**
   * The engine query for one request, minus paging.
   *
   * `buildData` and `countRows` both build on this, so a count can never
   * describe a different period, scope or filter than the rows it counts.
   */
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
      categoryIds: filters.categoryId ? [filters.categoryId] : undefined,
      search: filters.search,
      hideZeroRows: filters.hideZeroRows ?? true,
      // The unit/brand dropdowns used to filter the materialised rows in JS.
      // Left there, they would now filter only the page in view (ADR-06).
      columnFilters: toEngineFilters(dto.columnFilters, KEY_MAP, {
        unit: filters.unit,
        brand: filters.brand,
      }),
    };
  }

  private toRow(r: StockPeriodRow): ReportRow {
    return {
      name: r.itemName,
      parentSku: r.parentSku,
      parentName: r.parentName,
      color: r.color ?? null,
      size: r.size ?? null,
      unit: r.unit,
      group: r.categoryName,
      brand: r.brand ?? null,
      sku: r.sku,
      positionCode: r.locationCode ?? null,
      positionName: r.locationName ?? null,
      openingQty: r.openingQty,
      openingValue: r.openingValue,
      inQty: r.inQty,
      inValue: r.inValue,
      outQty: r.outQty,
      outValue: r.outValue,
      endingQty: r.closingQty,
      endingValue: r.closingValue,
      transferOutQty: r.transferOutQty,
      transferOutValue: r.transferOutValue,
      incomingQty: r.incomingQty,
      incomingValue: r.incomingValue,
      supplier: r.supplier ?? null,
    };
  }
}
