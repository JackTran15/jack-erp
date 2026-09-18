import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CASH_FUND_REPORT_KEYS,
  CASH_FUND_ROW_KEYS,
  CashFundTimeBucket,
  InvoiceReportResult,
  ReportCellValue,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../../rbac/rbac.service';
import { matchColumnFilter } from '../../report-core/column-filter.util';
import { resolveReportBranchIds } from '../../report-core/report-query.util';
import { CashFundReportSearchDto } from '../dto/cash-fund-report-search.dto';
import { CASH_CONSOLIDATED, ReportDefinition, cashFundColumn } from '../report-definition';
import { round2 } from '../services/cash-fund-period.service';
import { voucherLinesSql } from '../services/cash-fund-voucher.sql';
import { ExpenseLinesQuery } from '../services/expense-lines.query';

const DEFAULT_BUCKET: CashFundTimeBucket = 'day';

interface BucketRow {
  /** Display label: `dd/MM/yyyy`, `Tuần ww/yyyy`, `MM/yyyy`, `Qn/yyyy`, `yyyy`. */
  bucket: string;
  /** ISO dates of the bucket, clamped to the requested period (drill-down range). */
  bucketFrom: string;
  bucketTo: string;
  amount: number;
}

/**
 * "Chi tiền theo thời gian" — Σ of expense lines per `date_trunc(bucket, doc_date)`
 * (AC-16), optionally restricted to some mục chi (AC-17). Same line source as
 * "Chi tiền theo mục chi" (`ExpenseLinesQuery`, A-12): purchase / supplier
 * payments never count, reversals cancel out. Empty buckets have no row; the
 * hidden `bucketFrom` / `bucketTo` of a row is the period the drill-down into
 * "Bảng kê tiền chi theo mục chi" opens with, never wider than the report's own.
 * Weeks are ISO weeks (Monday start), which is what `date_trunc('week')` does.
 */
@Injectable()
export class ExpensesByTimeReport implements ReportDefinition {
  readonly key = CASH_FUND_REPORT_KEYS.EXPENSES_BY_TIME;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly lines: ExpenseLinesQuery,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(): Promise<ReportColumnHeader[]> {
    return [
      cashFundColumn('bucket', ReportColumnDataType.STRING, { link: true }),
      cashFundColumn('amount', ReportColumnDataType.CURRENCY),
    ];
  }

  async buildData(dto: CashFundReportSearchDto, actor: ActorContext): Promise<InvoiceReportResult> {
    const period = dto.filters.period;
    if (!period?.from || !period?.to) {
      throw new BadRequestException('filters.period.from/to is required');
    }
    if (period.from > period.to) {
      throw new BadRequestException('filters.period.from must not be after filters.period.to');
    }
    const { from, to } = period;
    const unit = dto.filters.timeBucket ?? DEFAULT_BUCKET;

    const hasConsolidated = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      CASH_CONSOLIDATED,
    );
    const branchIds = resolveReportBranchIds(
      hasConsolidated,
      undefined,
      dto.filters.branchId ?? actor.branchId ?? undefined,
      actor,
    );
    const scope = { organizationId: actor.organizationId, branchIds };

    const { where, params } = this.lines.whereClause(scope, from, to, dto.filters.categoryIds);
    params.push(unit);
    const bucketParam = `$${params.length}::text`;
    // `doc_date` is a plain date; truncating it as a naive timestamp keeps the
    // result independent of the session time zone, and `::text` hands back
    // `YYYY-MM-DD` without the driver's Date conversion.
    const sums = (await this.dataSource.query(
      `SELECT date_trunc(${bucketParam}, v.doc_date::timestamp)::date::text AS bucket_start,
              COALESCE(SUM(v.amount), 0) AS amount
         FROM (${voucherLinesSql()}) v
        WHERE ${where}
        GROUP BY 1
        ORDER BY 1 ASC`,
      params,
    )) as { bucket_start: string; amount: unknown }[];

    const all: BucketRow[] = sums
      .map((s) => ({ start: s.bucket_start, amount: round2(Number(s.amount ?? 0) || 0) }))
      .filter((s) => s.amount !== 0)
      .map((s) => ({
        bucket: bucketLabel(unit, s.start),
        bucketFrom: s.start < from ? from : s.start,
        bucketTo: clampMax(bucketEnd(unit, s.start), to),
        amount: s.amount,
      }));

    const filtered = dto.columnFilters?.length
      ? all.filter((r) =>
          dto.columnFilters!.every((f) => matchColumnFilter(cellValue(r, f.col), f)),
        )
      : all;

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const offset = (page - 1) * limit;
    const rows: ReportRow[] = filtered.slice(offset, offset + limit).map((r) => ({
      bucket: r.bucket,
      amount: r.amount,
      [CASH_FUND_ROW_KEYS.BUCKET_FROM]: r.bucketFrom,
      [CASH_FUND_ROW_KEYS.BUCKET_TO]: r.bucketTo,
      [CASH_FUND_ROW_KEYS.ROW_KIND]: 'detail',
      [CASH_FUND_ROW_KEYS.BOLD]: 0,
      [CASH_FUND_ROW_KEYS.INDENT_LEVEL]: 0,
    }));

    return {
      rows,
      totals: { amount: round2(filtered.reduce((sum, r) => sum + r.amount, 0)) },
      total: filtered.length,
    };
  }
}

function cellValue(row: BucketRow, col: string): ReportCellValue {
  switch (col) {
    case 'bucket':
      return row.bucket;
    case 'amount':
      return row.amount;
    default:
      return null;
  }
}

const clampMax = (a: string, b: string): string => (a > b ? b : a);
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD` → UTC midnight; all bucket arithmetic is calendar-only, so UTC keeps it DST-free. */
const parseIso = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date): string => d.toISOString().slice(0, 10);

/** Label of the bucket that starts on `start` (a `date_trunc` result, so already aligned). */
export function bucketLabel(unit: CashFundTimeBucket, start: string): string {
  const d = parseIso(start);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  switch (unit) {
    case 'day':
      return `${pad2(d.getUTCDate())}/${pad2(m)}/${y}`;
    case 'week': {
      const { week, year } = isoWeek(d);
      return `Tuần ${pad2(week)}/${year}`;
    }
    case 'month':
      return `${pad2(m)}/${y}`;
    case 'quarter':
      return `Q${Math.floor((m - 1) / 3) + 1}/${y}`;
    case 'year':
      return String(y);
  }
}

/** Last day (ISO) of the bucket that starts on `start`. */
export function bucketEnd(unit: CashFundTimeBucket, start: string): string {
  const d = parseIso(start);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (unit) {
    case 'day':
      return start;
    case 'week':
      return toIso(new Date(Date.UTC(y, m, d.getUTCDate() + 6)));
    case 'month':
      return toIso(new Date(Date.UTC(y, m + 1, 0)));
    case 'quarter':
      return toIso(new Date(Date.UTC(y, m + 3, 0)));
    case 'year':
      return `${y}-12-31`;
  }
}

/** ISO-8601 week number and week-based year (a late-December Monday can be week 1 of next year). */
function isoWeek(d: Date): { week: number; year: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Shift to the Thursday of this ISO week: its calendar year is the ISO week-year.
  const dayOfWeek = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayOfWeek);
  const year = t.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((t.getTime() - jan1) / 86_400_000 + 1) / 7);
  return { week, year };
}
