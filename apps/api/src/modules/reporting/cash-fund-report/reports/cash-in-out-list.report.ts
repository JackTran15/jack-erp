import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CASH_FUND_DOCUMENT_KIND_LABELS_VI,
  CASH_FUND_KIND_LABELS_VI,
  CASH_FUND_REPORT_KEYS,
  CASH_FUND_ROW_KEYS,
  CashFundDocumentKind,
  CashFundKind,
  ColumnFilter,
  InvoiceReportResult,
  REPORT_ROW_INVOICE_ID,
  ReportColumnDataType,
  ReportColumnHeader,
  ReportFilterOption,
  ReportRow,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../../rbac/rbac.service';
import { hasTextOperator } from '../../report-core/column-filter.util';
import { FetchPageArgs, FetchPageResult } from '../../report-core/export/export.types';
import { CountedRows, ReportExportSource } from '../../report-core/report-definition';
import { resolveReportBranchIds } from '../../report-core/report-query.util';
import { CashFundReportSearchDto } from '../dto/cash-fund-report-search.dto';
import { CASH_CONSOLIDATED, ReportDefinition, cashFundColumn } from '../report-definition';
import { CashFundPeriodService, round2 } from '../services/cash-fund-period.service';
import { voucherHeadersSql } from '../services/cash-fund-voucher.sql';

const DEFAULT_LIMIT = 50;

/** The 16 columns of "Bảng kê thu chi", in the order 00-intent.md #3 lists them. */
export const CASH_IN_OUT_LIST_COLUMNS = [
  'docDate',
  'documentNumber',
  'documentKind',
  'reference',
  'amountIn',
  'amountOut',
  'runningBalance',
  'paymentMethod',
  'depositAccount',
  'staffName',
  'partnerCode',
  'partnerName',
  'reason',
  'branchCode',
  'branchName',
  'invoiceNumber',
] as const;

const DOCUMENT_KIND_OPTIONS: ReportFilterOption[] = (
  Object.keys(CASH_FUND_DOCUMENT_KIND_LABELS_VI) as CashFundDocumentKind[]
).map((kind) => ({ value: kind, label: CASH_FUND_DOCUMENT_KIND_LABELS_VI[kind] }));

const PAYMENT_METHOD_OPTIONS: ReportFilterOption[] = (
  Object.keys(CASH_FUND_KIND_LABELS_VI) as CashFundKind[]
).map((kind) => ({ value: kind, label: CASH_FUND_KIND_LABELS_VI[kind] }));

/**
 * Reference types whose `reference_id` is an `invoices.id` (A-20). `REFUND` is the
 * refund payment of a returned / cancelled invoice — its reference is the invoice too.
 */
const INVOICE_REFERENCE_TYPES = [
  'INVOICE',
  'INVOICE_DEBT',
  'INVOICE_KEPT_CHANGE',
  'RETURN_CANCEL',
  'REFUND',
];

// The screen order. `document_number` before `id` so two vouchers on one day
// read in numbering order; `id` last so the order is total and paging is stable.
const ROW_ORDER = 'ORDER BY doc_date ASC, document_number ASC, id ASC';
// The export order (keyset cursor = (doc_date, id), see `exportSource`).
const KEYSET_ORDER = 'ORDER BY doc_date ASC, id ASC';

/**
 * Column key → the SQL column of the `rows` relation it filters on, and how.
 * `enum` columns are compared on the raw value the select option carries
 * (`kind` / `fund`), not on the Vietnamese label the cell shows.
 * `runningBalance` is absent on purpose: it is derived from the filtered set,
 * so a filter on it would be circular.
 */
const FILTERABLE: Record<string, { column: string; kind: 'text' | 'number' | 'date' | 'enum' }> = {
  docDate: { column: 'doc_date', kind: 'date' },
  documentNumber: { column: 'document_number', kind: 'text' },
  documentKind: { column: 'kind', kind: 'enum' },
  reference: { column: 'reference', kind: 'text' },
  amountIn: { column: 'amount_in', kind: 'number' },
  amountOut: { column: 'amount_out', kind: 'number' },
  paymentMethod: { column: 'fund', kind: 'enum' },
  depositAccount: { column: 'deposit_account', kind: 'text' },
  staffName: { column: 'staff_name', kind: 'text' },
  partnerCode: { column: 'partner_code', kind: 'text' },
  partnerName: { column: 'partner_name', kind: 'text' },
  reason: { column: 'reason', kind: 'text' },
  branchCode: { column: 'branch_code', kind: 'text' },
  branchName: { column: 'branch_name', kind: 'text' },
  invoiceNumber: { column: 'invoice_number', kind: 'text' },
};

