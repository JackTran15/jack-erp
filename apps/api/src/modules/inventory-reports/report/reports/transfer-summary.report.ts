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
  TransferReportService,
  TransferSummaryRow,
} from '../../services/transfer-report.service';
import { InventoryReportDefinition } from '../inventory-report-definition';
import {
  buildInventoryHeaders,
  InventoryColumnDef,
  numericKeys,
} from '../inventory-report-column.util';
import {
  applyColumnFilters,
  assertKnownColumns,
  buildTotalsRow,
  paginateRows,
} from '../report-data.util';
import { resolveInventoryBranchIds } from '../report-scope.util';

const { STRING, NUMBER } = ReportColumnDataType;

const COLUMNS: InventoryColumnDef[] = [
  { key: 'branchCode', type: STRING, width: 130 },
  { key: 'branchName', type: STRING, width: 220 },
  { key: 'inQty', type: NUMBER, band: 'in', width: 110 },
  { key: 'inValue', type: NUMBER, band: 'in', width: 130 },
  { key: 'outQty', type: NUMBER, band: 'out', width: 110 },
  { key: 'outValue', type: NUMBER, band: 'out', width: 130 },
  { key: 'receivedQty', type: NUMBER, band: 'received', width: 110 },
  { key: 'receivedValue', type: NUMBER, band: 'received', width: 130 },
  { key: 'diffQty', type: NUMBER, band: 'diff', width: 110 },
  { key: 'diffValue', type: NUMBER, band: 'diff', width: 130 },
  { key: 'inOutDiffQty', type: NUMBER, band: 'inOutDiff', width: 110 },
  { key: 'inOutDiffValue', type: NUMBER, band: 'inOutDiff', width: 130 },
];

const CATALOG_KEYS = new Set(COLUMNS.map((c) => c.key));
const NUMERIC = numericKeys(COLUMNS);

/** "Tổng hợp nhập xuất điều chuyển" — one row per branch with transfer totals. */
@Injectable()
export class TransferSummaryReport implements InventoryReportDefinition {
  readonly key = INVENTORY_REPORT_KEYS.TRANSFER_SUMMARY;

  constructor(
    private readonly transferReport: TransferReportService,
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
  ) {}

  buildColumns(): Promise<ReportColumnHeader[]> {
    return Promise.resolve(
      buildInventoryHeaders(this.key, COLUMNS, ['branchCode']),
    );
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

    const result = await this.transferReport.summarize({
      organizationId: actor.organizationId,
      startDate: period.startDate,
      endDate: period.endDate,
      branchIds,
    });

    let rows = result.data.map((r) => this.toRow(r));
    rows = applyColumnFilters(rows, dto.columnFilters);

    return {
      rows: paginateRows(rows, dto.columns, dto.page ?? 1, dto.limit ?? 20),
      totals: buildTotalsRow(dto.columns, rows, NUMERIC),
      total: rows.length,
    };
  }

  private toRow(r: TransferSummaryRow): ReportRow {
    return {
      branchCode: r.branchCode,
      branchName: r.branchName,
      inQty: r.qtyIn,
      inValue: r.valueIn,
      outQty: r.qtyOut,
      outValue: r.valueOut,
      receivedQty: r.qtyReceived,
      receivedValue: r.valueReceived,
      diffQty: r.qtyDifference,
      diffValue: r.valueDifference,
      // Fixes the legacy FE adapter bug that mapped these from qtyDifference.
      inOutDiffQty: r.qtyInOutDifference,
      inOutDiffValue: r.valueInOutDifference,
    };
  }
}
