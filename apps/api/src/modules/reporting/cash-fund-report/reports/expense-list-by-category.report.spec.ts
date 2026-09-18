import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CASH_FUND_ROW_KEYS, CASH_FUND_UNCATEGORIZED, ReportRow } from '@erp/shared-interfaces';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../../rbac/rbac.service';
import { CashFundReportSearchDto } from '../dto/cash-fund-report-search.dto';
import { ExpenseLinesQuery } from '../services/expense-lines.query';
import {
  EXPENSE_LIST_BY_CATEGORY_COLUMNS,
  ExpenseListByCategoryReport,
  GRAND_TOTAL_LABEL,
  LINE_ID_KEY,
} from './expense-list-by-category.report';

const BRANCH_A = 'b-a';
const actor = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: BRANCH_A,
  roles: [],
  branchIds: [BRANCH_A],
} as unknown as ActorContext;

const CAT_DIEN = 'cat-dien';
const CAT_NUOC = 'cat-nuoc';

/** One row of the `rows` relation as Postgres hands it back (numerics as text). */
interface Raw {
  kind: 'CASH_PAYMENT' | 'BANK_PAYMENT';
  fund: 'cash' | 'deposit';
  voucher_id: string;
  line_id: string;
  doc_date: string;
  document_number: string;
  category_id: string | null;
  category_name: string | null;
  category_order: number | null;
  amount: string;
  reason: string | null;
  deposit_account: string | null;
  staff_name: string | null;
  partner_code: string | null;
  partner_name: string | null;
  payee_name: string | null;
  branch_code: string | null;
  branch_name: string | null;
  invoice_number: string | null;
}

const CATEGORIES: Record<string, { name: string; order: number }> = {
  [CAT_DIEN]: { name: 'Tiền điện', order: 1 },
  [CAT_NUOC]: { name: 'Tiền nước', order: 2 },
};

function line(
  number: string,
  lineId: string,
  date: string,
  categoryId: string | null,
  amount: number,
  extra: Partial<Raw> = {},
): Raw {
  const category = categoryId ? CATEGORIES[categoryId] : undefined;
  return {
    kind: 'CASH_PAYMENT',
    fund: 'cash',
    voucher_id: `id-${number}`,
    line_id: lineId,
    doc_date: date,
    document_number: number,
    category_id: categoryId,
    category_name: category?.name ?? null,
    category_order: category?.order ?? null,
    amount: `${amount}.00`,
    reason: null,
    deposit_account: null,
    staff_name: 'Thu Ngân',
    partner_code: null,
    partner_name: null,
    payee_name: null,
    branch_code: 'CN-A',
    branch_name: 'Chi nhánh A',
    invoice_number: null,
    ...extra,
  };
}

/**
 * The expense lines of branch A in September 2026 (02-requirements fixture):
 * PC-02 has two lines in two categories; PC-01 (SUPPLIER_PAYMENT), PC-05 /
 * PC-05R (reversed) and PC-07 (DRAFT) are excluded by the SQL predicates the
 * tests assert on the query text, so they are not in the relation.
 */
const FIXTURE: Raw[] = [
  // `reason` = the line description, falling back to the voucher reason.
  line('PC-02', 'l-02a', '2026-09-08', CAT_DIEN, 90000, {
    reason: 'Tiền điện nước tháng 9',
    partner_name: 'EVN',
    payee_name: 'Thầy Hà',
  }),
  line('PC-02', 'l-02b', '2026-09-08', CAT_NUOC, 10000, { reason: 'Tiền điện nước tháng 9' }),
  line('PC-03', 'l-03', '2026-09-09', CAT_DIEN, 60000, { reason: 'Tiền điện kho' }),
  line('PC-04', 'l-04', '2026-09-10', null, 40000, { reason: 'Hoàn tiền' }),
];

const cmp = (a: string | number | null, b: string | number | null): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
};
/** GROUP_ORDER: no category first, then display order, name, id. */
const groupOrder = (a: Raw, b: Raw): number =>
  Number(b.category_id === null) - Number(a.category_id === null) ||
  cmp(a.category_order, b.category_order) ||
  cmp(a.category_name, b.category_name) ||
  cmp(a.category_id, b.category_id);
