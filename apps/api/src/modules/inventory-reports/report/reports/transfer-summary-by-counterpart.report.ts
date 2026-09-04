import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  INVENTORY_REPORT_KEYS,
  InventoryReportResult,
  ReportColumnDataType,
  ReportColumnHeader,
  REPORT_ROW_BRANCH_ID,
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
import { CountedRows } from '../../../reporting/report-core/report-definition';
import { assertKnownColumns, projectRows, toTotalsRow } from '../report-data.util';
import { resolveInventoryBranchIds } from '../report-scope.util';

const { STRING, NUMBER } = ReportColumnDataType;

/**
 * The same 12 columns and 5 bands as `inventory-transfer-summary`. The dialog
 * IS that report, re-run for one anchor branch, so its footer has to line up
 * with the row that opened it — a different column set would quietly break the
 * comparison a user is making by eye.
 */
const COLUMNS: InventoryColumnDef[] = [
  { key: 'branchCode', type: STRING, width: 130 },
  { key: 'branchName', type: STRING, width: 220 },
  { key: 'inQty', type: NUMBER, link: true, band: 'in', width: 110 },
  { key: 'inValue', type: NUMBER, band: 'in', width: 130 },
  { key: 'outQty', type: NUMBER, link: true, band: 'out', width: 110 },
  { key: 'outValue', type: NUMBER, band: 'out', width: 130 },
  { key: 'receivedQty', type: NUMBER, link: true, band: 'received', width: 110 },
  { key: 'receivedValue', type: NUMBER, band: 'received', width: 130 },
  { key: 'diffQty', type: NUMBER, link: true, band: 'diff', width: 110 },
  { key: 'diffValue', type: NUMBER, band: 'diff', width: 130 },
  { key: 'inOutDiffQty', type: NUMBER, band: 'inOutDiff', width: 110 },
  { key: 'inOutDiffValue', type: NUMBER, band: 'inOutDiff', width: 130 },
];

const CATALOG_KEYS = new Set(COLUMNS.map((c) => c.key));
const NUMERIC = numericKeys(COLUMNS);

/** Report field → the engine's totals key. */
const KEY_MAP: Record<string, string> = {
  inQty: 'qtyIn',
  inValue: 'valueIn',
  outQty: 'qtyOut',
  outValue: 'valueOut',
  receivedQty: 'qtyReceived',
  receivedValue: 'valueReceived',
  diffQty: 'qtyDifference',
  diffValue: 'valueDifference',
  inOutDiffQty: 'qtyInOutDifference',
  inOutDiffValue: 'valueInOutDifference',
};

/**
 * "Chi tiết nhập xuất điều chuyển theo cửa hàng" — L1 of the drill-down.
 *
 * Dialog-only: it is deliberately absent from `STORAGE_REPORTS` on the client,
 * so it never appears in the report picker. It is reached by clicking a branch
 * name on `inventory-transfer-summary`.
 *
 * The anchor branch arrives as `filters.store` with exactly one id, which buys
 * the existing 403/400 clamping in `resolveInventoryBranchIds` for free rather
 * than re-implementing scope checks here.
 */
@Injectable()
export class TransferSummaryByCounterpartReport
  implements InventoryReportDefinition
{
  readonly key = INVENTORY_REPORT_KEYS.TRANSFER_SUMMARY_BY_COUNTERPART;

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
    const scope = await this.resolveScope(dto, actor);

    const result = await this.transferReport.summarizeByCounterpart({
      organizationId: actor.organizationId,
      startDate: scope.startDate,
      endDate: scope.endDate,
      branchId: scope.branchId,
      page: dto.page ?? 1,
      pageSize: dto.limit ?? 20,
    });

    // `_branchId` is attached AFTER projection on purpose: `projectRows` keeps
    // only the requested catalog columns, so anything added before it is lost.
    // The drill-down needs a stable key and neither rendered column is one —
    // `branchCode` is nullable and blank on at least one real branch, and
    // `branchName` is not unique by contract.
    const projected = projectRows(
      result.data.map((r) => this.toRow(r)),
      dto.columns,
    );
    projected.forEach((row, i) => {
      row[REPORT_ROW_BRANCH_ID] = result.data[i]!.branchId;
    });

    return {
      rows: projected,
      // 4th arg is the NON-additive set, not the numeric one. Passing the
      // numeric columns nulls exactly the cells that should carry a total.
      totals: toTotalsRow(dto.columns, result.totals, KEY_MAP),
      total: result.total,
    };
  }

  /** Whole-set count for the export path's cap check. */
  async countRows(
    dto: InventoryReportSearchDto,
    actor: ActorContext,
  ): Promise<CountedRows> {
    const scope = await this.resolveScope(dto, actor);
    const result = await this.transferReport.summarizeByCounterpart({
      organizationId: actor.organizationId,
      startDate: scope.startDate,
      endDate: scope.endDate,
      branchId: scope.branchId,
      page: 1,
      pageSize: 1,
    });
    return { total: result.total, subject: 'rows' };
  }

  /**
   * Period plus the anchor branch.
   *
   * Lives here rather than in `buildData` so `countRows` — reached from the
   * export path — cannot skip the permission check.
   */
  private async resolveScope(dto: InventoryReportSearchDto, actor: ActorContext) {
    const filters = dto.filters;
    const period = resolvePeriod({
      preset: filters.period?.from || filters.period?.to ? undefined : filters.preset,
      startDate: filters.period?.from,
      endDate: filters.period?.to,
    });

    // Throws 403 for a branch outside the actor's scope, 400 for one outside
    // the organization — the same rules every other inventory report follows.
    const branchIds = await resolveInventoryBranchIds(
      this.branches,
      filters.store,
      actor,
    );

    // The dialog is always opened from a single row, so anything other than one
    // branch is a caller bug, not user input worth accommodating.
    if (!branchIds || branchIds.length !== 1) {
      throw new BadRequestException(
        'filters.store must resolve to exactly one branch for this report',
      );
    }

    return { ...period, branchId: branchIds[0]! };
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
      inOutDiffQty: r.qtyInOutDifference,
      inOutDiffValue: r.valueInOutDifference,
    };
  }
}
