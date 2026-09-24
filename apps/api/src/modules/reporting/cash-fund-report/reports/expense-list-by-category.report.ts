import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CASH_FUND_KIND_LABELS_VI,
  CASH_FUND_REPORT_KEYS,
  CASH_FUND_ROW_KEYS,
  CASH_FUND_UNCATEGORIZED,
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
import { round2 } from '../services/cash-fund-period.service';
import { voucherHeadersSql, voucherLinesSql } from '../services/cash-fund-voucher.sql';
import { ExpenseLinesQuery } from '../services/expense-lines.query';
import { UNCATEGORIZED_EXPENSE_LABEL } from './expenses-by-category.report';

const DEFAULT_LIMIT = 50;

/** The 13 columns of "Bảng kê tiền chi theo mục chi", in the order 00-intent.md #5 lists them. */
export const EXPENSE_LIST_BY_CATEGORY_COLUMNS = [
  'docDate',
  'documentNumber',
  'depositAccount',
  'paymentMethod',
  'reason',
  'amount',
  'partnerCode',
  'partnerName',
  'payeeName',
  'staffName',
  'branchCode',
  'branchName',
  'invoiceNumber',
  'categoryName',
] as const;

/** Row 0 of page 1 (ADR-04). */
export const GRAND_TOTAL_LABEL = 'TỔNG CHI';

/** Hidden row key of the payment line a detail row comes from (not in CASH_FUND_ROW_KEYS: only this report has lines). */
export const LINE_ID_KEY = 'lineId';

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

// Group order over the `rows` relation: the no-category group first (AC-14,
// A-13 evidence), then categories by display order and name; `category_id`
// last so two categories that share both still form two stable groups. A
// hard-deleted category has NULL order / name and sorts after the named ones.
const GROUP_ORDER =
  '(category_id IS NULL) DESC, category_order ASC NULLS LAST, category_name ASC NULLS LAST, category_id ASC';
// Detail order inside a group; `line_id` last so the order is total.
const DETAIL_ORDER = 'doc_date DESC, document_number DESC, line_id ASC';
// The export order (keyset cursor = (doc_date, line_id) descending, see `exportSource`).
const KEYSET_ORDER = 'ORDER BY doc_date DESC, line_id DESC';

/**
 * Column key → the SQL column of the `rows` relation it filters on, and how.
 * `paymentMethod` compares on the raw `fund` the select option carries, not
 * on the Vietnamese label the cell shows.
 */
const FILTERABLE: Record<string, { column: string; kind: 'text' | 'number' | 'date' | 'enum' }> = {
  docDate: { column: 'doc_date', kind: 'date' },
  documentNumber: { column: 'document_number', kind: 'text' },
  depositAccount: { column: 'deposit_account', kind: 'text' },
  paymentMethod: { column: 'fund', kind: 'enum' },
  reason: { column: 'reason', kind: 'text' },
  amount: { column: 'amount', kind: 'number' },
  partnerCode: { column: 'partner_code', kind: 'text' },
  partnerName: { column: 'partner_name', kind: 'text' },
  payeeName: { column: 'payee_name', kind: 'text' },
  staffName: { column: 'staff_name', kind: 'text' },
  branchCode: { column: 'branch_code', kind: 'text' },
  branchName: { column: 'branch_name', kind: 'text' },
  invoiceNumber: { column: 'invoice_number', kind: 'text' },
  // 14th column: the grouping, so an exported file (detail rows only) keeps
  // its meaning. The FE registry hides it on screen where the group row shows it.
  categoryName: { column: 'category_name', kind: 'text' },
};

/** One payment line with its voucher's display columns, as `rowsSql` selects it. */
interface RawRow {
  kind: CashFundDocumentKind;
  fund: CashFundKind;
  voucher_id: string;
  line_id: string;
  doc_date: string | Date;
  /** `doc_date::text` — the calendar date without a `Date` round-trip (T-02-07). */
  doc_date_text?: string;
  document_number: string | null;
  category_id: string | null;
  category_name: string | null;
  category_order: unknown;
  amount: unknown;
  reason: string | null;
  deposit_account: string | null;
  staff_name: string | null;
  partner_code: string | null;
  partner_name: string | null;
  payee_name: string | null;
  branch_code: string | null;
  branch_name: string | null;
  invoice_number: string | null;
  /** `invoices.id` behind `invoice_number` — the drill-down's unambiguous key. */
  invoice_id: string | null;
  /** Only selected by the page query: 0-based position in the flat list, header rows counted. */
  flat_pos?: unknown;
  /** Only selected by the page query: this is the first detail of its group. */
  first_of_group?: boolean;
  /** Only selected by the export page query. */
  cursor_at?: string;
}