/** DETAIL_ORDER: newest first, document number desc, line id asc. */
const detailOrder = (a: Raw, b: Raw): number =>
  -cmp(a.doc_date, b.doc_date) ||
  -cmp(a.document_number, b.document_number) ||
  cmp(a.line_id, b.line_id);
const keysetOrder = (a: Raw, b: Raw): number =>
  -cmp(a.doc_date, b.doc_date) || -cmp(a.line_id, b.line_id);

const sum = (rows: Raw[]): number => rows.reduce((s, r) => s + Number(r.amount), 0);

/**
 * A `DataSource.query` stand-in that answers the report's three queries from
 * `all` the way Postgres would evaluate them — the GROUP BY, the two window
 * functions behind `flat_pos` / `first_of_group`, the keyset page — so the flat
 * pagination is exercised for real. Of the WHERE clause it honours only the
 * predicates a test varies (category ids, fund); the rest is asserted on the
 * SQL text.
 */
function mockQuery(all: Raw[]): jest.Mock {
  return jest.fn(async (sql: string, params: unknown[]) => {
    let rows = all;
    if (sql.includes('v.category_id::text = ANY($5::text[])')) {
      const ids = params[4] as string[];
      rows = rows.filter(
        (r) =>
          (r.category_id !== null && ids.includes(r.category_id)) ||
          (r.category_id === null && sql.includes('v.category_id IS NULL')),
      );
    } else if (sql.includes('v.category_id IS NULL')) {
      rows = rows.filter((r) => r.category_id === null);
    }
    const fundAt = sql.match(/v\.fund = \$(\d+)/);
    if (fundAt) rows = rows.filter((r) => r.fund === params[Number(fundAt[1]) - 1]);

    if (sql.includes('AS line_count')) {
      const groups = new Map<string | null, Raw[]>();
      for (const r of rows) groups.set(r.category_id, [...(groups.get(r.category_id) ?? []), r]);
      return [...groups.entries()].map(([category_id, lines]) => ({
        category_id,
        category_name: lines[0].category_name,
        line_count: lines.length,
        amount: String(sum(lines)),
      }));
    }
    if (sql.includes('AS flat_pos')) {
      const end = Number(params[params.length - 1]);
      const start = Number(params[params.length - 2]);
      const sorted = [...rows].sort((a, b) => groupOrder(a, b) || detailOrder(a, b));
      let rank = 0;
      let previous: string | null | undefined;
      const flat = sorted.map((r, index) => {
        const first = index === 0 || r.category_id !== previous;
        if (first) rank += 1;
        previous = r.category_id;
        return { ...r, flat_pos: String(index + rank), first_of_group: first };
      });
      return flat.filter((r) => Number(r.flat_pos) >= start && Number(r.flat_pos) <= end);
    }
    if (sql.includes('AS cursor_at')) {
      const size = Number(params[params.length - 1]);
      let keyset = [...rows].sort(keysetOrder);
      if (sql.includes('doc_date < $')) {
        const id = String(params[params.length - 2]);
        const at = String(params[params.length - 3]);
        keyset = keyset.filter((r) => r.doc_date < at || (r.doc_date === at && r.line_id < id));
      }
      return keyset.slice(0, size).map((r) => ({ ...r, cursor_at: r.doc_date }));
    }
    throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
  });
}

function dto(
  filters: Partial<CashFundReportSearchDto['filters']> = {},
  rest: Partial<Omit<CashFundReportSearchDto, 'filters'>> = {},
): CashFundReportSearchDto {
  return {
    reportType: 'expense-list-by-category',
    columns: [...EXPENSE_LIST_BY_CATEGORY_COLUMNS],
    filters: { period: { from: '2026-09-01', to: '2026-09-30' }, ...filters },
    ...rest,
  } as CashFundReportSearchDto;
}

