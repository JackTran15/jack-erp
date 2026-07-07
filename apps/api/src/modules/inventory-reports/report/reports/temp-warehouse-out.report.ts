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
  numericKeys,
} from '../inventory-report-column.util';
import {
  applyColumnFilters,
  assertKnownColumns,
  assertUnderRowCap,
  buildTotalsRow,
  MAX_REPORT_ROWS,
  paginateRows,
} from '../report-data.util';
import { resolveInventoryBranchIds } from '../report-scope.util';

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
const NUMERIC = numericKeys(COLUMNS);

/** "Hàng hóa xuất kho tạm" — one row per matched issue↔return pair. */
@Injectable()
export class TempWarehouseOutReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.TEMP_WAREHOUSE_OUT;

  constructor(
    private readonly tempWarehouse: TempWarehouseReportService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
  ) {}

  buildColumns(): Promise<ReportColumnHeader[]> {
    return Promise.resolve(buildInventoryHeaders(this.key, COLUMNS, ['sku']));
  }

  async buildData(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<InventoryReportResult> {
    assertKnownColumns(dto, CATALOG_KEYS);
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

    const result = await this.tempWarehouse.list({
      organizationId: actor.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      branchIds,
      categoryIds: filters.categoryId ? [filters.categoryId] : undefined,
      search: filters.search,
      page: 1,
      pageSize: MAX_REPORT_ROWS,
    });
    assertUnderRowCap(result.total);

    let rows = result.data.map((r) => this.toRow(r));
    rows = applyColumnFilters(rows, dto.columnFilters);

    return {
      rows: paginateRows(rows, dto.columns, dto.page ?? 1, dto.limit ?? 20),
      totals: buildTotalsRow(dto.columns, rows, NUMERIC),
      total: rows.length,
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