interface RawGroup {
  category_id: string | null;
  category_name: string | null;
  line_count: unknown;
  amount: unknown;
}

/** Everything that narrows the line set; the same instance feeds every query of one request. */
interface ListScope {
  organizationId: string;
  branchIds: string[] | null;
  from: string;
  to: string;
  categoryIds?: string[];
  fund?: CashFundKind;
  staffIds?: string[];
  columnFilters: ColumnFilter[];
}

/** Which slice of the voucher date line a query reads. */
type DateWindow = { kind: 'period' } | { kind: 'partition'; from?: Date; to?: Date };

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

/** The group key a line belongs to: its category, or the shared no-category bucket. */
const groupKey = (categoryId: string | null): string => categoryId ?? CASH_FUND_UNCATEGORIZED;

/**
 * "Bảng kê tiền chi theo mục chi" — one row per payment LINE (A-12), grouped by
 * mục chi. A voucher whose lines sit in two categories shows up in both groups
 * with the line amount, never the voucher total (AC-14). Lines come from
 * `ExpenseLinesQuery.whereClause` (direction out, period, not a purchase /
 * supplier payment, optional `categoryIds`); the voucher's display columns are
 * joined from the shared header relation; the store scope, the fund, the staff
 * filter and the column-filter row are all pushed into SQL so the totals, the
 * group subtotals, the count and the page agree on one line set.
 *
 * Screen order: the no-category group ("Chi khác") first, then categories by
 * `display_order`, name; details inside a group newest first (AC-14).
 *
 * Pagination (AC-15) runs over the FLAT list `[group, detail…, group, detail…]`
 * — `total` = #groups + #lines — and the "TỔNG CHI" row is prepended to page 1
 * only, outside that count (ADR-04). The page is cut in SQL, not in RAM: every
 * line gets its 0-based flat position from two window functions —
 * `row_number()` over the screen order (its index among lines) plus
 * `dense_rank()` over the group order (how many group headers precede it, its
 * own included) — and the page query keeps the lines whose position lies in
 * `[offset, offset + limit]`. The upper bound is inclusive on purpose: the
 * header of a group sits one slot before its first line, so the line at
 * `offset + limit` is fetched only to learn whether its header is the last
 * slot of this page. In RAM a group row is then emitted before a line iff the
 * line is the first of its group AND the header's slot is inside the page —
 * which is exactly why a group cut across two pages does not repeat its
 * header on the second one.
 */