const kinds = (rows: ReportRow[]) => rows.map((r) => r[CASH_FUND_ROW_KEYS.ROW_KIND]);
const sqlOf = (query: jest.Mock): string[] => query.mock.calls.map((c) => String(c[0]));
const callsOf = (query: jest.Mock): [string, unknown[]][] =>
  query.mock.calls.map((c) => [String(c[0]), c[1] as unknown[]]);

/** `count` lines per group over three categories, 40/40/40 by default (AC-15). */
function manyLines(perGroup = 40): Raw[] {
  const out: Raw[] = [];
  const groups: (string | null)[] = [null, CAT_DIEN, CAT_NUOC];
  groups.forEach((categoryId, g) => {
    for (let i = 0; i < perGroup; i += 1) {
      const n = String(i + 1).padStart(3, '0');
      out.push(
        line(`PC-${g}${n}`, `l-${g}-${n}`, `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, categoryId, 1000 * (g + 1)),
      );
    }
  });
  return out;
}

describe('ExpenseListByCategoryReport', () => {
  let query: jest.Mock;
  let rbac: { hasPermission: jest.Mock };

  const build = (rows: Raw[] = FIXTURE) => {
    query = mockQuery(rows);
    const dataSource = { query } as unknown as DataSource;
    return new ExpenseListByCategoryReport(
      dataSource,
      new ExpenseLinesQuery(dataSource),
      rbac as unknown as RbacService,
    );
  };

  beforeEach(() => {
    rbac = { hasPermission: jest.fn().mockResolvedValue(false) };
  });

  describe('buildColumns', () => {
    it('lists the 13 columns of 00-intent #5 in order, plus the grouping column for exports', async () => {
      const cols = await build().buildColumns();
      expect(cols.map((c) => c.col)).toEqual([...EXPENSE_LIST_BY_CATEGORY_COLUMNS]);
      expect(cols.map((c) => c.name)).toEqual([
        'Ngày chứng từ',
        'Số chứng từ',
        'Tài khoản ngân hàng',
        'Phương thức thanh toán',
        'Diễn giải',
        'Số tiền chi',
        'Mã đối tượng',
        'Đối tượng nộp/nhận',
        'Người nhận',
        'Nhân viên thu/chi',
        'Mã cửa hàng',
        'Tên cửa hàng',
        'Số hóa đơn',
        'Mục chi',
      ]);
    });

    it('pins the first two, links the document number and offers the payment-method select (A-05)', async () => {
      const cols = await build().buildColumns();
      const byKey = Object.fromEntries(cols.map((c) => [c.col, c]));
      expect(cols.filter((c) => c.pinned === 'left').map((c) => c.col)).toEqual([
        'docDate',
        'documentNumber',
      ]);
      expect(byKey.documentNumber.link).toBe(true);
      expect(byKey.docDate).toMatchObject({ type: 'date', filterKind: 'date' });
      expect(byKey.amount).toMatchObject({ type: 'currency', filterKind: 'number', align: 'right' });
      expect(byKey.paymentMethod.filterKind).toBe('select');
      expect(byKey.paymentMethod.filterOptions).toEqual([
        { value: 'cash', label: 'Tiền mặt' },
        { value: 'deposit', label: 'Chuyển khoản' },
      ]);
    });
  });

  describe('AC-14 — TỔNG CHI, one group per category, one row per line', () => {
    it('renders the fixture: 200.000; Chi khác → PC-04; Tiền điện → PC-03, PC-02; Tiền nước → PC-02; total 3 + 4', async () => {
      const { rows, totals, total } = await build().buildData(dto(), actor);

      expect(rows[0]).toMatchObject({
        reason: GRAND_TOTAL_LABEL,
        amount: 200000,
        docDate: null,
        documentNumber: null,
        [CASH_FUND_ROW_KEYS.ROW_KIND]: 'grandTotal',
        [CASH_FUND_ROW_KEYS.BOLD]: 1,
        [CASH_FUND_ROW_KEYS.INDENT_LEVEL]: 0,
      });
      expect(rows.slice(1).map((r) => [r[CASH_FUND_ROW_KEYS.ROW_KIND], r.reason, r.documentNumber, r.amount])).toEqual([
        ['group', 'Chi khác', null, 40000],
        ['detail', 'Hoàn tiền', 'PC-04', 40000],
        ['group', 'Tiền điện', null, 150000],
        ['detail', 'Tiền điện kho', 'PC-03', 60000],
        ['detail', 'Tiền điện nước tháng 9', 'PC-02', 90000],
        ['group', 'Tiền nước', null, 10000],
        ['detail', 'Tiền điện nước tháng 9', 'PC-02', 10000],
      ]);
      // Groups + lines, TỔNG CHI not counted; footer over the whole set.
      expect(total).toBe(7);
      expect(totals).toEqual({ amount: 200000 });
    });

    it('carries the hidden keys: group rows bold with categoryId, detail rows indented with voucher / line ids', async () => {
      const { rows } = await build().buildData(dto(), actor);
      const [, khac, pc04, dien, pc03, pc02Dien, nuoc, pc02Nuoc] = rows;

      expect(khac).toMatchObject({
        [CASH_FUND_ROW_KEYS.BOLD]: 1,
        [CASH_FUND_ROW_KEYS.INDENT_LEVEL]: 0,
        [CASH_FUND_ROW_KEYS.CATEGORY_ID]: CASH_FUND_UNCATEGORIZED,
      });
      expect(dien[CASH_FUND_ROW_KEYS.CATEGORY_ID]).toBe(CAT_DIEN);
      expect(nuoc[CASH_FUND_ROW_KEYS.CATEGORY_ID]).toBe(CAT_NUOC);
      for (const group of [khac, dien, nuoc]) {
        expect(group[CASH_FUND_ROW_KEYS.VOUCHER_ID]).toBeUndefined();
      }

      expect(pc04).toMatchObject({
        [CASH_FUND_ROW_KEYS.BOLD]: 0,
        [CASH_FUND_ROW_KEYS.INDENT_LEVEL]: 1,
        [CASH_FUND_ROW_KEYS.CATEGORY_ID]: CASH_FUND_UNCATEGORIZED,
        [CASH_FUND_ROW_KEYS.VOUCHER_ID]: 'id-PC-04',
        [CASH_FUND_ROW_KEYS.VOUCHER_KIND]: 'CASH_PAYMENT',
        [LINE_ID_KEY]: 'l-04',
      });
      expect(pc03).toMatchObject({ [CASH_FUND_ROW_KEYS.CATEGORY_ID]: CAT_DIEN, [LINE_ID_KEY]: 'l-03' });
      // The same voucher in two groups, one line each — with the line's amount, not the voucher's.
      expect(pc02Dien).toMatchObject({
        [CASH_FUND_ROW_KEYS.VOUCHER_ID]: 'id-PC-02',
        [CASH_FUND_ROW_KEYS.CATEGORY_ID]: CAT_DIEN,
        [LINE_ID_KEY]: 'l-02a',
        amount: 90000,
      });
      expect(pc02Nuoc).toMatchObject({
        [CASH_FUND_ROW_KEYS.VOUCHER_ID]: 'id-PC-02',
        [CASH_FUND_ROW_KEYS.CATEGORY_ID]: CAT_NUOC,
        [LINE_ID_KEY]: 'l-02b',
        amount: 10000,
      });
    });

    it('projects the voucher display columns onto every detail row (A-05, A-19)', async () => {
      const { rows } = await build().buildData(dto(), actor);
      expect(rows[5]).toMatchObject({
        docDate: '2026-09-08',
        documentNumber: 'PC-02',
        paymentMethod: 'Tiền mặt',
        depositAccount: null,
        partnerName: 'EVN',
        payeeName: 'Thầy Hà',
        staffName: 'Thu Ngân',
        branchCode: 'CN-A',
        branchName: 'Chi nhánh A',
        invoiceNumber: null,
      });
    });

    it('returns an empty page with null totals when nothing matches', async () => {
      const { rows, totals, total } = await build([]).buildData(dto(), actor);
      expect(rows).toEqual([expect.objectContaining({ reason: GRAND_TOTAL_LABEL, amount: 0 })]);
      expect(total).toBe(0);
      expect(totals).toBeNull();
    });
  });

  describe('AC-15 — pagination over the flat list', () => {
    // 3 groups × 40 lines: flat positions G1=0, lines 1..40, G2=41, lines 42..81, G3=82, lines 83..122.
    const rows120 = manyLines(40);

    it('page 1 = TỔNG CHI + the first 50 flat rows; total counts groups and lines but not TỔNG CHI', async () => {
      const { rows, total, totals } = await build(rows120).buildData(dto({}, { page: 1, limit: 50 }), actor);

      expect(total).toBe(3 + 120);
      expect(rows).toHaveLength(51);
      expect(rows[0][CASH_FUND_ROW_KEYS.ROW_KIND]).toBe('grandTotal');
      expect(rows[1]).toMatchObject({ [CASH_FUND_ROW_KEYS.ROW_KIND]: 'group', reason: 'Chi khác' });
      expect(kinds(rows.slice(2, 42)).every((k) => k === 'detail')).toBe(true);
      expect(rows[42]).toMatchObject({ [CASH_FUND_ROW_KEYS.ROW_KIND]: 'group', reason: 'Tiền điện' });
      expect(kinds(rows.slice(43))).toEqual(Array(8).fill('detail'));
      expect(totals).toEqual({ amount: 40 * 1000 + 40 * 2000 + 40 * 3000 });
    });

    it('page 2 starts at flat position 51 inside the cut group without repeating its header', async () => {
      const report = build(rows120);
      const page1 = await report.buildData(dto({}, { page: 1, limit: 50 }), actor);
      const page2 = await report.buildData(dto({}, { page: 2, limit: 50 }), actor);

      expect(page2.rows).toHaveLength(50);
      expect(page2.rows[0][CASH_FUND_ROW_KEYS.ROW_KIND]).toBe('detail');
      expect(page2.rows[0][CASH_FUND_ROW_KEYS.CATEGORY_ID]).toBe(CAT_DIEN);
      // Continues right after page 1's last line, no line repeated or skipped.
      expect(page2.rows[0][LINE_ID_KEY]).not.toBe(page1.rows[50][LINE_ID_KEY]);
      const groupsOnPage2 = page2.rows.filter((r) => r[CASH_FUND_ROW_KEYS.ROW_KIND] === 'group');
      expect(groupsOnPage2.map((r) => r.reason)).toEqual(['Tiền nước']);
      // Flat 50..81 are Tiền điện lines (32), 82 is the Tiền nước header, 83..99 its lines (17).
      expect(page2.rows.indexOf(groupsOnPage2[0])).toBe(32);
      expect(kinds(page2.rows).filter((k) => k === 'detail')).toHaveLength(49);
      expect(page2.total).toBe(page1.total);
      expect(page2.totals).toEqual(page1.totals);

      const page3 = await report.buildData(dto({}, { page: 3, limit: 50 }), actor);
      expect(page3.rows).toHaveLength(123 - 100);
      expect(kinds(page3.rows).every((k) => k === 'detail')).toBe(true);
      expect(page3.totals).toEqual(page1.totals);
    });

    it('a header that lands on the last slot of a page is on that page; the next page opens with its first line', async () => {
      const report = build(rows120);
      // Flat 41 is the Tiền điện header: limit 42 puts it last on page 1.
      const page1 = await report.buildData(dto({}, { page: 1, limit: 42 }), actor);
      const page2 = await report.buildData(dto({}, { page: 2, limit: 42 }), actor);

      expect(page1.rows).toHaveLength(43);
      expect(page1.rows[42]).toMatchObject({ [CASH_FUND_ROW_KEYS.ROW_KIND]: 'group', reason: 'Tiền điện' });
      expect(page2.rows[0]).toMatchObject({
        [CASH_FUND_ROW_KEYS.ROW_KIND]: 'detail',
        [CASH_FUND_ROW_KEYS.CATEGORY_ID]: CAT_DIEN,
      });
      // Flat 42..83: the Tiền điện lines, then the Tiền nước header at 82 — never the cut header.
      expect(page2.rows.filter((r) => r[CASH_FUND_ROW_KEYS.ROW_KIND] === 'group').map((r) => r.reason)).toEqual([
        'Tiền nước',
      ]);
    });

    it('all pages together are exactly the flat list once', async () => {
      const report = build(rows120);
      const seen: ReportRow[] = [];
      for (let page = 1; page <= 3; page += 1) {
        const { rows } = await report.buildData(dto({}, { page, limit: 50 }), actor);
        seen.push(...rows.filter((r) => r[CASH_FUND_ROW_KEYS.ROW_KIND] !== 'grandTotal'));
      }
      expect(seen).toHaveLength(123);
      expect(kinds(seen).filter((k) => k === 'group')).toHaveLength(3);
      const lineIds = seen.filter((r) => r[LINE_ID_KEY]).map((r) => r[LINE_ID_KEY]);
      expect(new Set(lineIds).size).toBe(120);
    });
  });

  describe('filters', () => {
    it('categoryIds = [Tiền điện] keeps one group and pushes the predicate into SQL', async () => {
      const { rows, total, totals } = await build().buildData(dto({ categoryIds: [CAT_DIEN] }), actor);
      expect(kinds(rows)).toEqual(['grandTotal', 'group', 'detail', 'detail']);
      expect(rows[1]).toMatchObject({ reason: 'Tiền điện', amount: 150000 });
      expect(total).toBe(3);
      expect(totals).toEqual({ amount: 150000 });
      const [sql, params] = callsOf(query)[0];
      expect(sql).toContain('v.category_id::text = ANY($5::text[])');
      expect(params[4]).toEqual([CAT_DIEN]);
    });

    it("categoryIds = ['uncategorized'] selects the no-category lines", async () => {
      const { rows } = await build().buildData(dto({ categoryIds: [CASH_FUND_UNCATEGORIZED] }), actor);
      expect(rows.slice(1).map((r) => [r[CASH_FUND_ROW_KEYS.ROW_KIND], r.documentNumber ?? r.reason])).toEqual([
        ['group', 'Chi khác'],
        ['detail', 'PC-04'],
      ]);
      expect(sqlOf(query)[0]).toContain('v.category_id IS NULL');
    });

    it('paymentMethod adds the fund predicate; employeeIds the staff predicate', async () => {
      await build().buildData(dto({ paymentMethod: 'cash', employeeIds: ['u-9'] }), actor);
      const [sql, params] = callsOf(query)[0];
      expect(sql).toMatch(/v\.fund = \$5/);
      expect(params[4]).toBe('cash');
      expect(sql).toMatch(/h\.staff_id = ANY\(\$6::text\[\]\)/);
      expect(params[5]).toEqual(['u-9']);
    });

    it('reads posted, non-reversed payment lines outside the purchase bucket, in the period, in scope', async () => {
      await build().buildData(dto(), actor);
      const [sql, params] = callsOf(query)[0];
      expect(sql).toContain("v.direction = 'out'");
      expect(sql).toContain('v.doc_date >= $3::date AND v.doc_date <= $4::date');
      expect(sql).toContain("NOT ((v.direction = 'in'");
      expect(sql).toContain("'PURCHASE', 'SUPPLIER_PAYMENT'");
      expect(sql).toContain("h.status = 'POSTED'");
      expect(sql).toContain("<> 'REVERSAL'");
      expect(sql).toContain('cash_payment_lines');
      expect(sql).toContain('bank_payment_lines');
      expect(sql).toContain('LEFT JOIN cash_voucher_categories c ON c.id = v.category_id');
      expect(params.slice(0, 4)).toEqual(['org-1', [BRANCH_A], '2026-09-01', '2026-09-30']);
    });

    it('translates column filters to SQL: text ILIKE, number, date, select on fund', async () => {
      await build().buildData(
        dto(
          {},
          {
            columnFilters: [
              { col: 'reason', contains: 'điện' },
              { col: 'amount', lte: 100000 },
              { col: 'docDate', eq: '2026-09-08' },
              { col: 'paymentMethod', equals: 'cash' },
              { col: 'runningBalance', contains: 'x' },
            ],
          },
        ),
        actor,
      );
      const [sql, params] = callsOf(query)[0];
      expect(sql).toContain(`SELECT * FROM (`);
      expect(sql).toContain(`COALESCE(reason, '') ILIKE $5`);
      expect(params[4]).toBe('%điện%');
      expect(sql).toContain('COALESCE(amount, 0) <= $6');
      expect(params[5]).toBe(100000);
      expect(sql).toContain('doc_date = $7::date');
      expect(sql).toContain('fund = $8');
      expect(params[7]).toBe('cash');
      expect(sql).not.toContain('runningBalance');
    });
  });

  describe('scope and validation', () => {
    it('requires the period and rejects from > to', async () => {
      const report = build();
      await expect(report.buildData(dto({ period: undefined }), actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(
        report.buildData(dto({ period: { from: '2026-09-30', to: '2026-09-01' } }), actor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('refuses a store outside the actor assignments without the consolidated permission', async () => {
      await expect(
        build().buildData(dto({ store: { scope: 'group', storeIds: ['b-b'] } }), actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(rbac.hasPermission).toHaveBeenCalledWith('u1', 'org-1', 'reporting.cash.consolidated.read');
    });

    it('a consolidated actor with store = all reads every branch (NULL branch predicate)', async () => {
      rbac.hasPermission.mockResolvedValue(true);
      await build().buildData(dto({ store: { scope: 'all', storeIds: [] } }), actor);
      expect(callsOf(query)[0][1][1]).toBeNull();
    });
  });

  describe('countRows', () => {
    it('counts the detail lines of the filtered set', async () => {
      await expect(build().countRows(dto(), actor)).resolves.toEqual({ total: 4, subject: 'dòng chi' });
    });
  });

  describe('exportSource — keyset over the lines, newest first', () => {
    it('declares the period range, descending order and the summable amount', () => {
      const { exportSource } = build();
      expect(exportSource.order).toBe('desc');
      expect(exportSource.range(dto())).toEqual({ from: '2026-09-01', to: '2026-09-30' });
      expect(exportSource.summable(['docDate', 'amount', 'reason'])).toEqual(['amount']);
    });

    it('pages lines by (doc_date DESC, line_id DESC) with no group / TỔNG CHI rows and the category as a column', async () => {
      const { exportSource } = build();
      const first = await exportSource.page(dto(), actor, { partition: {}, cursor: null, size: 3 });

      expect(kinds(first.rows)).toEqual(['detail', 'detail', 'detail']);
      expect(first.rows.map((r) => [r.documentNumber, r[LINE_ID_KEY], r.categoryName, r.amount])).toEqual([
        ['PC-04', 'l-04', 'Chi khác', 40000],
        ['PC-03', 'l-03', 'Tiền điện', 60000],
        ['PC-02', 'l-02b', 'Tiền nước', 10000],
      ]);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toEqual({ at: '2026-09-08', id: 'l-02b' });
      expect(sqlOf(query)[0]).toContain('ORDER BY doc_date DESC, line_id DESC');

      const second = await exportSource.page(dto(), actor, {
        partition: {},
        cursor: first.nextCursor,
        size: 3,
      });
      expect(second.rows.map((r) => [r.documentNumber, r[LINE_ID_KEY]])).toEqual([['PC-02', 'l-02a']]);
      expect(second.hasMore).toBe(false);
      expect(sqlOf(query)[1]).toContain('doc_date < $');
      expect(sqlOf(query)[1]).toContain('line_id < $');
    });

    it('applies the time partition as a half-open window on the voucher date', async () => {
      const { exportSource } = build();
      await exportSource.page(dto(), actor, {
        partition: { from: new Date('2026-09-08T00:00:00Z'), to: new Date('2026-09-10T00:00:00Z') },
        cursor: null,
        size: 10,
      });
      const [sql, params] = callsOf(query)[0];
      expect(sql).toContain('v.doc_date::timestamp >= $5::timestamp');
      expect(sql).toContain('v.doc_date::timestamp < $6::timestamp');
      expect(params[4]).toBe('2026-09-08T00:00:00.000Z');
      expect(params[5]).toBe('2026-09-10T00:00:00.000Z');
    });
  });
});