interface RawRow {
  kind: CashFundDocumentKind;
  fund: CashFundKind;
  id: string;
  doc_date: string | Date;
  /** `doc_date::text` — the calendar date without a `Date` round-trip (T-02-07). */
  doc_date_text?: string;
  document_number: string | null;
  reference: string | null;
  amount_in: unknown;
  amount_out: unknown;
  signed: unknown;
  deposit_account: string | null;
  staff_name: string | null;
  partner_code: string | null;
  partner_name: string | null;
  reason: string | null;
  branch_code: string | null;
  branch_name: string | null;
  invoice_number: string | null;
  /** `invoices.id` behind `invoice_number` — the drill-down's unambiguous key. */
  invoice_id: string | null;
  /** Only selected by the export page query. */
  cursor_at?: string;
}

/** Everything that narrows the voucher set; the same instance feeds every query of one request. */
interface ListScope {
  organizationId: string;
  branchIds: string[] | null;
  from: string;
  to: string;
  fund?: CashFundKind;
  staffIds?: string[];
  columnFilters: ColumnFilter[];
}

/** Which slice of the voucher date line a query reads. */
type DateWindow =
  | { kind: 'period' }
  | { kind: 'before' }
  | { kind: 'partition'; from?: Date; to?: Date };

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The calendar date of a voucher, as `YYYY-MM-DD`.
 *
 * The page SQL selects `doc_date::text` so pg hands the date over as a string.
 * The `Date` branch is only a guard: pg parses a bare `date` column into a
 * local-midnight `Date`, and `toISOString()` on that rolls a +07:00 process
 * back to the previous day (T-02-07) — so read the local calendar fields,
 * never the UTC instant.
 */