@Injectable()
export class ExpenseListByCategoryReport implements ReportDefinition {
  readonly key = CASH_FUND_REPORT_KEYS.EXPENSE_LIST_BY_CATEGORY;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly lines: ExpenseLinesQuery,
    private readonly rbac: RbacService,
  ) {}

  async buildColumns(): Promise<ReportColumnHeader[]> {
    const S = ReportColumnDataType.STRING;
    return [
      cashFundColumn('docDate', ReportColumnDataType.DATE, { pinned: true }),
      cashFundColumn('documentNumber', S, { pinned: true, link: true }),
      cashFundColumn('depositAccount', S),
      cashFundColumn('paymentMethod', S, { filterOptions: PAYMENT_METHOD_OPTIONS }),
      cashFundColumn('reason', S),
      cashFundColumn('amount', ReportColumnDataType.CURRENCY),
      cashFundColumn('partnerCode', S),
      cashFundColumn('partnerName', S),
      cashFundColumn('payeeName', S),
      cashFundColumn('staffName', S),
      cashFundColumn('branchCode', S),
      cashFundColumn('branchName', S),
      cashFundColumn('invoiceNumber', S),
      cashFundColumn('categoryName', S),
    ];
  }

  async buildData(dto: CashFundReportSearchDto, actor: ActorContext): Promise<InvoiceReportResult> {
    const scope = await this.resolveScope(dto, actor);
    const page = dto.page ?? 1;
    const limit = dto.limit ?? DEFAULT_LIMIT;
    const offset = (page - 1) * limit;

    const [groups, pageRows] = await Promise.all([
      this.groups(scope),
      this.pageRows(scope, limit, offset),
    ]);
    const subtotal = new Map(groups.map((g) => [groupKey(g.category_id), round2(num(g.amount))]));
    const lineCount = groups.reduce((s, g) => s + num(g.line_count), 0);
    const grandTotal = round2(groups.reduce((s, g) => s + num(g.amount), 0));

    const rows: ReportRow[] = [];
    const end = offset + limit;
    for (const r of pageRows) {
      const pos = num(r.flat_pos);
      // The header's slot is `pos - 1`; `pos > offset` keeps a group that was
      // cut by the previous page from repeating its header (AC-15).
      if (r.first_of_group && pos > offset && pos - 1 < end) {
        rows.push(this.groupRow(r, subtotal.get(groupKey(r.category_id)) ?? 0));
      }
      if (pos < end) rows.push(this.toRow(r));
    }
    if (page === 1) rows.unshift(this.grandTotalRow(grandTotal));

    const total = groups.length + lineCount;
    return { rows, totals: total ? { amount: grandTotal } : null, total };
  }

  /** Payment lines the request would list; the row cap is checked on this before anything is fetched. */
  async countRows(dto: CashFundReportSearchDto, actor: ActorContext): Promise<CountedRows> {
    const scope = await this.resolveScope(dto, actor);
    const groups = await this.groups(scope);
    return { total: groups.reduce((s, g) => s + num(g.line_count), 0), subject: 'dòng chi' };
  }

  /**
   * Keyset export (ADR-07) on `(doc_date, line_id)`, newest first. The file
   * carries the detail lines only — no group or "TỔNG CHI" rows — and each
   * line also carries its `categoryName` so the grouping survives as a column
   * (the export projects `dto.columns`, so it lands in the file only when
   * requested). The cursor's `at` is the voucher date as `yyyy-MM-dd` text — a
   * `date` has no sub-day precision to lose.
   */
  readonly exportSource: ReportExportSource<CashFundReportSearchDto> = {
    order: 'desc',
    range: (dto) => {
      const period = dto.filters?.period;
      return period?.from && period?.to ? { from: period.from, to: period.to } : null;
    },
    summable: (columns) => columns.filter((c) => c === 'amount'),
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
      cursorWhere = ` WHERE (doc_date < ${at}::date OR (doc_date = ${at}::date AND line_id < ${p(cursor.id)}::uuid))`;
    }
    const raw = (await this.dataSource.query(
      `SELECT r.*, r.doc_date::text AS cursor_at FROM (${sql}) r${cursorWhere} ${KEYSET_ORDER} LIMIT ${p(size)}`,
      params,
    )) as RawRow[];

    const rows = raw.map((r) => ({ ...this.toRow(r), categoryName: this.groupName(r) }));
    const last = raw[raw.length - 1];
    return {
      rows,
      nextCursor: last ? { at: last.cursor_at ?? isoDate(last.doc_date), id: last.line_id } : null,
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
      categoryIds: dto.filters.categoryIds?.length ? dto.filters.categoryIds : undefined,
      fund: dto.filters.paymentMethod,
      staffIds: dto.filters.employeeIds?.length ? dto.filters.employeeIds : undefined,
      columnFilters: (dto.columnFilters ?? []).filter((f) => FILTERABLE[f.col]),
    };
  }

  // ---------------------------------------------------------------------------
  // SQL
  // ---------------------------------------------------------------------------

  /**
   * The filtered payment lines as a SQL fragment (no ORDER / LIMIT — callers
   * wrap it). Params: `$1` org, `$2` branch ids, `$3` from, `$4` to, `$5` the
   * category ids when given (`ExpenseLinesQuery.whereClause`'s contract), then
   * whatever `p()` appended. The line relation is joined to the header relation
   * on the voucher id for the display columns; the category is joined for the
   * group name and order.
   */
  private rowsSql(
    scope: ListScope,
    window: DateWindow,
  ): { sql: string; params: unknown[]; p: (value: unknown) => string } {
    const lines = this.lines.whereClause(scope, scope.from, scope.to, scope.categoryIds);
    const params: unknown[] = [...lines.params];
    const p = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    const where: string[] = [lines.where];
    if (window.kind === 'partition') {
      // Windows are half-open instants on the UTC day line (`splitIntoWindows`
      // starts from `new Date('yyyy-MM-dd')`), so the date is compared as a
      // timezone-less midnight against the window's UTC wall clock.
      if (window.from) {
        where.push(`v.doc_date::timestamp >= ${p(window.from.toISOString())}::timestamp`);
      }
      if (window.to) {
        where.push(`v.doc_date::timestamp < ${p(window.to.toISOString())}::timestamp`);
      }
    }
    if (scope.fund) where.push(`v.fund = ${p(scope.fund)}`);
    if (scope.staffIds) where.push(`h.staff_id = ANY(${p(scope.staffIds)}::text[])`);

    const base = `SELECT v.kind, v.fund, v.voucher_id, v.line_id, v.doc_date, v.doc_date::text AS doc_date_text, h.document_number,
        v.category_id::text AS category_id, c.name AS category_name, c.display_order AS category_order,
        v.amount,
        COALESCE(NULLIF(btrim(v.description), ''), h.reason) AS reason,
        CASE WHEN da.id IS NULL THEN NULL ELSE da.name || ' · ' || da.account_no END AS deposit_account,
        NULLIF(btrim(COALESCE(su.first_name, '') || ' ' || COALESCE(su.last_name, '')), '') AS staff_name,
        COALESCE(cu.code, sp.code, ep.code) AS partner_code,
        COALESCE(h.partner_name, h.party_name) AS partner_name,
        h.party_name AS payee_name,
        b.code AS branch_code, b.name AS branch_name,
        inv.code AS invoice_number,
        inv.id AS invoice_id
      FROM (${voucherLinesSql()}) v
      JOIN (${voucherHeadersSql()}) h ON h.id = v.voucher_id AND h.kind = v.kind
      LEFT JOIN cash_voucher_categories c ON c.id = v.category_id
      LEFT JOIN branches b ON b.id::text = h.branch_id
      LEFT JOIN users su ON su.id::text = h.staff_id
      LEFT JOIN deposit_accounts da ON da.id = h.deposit_account_id
      LEFT JOIN invoices inv ON inv.id = h.reference_id
        AND h.reference_type IN (${INVOICE_REFERENCE_TYPES.map((t) => `'${t}'`).join(', ')})
      LEFT JOIN customers cu ON h.partner_type = 'CUSTOMER' AND cu.id = h.partner_id
      LEFT JOIN inventory_providers sp ON h.partner_type = 'SUPPLIER' AND sp.id = h.partner_id
      LEFT JOIN employee_profiles ep ON h.partner_type = 'EMPLOYEE' AND ep.user_id = h.partner_id
      WHERE ${where.join('\n        AND ')}`;

    // Column filters target derived columns, so they wrap the base query — and
    // every caller (groups, page, export) wraps the same fragment, which is
    // what makes them agree.
    const outer: string[] = [];
    for (const f of scope.columnFilters) outer.push(...this.columnFilterSql(f, p));
    const sql = outer.length ? `SELECT * FROM (${base}) filtered WHERE ${outer.join(' AND ')}` : base;
    return { sql, params, p };
  }

  /**
   * One column filter → SQL predicates (AND'd). Same translation as
   * `cash-in-out-list.report.ts` (mirrors `report-core/column-filter.util.ts`):
   * text operators are case-insensitive, a number column reads NULL as 0.
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

  /** One row per group of the whole filtered set: its line count and Σ amount — the subtotals, the total and TỔNG CHI. */
  private async groups(scope: ListScope): Promise<RawGroup[]> {
    const { sql, params } = this.rowsSql(scope, { kind: 'period' });
    return (await this.dataSource.query(
      `SELECT r.category_id, r.category_name,
              COUNT(*)::int AS line_count,
              COALESCE(SUM(r.amount), 0) AS amount
         FROM (${sql}) r
        GROUP BY r.category_id, r.category_name`,
      params,
    )) as RawGroup[];
  }

  /** The lines whose flat position lies in `[offset, offset + limit]` — see the class comment for the inclusive bound. */
  private async pageRows(scope: ListScope, limit: number, offset: number): Promise<RawRow[]> {
    const { sql, params, p } = this.rowsSql(scope, { kind: 'period' });
    return (await this.dataSource.query(
      `SELECT f.* FROM (
         SELECT r.*,
                row_number() OVER (ORDER BY ${GROUP_ORDER}, ${DETAIL_ORDER}) - 1
                  + dense_rank() OVER (ORDER BY ${GROUP_ORDER}) AS flat_pos,
                row_number() OVER (PARTITION BY r.category_id ORDER BY ${DETAIL_ORDER}) = 1 AS first_of_group
           FROM (${sql}) r
       ) f
       WHERE f.flat_pos >= ${p(offset)} AND f.flat_pos <= ${p(offset + limit)}
       ORDER BY f.flat_pos`,
      params,
    )) as RawRow[];
  }

  // ---------------------------------------------------------------------------
  // Rows
  // ---------------------------------------------------------------------------

  /** The group label: the category name, "Chi khác" for no category, the id for a hard-deleted one. */
  private groupName(r: Pick<RawRow, 'category_id' | 'category_name'>): string {
    if (r.category_id === null) return UNCATEGORIZED_EXPENSE_LABEL;
    return r.category_name ?? r.category_id;
  }

  private toRow(r: RawRow): ReportRow {
    return {
      docDate: isoDate(r.doc_date_text ?? r.doc_date),
      documentNumber: r.document_number ?? null,
      depositAccount: r.deposit_account ?? null,
      paymentMethod: CASH_FUND_KIND_LABELS_VI[r.fund] ?? r.fund,
      reason: r.reason ?? null,
      amount: round2(num(r.amount)),
      partnerCode: r.partner_code ?? null,
      partnerName: r.partner_name ?? null,
      payeeName: r.payee_name ?? null,
      staffName: r.staff_name ?? null,
      branchCode: r.branch_code ?? null,
      branchName: r.branch_name ?? null,
      invoiceNumber: r.invoice_number ?? null,
      [REPORT_ROW_INVOICE_ID]: r.invoice_id ?? null,
      [CASH_FUND_ROW_KEYS.ROW_KIND]: 'detail',
      [CASH_FUND_ROW_KEYS.CATEGORY_ID]: groupKey(r.category_id),
      [CASH_FUND_ROW_KEYS.VOUCHER_ID]: r.voucher_id,
      [CASH_FUND_ROW_KEYS.VOUCHER_KIND]: r.kind,
      [LINE_ID_KEY]: r.line_id,
      [CASH_FUND_ROW_KEYS.BOLD]: 0,
      [CASH_FUND_ROW_KEYS.INDENT_LEVEL]: 1,
    };
  }

  /** A group header (ADR-04): the name sits in `reason`, the subtotal in `amount`. */
  private groupRow(r: Pick<RawRow, 'category_id' | 'category_name'>, subtotal: number): ReportRow {
    const row = this.blankRow();
    row.reason = this.groupName(r);
    row.amount = subtotal;
    row[CASH_FUND_ROW_KEYS.ROW_KIND] = 'group';
    row[CASH_FUND_ROW_KEYS.CATEGORY_ID] = groupKey(r.category_id);
    return row;
  }

  /** Row 0 of page 1 (ADR-04): "TỔNG CHI" over the whole filtered set. */
  private grandTotalRow(amount: number): ReportRow {
    const row = this.blankRow();
    row.reason = GRAND_TOTAL_LABEL;
    row.amount = amount;
    row[CASH_FUND_ROW_KEYS.ROW_KIND] = 'grandTotal';
    return row;
  }

  private blankRow(): ReportRow {
    const row: ReportRow = {};
    for (const col of EXPENSE_LIST_BY_CATEGORY_COLUMNS) row[col] = null;
    row[CASH_FUND_ROW_KEYS.BOLD] = 1;
    row[CASH_FUND_ROW_KEYS.INDENT_LEVEL] = 0;
    return row;
  }
}
