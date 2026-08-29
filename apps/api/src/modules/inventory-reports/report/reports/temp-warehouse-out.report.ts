import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  INVENTORY_REPORT_KEYS,
  InventoryReportResult,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
  TEMP_WAREHOUSE_OUT_STATUS_OPTIONS,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../../branch/branch.entity';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { resolvePeriod } from '../../services/date-range-resolver';
import {
  TempWarehouseIssueRow,
  TempWarehouseReportService,
} from '../../services/temp-warehouse-report.service';
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
import { ItemCategoryEntity } from '../../../inventory/location/item-category.entity';
import {
  resolveDescendantCategoryIds,
  resolveInventoryBranchIds,
} from '../report-scope.util';

const { STRING, NUMBER, DATE } = ReportColumnDataType;

const COLUMNS: InventoryColumnDef[] = [
  { key: 'sku', type: STRING, width: 140 },
  { key: 'name', type: STRING, width: 220 },
  { key: 'unit', type: STRING, width: 100 },
  { key: 'location', type: STRING, width: 120 },
  { key: 'date', type: DATE, width: 130 },
  { key: 'time', type: STRING, width: 120 },
  { key: 'staff', type: STRING, width: 160 },
  { key: 'outQty', type: NUMBER, width: 90 },
  { key: 'returnQty', type: NUMBER, width: 90 },
  { key: 'saleQty', type: NUMBER, width: 90 },
  { key: 'remainingQty', type: NUMBER, width: 90 },
  {
    key: 'status',
    type: STRING,
    width: 170,
    filterKind: 'select',
    filterOptions: TEMP_WAREHOUSE_OUT_STATUS_OPTIONS,
  },
  { key: 'invoice', type: STRING, width: 130 },
];

const CATALOG_KEYS = new Set(COLUMNS.map((c) => c.key));

/**
 * Report column key → engine field name (ADR-03).
 *
 * Empty because this report's catalog and `TempWarehouseIssueRow` already agree
 * on all thirteen names — which is exactly why it went first: it exercises the
 * pushdown machinery without any SQL of its own to get wrong. Declared rather
 * than omitted so the next reader can see the match was checked, not assumed.
 */
const KEY_MAP = {};

/** "Hàng hóa xuất kho tạm" — one row per matched issue↔return pair. */
@Injectable()
export class TempWarehouseOutReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.TEMP_WAREHOUSE_OUT;

  constructor(
    private readonly tempWarehouse: TempWarehouseReportService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
  ) {}

  buildColumns(): Promise<ReportColumnHeader[]> {
    return Promise.resolve(buildInventoryHeaders(this.key, COLUMNS, ['sku']));
  }

  async buildData(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<InventoryReportResult> {
    assertKnownColumns(dto, CATALOG_KEYS);
    const scope = await this.scopedQuery(dto, actor);

    // Filtering, counting, totalling and paging all happen in SQL now. The
    // definition's job is down to naming columns and shaping the envelope.
    const result = await this.tempWarehouse.list({
      ...scope,
      page: dto.page ?? 1,
      pageSize: dto.limit ?? 20,
      columnFilters: toEngineFilters(dto.columnFilters, KEY_MAP),
    });

    return {
      rows: projectRows(result.data.map((r) => this.toRow(r)), dto.columns),
      totals: toTotalsRow(dto.columns, result.totals, KEY_MAP),
      total: result.total,
    };
  }

  /**
   * Row count for the whole set, without loading a single row.
   *
   * The export path is the only caller. It has to reject an oversized workbook
   * before the sink writes a byte, and `ReportExportService` will only enforce
   * the cap for definitions that offer this method — so removing
   * `assertUnderRowCap` from `buildData` without adding it here would leave the
   * export path with nothing guarding it at all (ADR-01).
   */
  async countRows(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<CountedRows> {
    const scope = await this.scopedQuery(dto, actor);
    const result = await this.tempWarehouse.list({
      ...scope,
      page: 1,
      pageSize: 1,
      columnFilters: toEngineFilters(dto.columnFilters, KEY_MAP),
    });
    return { total: result.total, subject: 'rows' };
  }

  /**
   * Period and branch scope for one request, shared by `buildData` and
   * `countRows` so the count can never describe a different set than the rows.
   */
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
      branchIds,
      // A parent group holds no items of its own — only its leaves do — so the
      // filter has to carry the whole subtree (ADR-01).
      categoryIds: await resolveDescendantCategoryIds(
        this.categories,
        filters.categoryId,
        actor.organizationId,
      ),
      search: filters.search,
    };
  }

  private toRow(r: TempWarehouseIssueRow): ReportRow {
    return {
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      location: r.location,
      date: r.date,
      time: r.time,
      staff: r.staff,
      outQty: r.outQty,
      returnQty: r.returnQty,
      saleQty: r.saleQty,
      remainingQty: r.remainingQty,
      status: r.status,
      invoice: r.invoice,
    };
  }
}