const isoDate = (v: string | Date): string => {
  if (v instanceof Date) {
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${v.getFullYear()}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
};

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * "Bảng kê thu chi" — one row per posted voucher of the four tables, oldest
 * first, with a running balance (AC-08). Filters: store scope, staff, fund
 * (paymentMethod / fundKind) and the per-column filter row, all pushed into
 * SQL so the count, the totals, the opening balance and the page agree on one
 * row set (AC-10).
 *
 * Running balance is computed the way `cash-ledger.service.ts` does it:
 * opening + Σ signed of the rows before this page (SQL, `sumSignedBeforeOffset`)
 * + the running sum within the page (RAM). It differs from that ledger on one
 * point, by design (AC-10, 03-logical-design "cash-in-out-list"): the opening
 * balance is also the opening *of the filtered set*. With no staff or column
 * filter it is the real balance of the funds in scope
 * (`CashFundPeriodService.openingBalance`, deposit `opening_balance` included);
 * once such a filter is active it becomes Σ signed of the matching vouchers
 * dated before `from` (no deposit `opening_balance` — that is not a voucher
 * and cannot match a filter), so `opening + Σ page rows` stays the running
 * balance of what the user is looking at rather than a number that mixes
 * filtered rows with an unfiltered start.
 */
@Injectable()
export class CashInOutListReport implements ReportDefinition {
  readonly key = CASH_FUND_REPORT_KEYS.CASH_IN_OUT_LIST;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly period: CashFundPeriodService,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(): Promise<ReportColumnHeader[]> {
    const S = ReportColumnDataType.STRING;
    const C = ReportColumnDataType.CURRENCY;
    return [
      cashFundColumn('docDate', ReportColumnDataType.DATE, { pinned: true }),
      cashFundColumn('documentNumber', S, { pinned: true, link: true }),
      cashFundColumn('documentKind', S, { pinned: true, filterOptions: DOCUMENT_KIND_OPTIONS }),
      cashFundColumn('reference', S, { pinned: true }),
      cashFundColumn('amountIn', C),
      cashFundColumn('amountOut', C),
      cashFundColumn('runningBalance', C, { filterKind: 'none' }),
      cashFundColumn('paymentMethod', S, { filterOptions: PAYMENT_METHOD_OPTIONS }),
      cashFundColumn('depositAccount', S),
      cashFundColumn('staffName', S),
      cashFundColumn('partnerCode', S),
      cashFundColumn('partnerName', S),
      cashFundColumn('reason', S),
      cashFundColumn('branchCode', S),
      cashFundColumn('branchName', S),
      cashFundColumn('invoiceNumber', S),
    ];
  }

  async buildData(dto: CashFundReportSearchDto, actor: ActorContext): Promise<InvoiceReportResult> {
    const scope = await this.resolveScope(dto, actor);
    const page = dto.page ?? 1;
    const limit = dto.limit ?? DEFAULT_LIMIT;
    const offset = (page - 1) * limit;

    const [summary, opening, beforeOffset, pageRows] = await Promise.all([
      this.summary(scope),
      this.openingBalance(scope),
      offset > 0 ? this.sumSignedBeforeOffset(scope, offset) : Promise.resolve(0),
      this.pageRows(scope, limit, offset),
    ]);

    let running = round2(opening + beforeOffset);
    const rows: ReportRow[] = pageRows.map((r) => {
      running = round2(running + num(r.signed));
      return this.toRow(r, running);
    });
    if (page === 1) rows.unshift(this.openingRow(opening));

    const totals: ReportRow = {};
    for (const col of dto.columns) totals[col] = null;
    totals.amountIn = summary.amountIn;
    totals.amountOut = summary.amountOut;

    return { rows, totals: summary.total ? totals : null, total: summary.total };
  }

  /** Vouchers the request would list; the row cap is checked on this before anything is fetched. */
  async countRows(dto: CashFundReportSearchDto, actor: ActorContext): Promise<CountedRows> {
    const scope = await this.resolveScope(dto, actor);
    const { total } = await this.summary(scope);
    return { total, subject: 'chứng từ' };
  }

  /**
   * Keyset export (ADR-07) on `(doc_date, id)`. The cursor's `at` is the voucher
   * date as `yyyy-MM-dd` text — a `date` has no sub-day precision to lose. No
   * opening row in the file; the running balance is carried by one signed-sum
   * query per page over the rows that precede it in keyset order.
   */
  readonly exportSource: ReportExportSource<CashFundReportSearchDto> = {
    order: 'asc',
    range: (dto) => {
      const period = dto.filters?.period;
      return period?.from && period?.to ? { from: period.from, to: period.to } : null;
    },
    summable: (columns) => columns.filter((c) => c === 'amountIn' || c === 'amountOut'),
    page: (dto, actor, args) => this.exportPage(dto, actor, args),
  };

  private async exportPage(
    dto: CashFundReportSearchDto,
    actor: ActorContext,
    { partition, cursor, size }: FetchPageArgs,
  ): Promise<FetchPageResult> {
    const scope = await this.resolveScope(dto, actor);
    const window: DateWindow = { kind: 'partition', from: partition.from, to: partition.to };
    const { sql, params, p } = this.rowsSql(scope, window);
    let cursorWhere = '';
    if (cursor) {
      const at = p(cursor.at);
      cursorWhere = ` WHERE (doc_date > ${at}::date OR (doc_date = ${at}::date AND id > ${p(cursor.id)}::uuid))`;
    }
    const raw = (await this.dataSource.query(
      `SELECT r.*, r.doc_date::text AS cursor_at FROM (${sql}) r${cursorWhere} ${KEYSET_ORDER} LIMIT ${p(size)}`,
      params,
    )) as RawRow[];

    const wantsBalance = dto.columns.includes('runningBalance');
    let running = 0;
    if (wantsBalance && raw.length) {
      const first = raw[0];
      running = round2(
        (await this.openingBalance(scope)) + (await this.sumSignedBeforeKey(scope, first)),
      );
    }
    const rows = raw.map((r) => {
      running = round2(running + num(r.signed));
      return this.toRow(r, wantsBalance ? running : null);
    });
    const last = raw[raw.length - 1];
    return {
      rows,
      nextCursor: last ? { at: last.cursor_at ?? isoDate(last.doc_date), id: last.id } : null,
      hasMore: raw.length === size,
    };
  }

  private async resolveScope(dto: CashFundReportSearchDto, actor: ActorContext): Promise<ListScope> {
    const period = dto.filters.period;
    if (!period?.from || !period?.to) {
      throw new BadRequestException('filters.period.from/to is required');
    }
    if (period.from > period.to) {
      throw new BadRequestException('filters.period.from must not be after filters.period.to');
    }
    const hasConsolidated = await this.rbac.hasPermission(
      actor.userId,
      actor.organizationId,
      CASH_CONSOLIDATED,
    );
    const branchIds = resolveReportBranchIds(
      hasConsolidated,
      dto.filters.store,
      dto.filters.branchId,
      actor,
    );
    return {
      organizationId: actor.organizationId,
      branchIds,
      from: period.from,
      to: period.to,
      // `paymentMethod` is the dialog's own picker; `fundKind` is what the
      // drill-down from "Tình hình thu chi" IV sends. Same predicate.
      fund: dto.filters.paymentMethod ?? dto.filters.fundKind,
      staffIds: dto.filters.employeeIds?.length ? dto.filters.employeeIds : undefined,
      columnFilters: (dto.columnFilters ?? []).filter((f) => FILTERABLE[f.col]),
    };
  }

  // ---------------------------------------------------------------------------
  // SQL
  // ---------------------------------------------------------------------------

  /**
   * The filtered voucher rows as a SQL fragment (no ORDER / LIMIT — callers
   * wrap it). `$1` org, `$2` branch ids (the shared fragment's contract), then
   * whatever `p()` appended. Display columns are joined here rather than in
   * `voucherHeadersSql` so the aggregate reports keep the lean relation.
   */
  private rowsSql(
    scope: ListScope,
    window: DateWindow,
  ): { sql: string; params: unknown[]; p: (value: unknown) => string } {
    const params: unknown[] = [scope.organizationId, scope.branchIds];
    const p = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const where: string[] = [];
    switch (window.kind) {
      case 'period':
        where.push(`v.doc_date >= ${p(scope.from)}::date`, `v.doc_date <= ${p(scope.to)}::date`);
        break;
      case 'before':
        where.push(`v.doc_date < ${p(scope.from)}::date`);
        break;
      case 'partition':
        // Windows are half-open instants on the UTC day line (`splitIntoWindows`
        // starts from `new Date('yyyy-MM-dd')`), so the date is compared as a
        // timezone-less midnight against the window's UTC wall clock.
        where.push(`v.doc_date >= ${p(scope.from)}::date`, `v.doc_date <= ${p(scope.to)}::date`);
        if (window.from) {
          where.push(`v.doc_date::timestamp >= ${p(window.from.toISOString())}::timestamp`);
        }
        if (window.to) {
          where.push(`v.doc_date::timestamp < ${p(window.to.toISOString())}::timestamp`);
        }
        break;
    }
    if (scope.fund) where.push(`v.fund = ${p(scope.fund)}`);
    if (scope.staffIds) where.push(`v.staff_id = ANY(${p(scope.staffIds)}::text[])`);

    const base = `SELECT v.kind, v.fund, v.id, v.doc_date, v.doc_date::text AS doc_date_text, v.document_number,
        CASE WHEN v.direction = 'in' THEN v.total_amount ELSE 0 END AS amount_in,
        CASE WHEN v.direction = 'out' THEN v.total_amount ELSE 0 END AS amount_out,
        CASE WHEN v.direction = 'in' THEN v.total_amount ELSE -v.total_amount END AS signed,
        CASE WHEN inv.code IS NOT NULL THEN v.reference_type || ' ' || inv.code ELSE v.reference_type END AS reference,
        inv.code AS invoice_number,
        inv.id AS invoice_id,
        CASE WHEN da.id IS NULL THEN NULL ELSE da.name || ' · ' || da.account_no END AS deposit_account,
        NULLIF(btrim(COALESCE(su.first_name, '') || ' ' || COALESCE(su.last_name, '')), '') AS staff_name,
        COALESCE(c.code, sp.code, ep.code) AS partner_code,
        COALESCE(v.partner_name, v.party_name) AS partner_name,
        v.reason, b.code AS branch_code, b.name AS branch_name
      FROM (${voucherHeadersSql()}) v
      LEFT JOIN branches b ON b.id::text = v.branch_id
      LEFT JOIN users su ON su.id::text = v.staff_id
      LEFT JOIN deposit_accounts da ON da.id = v.deposit_account_id
      LEFT JOIN invoices inv ON inv.id = v.reference_id
        AND v.reference_type IN (${INVOICE_REFERENCE_TYPES.map((t) => `'${t}'`).join(', ')})
      LEFT JOIN customers c ON v.partner_type = 'CUSTOMER' AND c.id = v.partner_id
      LEFT JOIN inventory_providers sp ON v.partner_type = 'SUPPLIER' AND sp.id = v.partner_id
      LEFT JOIN employee_profiles ep ON v.partner_type = 'EMPLOYEE' AND ep.user_id = v.partner_id
      WHERE ${where.join(' AND ')}`;

    // Column filters target derived columns, so they wrap the base query — and
    // every caller (count, totals, opening, before-offset, page) wraps the same
    // fragment, which is what makes them agree (AC-10).
    const outer: string[] = [];
    for (const f of scope.columnFilters) outer.push(...this.columnFilterSql(f, p));
    const sql = outer.length ? `SELECT * FROM (${base}) filtered WHERE ${outer.join(' AND ')}` : base;
    return { sql, params, p };
  }

  /**
   * One column filter → SQL predicates (AND'd). Mirrors
   * `report-core/column-filter.util.ts` so this report filters like the
   * in-memory reports do: text operators are case-insensitive, and a number
   * column reads NULL / the other direction as 0 — "Tiền chi ≤ 100.000" keeps
   * the receipts and drops only the payments above it.
   */
  private columnFilterSql(f: ColumnFilter, p: (value: unknown) => string): string[] {
    const { column, kind } = FILTERABLE[f.col];
    const out: string[] = [];
    if (kind === 'text' || kind === 'enum' || hasTextOperator(f)) {
      const target = kind === 'enum' ? column : `COALESCE(${column}, '')`;
      const eq = f.equals ?? (f.eq !== undefined ? String(f.eq) : undefined);
      if (eq !== undefined) out.push(`${target} = ${p(eq)}`);
      if (f.contains !== undefined) out.push(`${target} ILIKE ${p(`%${escapeLike(f.contains)}%`)}`);
      if (f.startsWith !== undefined) out.push(`${target} LIKE ${p(`${escapeLike(f.startsWith)}%`)}`);
      if (f.endsWith !== undefined) out.push(`${target} LIKE ${p(`%${escapeLike(f.endsWith)}`)}`);
      if (f.notContains !== undefined) {
        out.push(`${target} NOT ILIKE ${p(`%${escapeLike(f.notContains)}%`)}`);
      }
      if (f.from !== undefined) out.push(`${target} >= ${p(f.from)}`);
      if (f.to !== undefined) out.push(`${target} <= ${p(f.to)}`);
      return out;
    }
    if (kind === 'date') {
      if (f.eq !== undefined) out.push(`${column} = ${p(String(f.eq))}::date`);
      if (f.from !== undefined) out.push(`${column} >= ${p(f.from)}::date`);
      if (f.to !== undefined) out.push(`${column} <= ${p(f.to)}::date`);
      return out;
    }
    const target = `COALESCE(${column}, 0)`;
    if (f.eq !== undefined) out.push(`${target} = ${p(Number(f.eq))}`);
    if (f.lt !== undefined) out.push(`${target} < ${p(f.lt)}`);
    if (f.lte !== undefined) out.push(`${target} <= ${p(f.lte)}`);
    if (f.gt !== undefined) out.push(`${target} > ${p(f.gt)}`);
    if (f.gte !== undefined) out.push(`${target} >= ${p(f.gte)}`);
    return out;
  }

  /** Count and Σ thu / Σ chi over the whole filtered period set — the footer and `total`. */
  private async summary(
    scope: ListScope,
  ): Promise<{ total: number; amountIn: number; amountOut: number }> {
    const { sql, params } = this.rowsSql(scope, { kind: 'period' });
    const [row] = (await this.dataSource.query(
      `SELECT COUNT(*)::int AS voucher_count,
              COALESCE(SUM(amount_in), 0) AS amount_in,
              COALESCE(SUM(amount_out), 0) AS amount_out
         FROM (${sql}) r`,
      params,
    )) as { voucher_count: unknown; amount_in: unknown; amount_out: unknown }[];
    return {
      total: num(row?.voucher_count),
      amountIn: round2(num(row?.amount_in)),
      amountOut: round2(num(row?.amount_out)),
    };
  }

  /** Số dư đầu kỳ of the set the user is looking at — see the class comment. */
  private async openingBalance(scope: ListScope): Promise<number> {
    const narrowed = !!scope.staffIds || scope.columnFilters.length > 0;
    if (!narrowed) {
      const opening = await this.period.openingBalance(
        { organizationId: scope.organizationId, branchIds: scope.branchIds },
        scope.from,
      );
      return scope.fund ? opening[scope.fund] : round2(opening.cash + opening.deposit);
    }
    const { sql, params } = this.rowsSql(scope, { kind: 'before' });
    const [row] = (await this.dataSource.query(
      `SELECT COALESCE(SUM(signed), 0) AS opening_signed FROM (${sql}) r`,
      params,
    )) as { opening_signed: unknown }[];
    return round2(num(row?.opening_signed));
  }

  /** Σ signed of the first `offset` rows in screen order — the pages before this one. */
  private async sumSignedBeforeOffset(scope: ListScope, offset: number): Promise<number> {
    const { sql, params, p } = this.rowsSql(scope, { kind: 'period' });
    const [row] = (await this.dataSource.query(
      `SELECT COALESCE(SUM(s.signed), 0) AS signed_before_offset
         FROM (SELECT signed FROM (${sql}) r ${ROW_ORDER} LIMIT ${p(offset)}) s`,
      params,
    )) as { signed_before_offset: unknown }[];
    return round2(num(row?.signed_before_offset));
  }

  /** Σ signed of the period rows that precede `first` in keyset order (export pages). */
  private async sumSignedBeforeKey(scope: ListScope, first: RawRow): Promise<number> {
    const { sql, params, p } = this.rowsSql(scope, { kind: 'period' });
    const at = p(first.cursor_at ?? isoDate(first.doc_date));
    const [row] = (await this.dataSource.query(
      `SELECT COALESCE(SUM(signed), 0) AS signed_before_key
         FROM (${sql}) r
        WHERE (doc_date < ${at}::date OR (doc_date = ${at}::date AND id < ${p(first.id)}::uuid))`,
      params,
    )) as { signed_before_key: unknown }[];
    return round2(num(row?.signed_before_key));
  }

  private async pageRows(scope: ListScope, limit: number, offset: number): Promise<RawRow[]> {
    const { sql, params, p } = this.rowsSql(scope, { kind: 'period' });
    return (await this.dataSource.query(
      `SELECT r.* FROM (${sql}) r ${ROW_ORDER} LIMIT ${p(limit)} OFFSET ${p(offset)}`,
      params,
    )) as RawRow[];
  }

  // ---------------------------------------------------------------------------
  // Rows
  // ---------------------------------------------------------------------------

  private toRow(r: RawRow, runningBalance: number | null): ReportRow {
    return {
      docDate: isoDate(r.doc_date_text ?? r.doc_date),
      documentNumber: r.document_number ?? null,
      documentKind: CASH_FUND_DOCUMENT_KIND_LABELS_VI[r.kind] ?? r.kind,
      reference: r.reference ?? null,
      amountIn: round2(num(r.amount_in)),
      amountOut: round2(num(r.amount_out)),
      runningBalance,
      paymentMethod: CASH_FUND_KIND_LABELS_VI[r.fund] ?? r.fund,
      depositAccount: r.deposit_account ?? null,
      staffName: r.staff_name ?? null,
      partnerCode: r.partner_code ?? null,
      partnerName: r.partner_name ?? null,
      reason: r.reason ?? null,
      branchCode: r.branch_code ?? null,
      branchName: r.branch_name ?? null,
      invoiceNumber: r.invoice_number ?? null,
      [REPORT_ROW_INVOICE_ID]: r.invoice_id ?? null,
      [CASH_FUND_ROW_KEYS.ROW_KIND]: 'detail',
      [CASH_FUND_ROW_KEYS.VOUCHER_ID]: r.id,
      [CASH_FUND_ROW_KEYS.VOUCHER_KIND]: r.kind,
      [CASH_FUND_ROW_KEYS.BOLD]: 0,
      [CASH_FUND_ROW_KEYS.INDENT_LEVEL]: 0,
    };
  }

  /** Row 0 of page 1 (ADR-04): the label sits in `reason`, the balance in `runningBalance`. */
  private openingRow(opening: number): ReportRow {
    const row: ReportRow = {};
    for (const col of CASH_IN_OUT_LIST_COLUMNS) row[col] = null;
    row.reason = 'Số dư đầu kỳ';
    row.runningBalance = opening;
    row[CASH_FUND_ROW_KEYS.ROW_KIND] = 'opening';
    row[CASH_FUND_ROW_KEYS.BOLD] = 1;
    row[CASH_FUND_ROW_KEYS.INDENT_LEVEL] = 0;
    return row;
  }
}
