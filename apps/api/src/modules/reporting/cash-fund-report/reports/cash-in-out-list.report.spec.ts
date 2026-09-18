import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CASH_FUND_ROW_KEYS, ReportRow } from '@erp/shared-interfaces';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { RbacService } from '../../../rbac/rbac.service';
import { CashFundReportSearchDto } from '../dto/cash-fund-report-search.dto';
import { CashFundPeriodService } from '../services/cash-fund-period.service';
import { CASH_IN_OUT_LIST_COLUMNS, CashInOutListReport } from './cash-in-out-list.report';

const BRANCH_A = 'b-a';
const actor = {
  userId: 'u1',
  organizationId: 'org-1',
  branchId: BRANCH_A,
  roles: [],
  branchIds: [BRANCH_A],
} as unknown as ActorContext;

/** One row of the `rows` relation as Postgres hands it back (numerics as text). */
interface Raw {
  kind: 'CASH_RECEIPT' | 'CASH_PAYMENT' | 'BANK_RECEIPT' | 'BANK_PAYMENT';
  fund: 'cash' | 'deposit';
  id: string;
  doc_date: string;
  document_number: string;
  reference: string | null;
  amount_in: string;
  amount_out: string;
  signed: string;
  deposit_account: string | null;
  staff_name: string | null;
  partner_code: string | null;
  partner_name: string | null;
  reason: string | null;
  branch_code: string | null;
  branch_name: string | null;
  invoice_number: string | null;
}

function voucher(
  number: string,
  kind: Raw['kind'],
  date: string,
  amount: number,
  extra: Partial<Raw> = {},
): Raw {
  const isIn = kind.endsWith('RECEIPT');
  return {
    kind,
    fund: kind.startsWith('BANK') ? 'deposit' : 'cash',
    id: `id-${number}`,
    doc_date: date,
    document_number: number,
    reference: null,
    amount_in: isIn ? `${amount}.00` : '0',
    amount_out: isIn ? '0' : `${amount}.00`,
    signed: isIn ? `${amount}.00` : `-${amount}.00`,
    deposit_account: null,
    staff_name: 'Thu Ngân',
    partner_code: null,
    partner_name: null,
    reason: null,
    branch_code: 'CN-A',
    branch_name: 'Chi nhánh A',
    invoice_number: null,
    ...extra,
  };
}

/** The 9 posted vouchers of branch A in September 2026 (02-requirements fixture). */
const PERIOD_ROWS: Raw[] = [
  voucher('PT-02', 'CASH_RECEIPT', '2026-09-02', 700000, {
    reference: 'INVOICE HD0001',
    invoice_number: 'HD0001',
  }),
  voucher('PTG-01', 'BANK_RECEIPT', '2026-09-03', 1600000, {
    deposit_account: 'VCB · 0011',
  }),
  voucher('PC-01', 'CASH_PAYMENT', '2026-09-04', 200000, { reason: 'Chi mua hàng hóa' }),
  voucher('PT-03', 'CASH_RECEIPT', '2026-09-05', 300000),
  voucher('PT-04', 'CASH_RECEIPT', '2026-09-06', 50000),
  voucher('PT-05', 'CASH_RECEIPT', '2026-09-07', 20000),
  voucher('PC-02', 'CASH_PAYMENT', '2026-09-08', 100000, { reason: 'Tiền điện nước tháng 9' }),
  voucher('PC-03', 'CASH_PAYMENT', '2026-09-09', 60000, { reason: 'Tiền điện kho' }),
  voucher('PC-04', 'CASH_PAYMENT', '2026-09-10', 40000),
];
/** PT-01: dated before the period, goes into the opening balance. */
const BEFORE_ROWS: Raw[] = [voucher('PT-01', 'CASH_RECEIPT', '2026-08-30', 500000)];

const FIXTURE_OPENING = { cash: 500000, deposit: 1000000 };

const sum = (rows: Raw[], col: 'amount_in' | 'amount_out' | 'signed') =>
  rows.reduce((s, r) => s + Number(r[col]), 0);

const screenOrder = (a: Raw, b: Raw) =>
  a.doc_date.localeCompare(b.doc_date) ||
  a.document_number.localeCompare(b.document_number) ||
  a.id.localeCompare(b.id);
const keysetOrder = (a: Raw, b: Raw) =>
  a.doc_date.localeCompare(b.doc_date) || a.id.localeCompare(b.id);

/**
 * A `DataSource.query` stand-in that answers each of the report's queries from
 * `period` / `before` the way Postgres would evaluate its aggregate / LIMIT /
 * OFFSET — so paging and running-balance arithmetic are exercised for real.
 * The WHERE predicates themselves are asserted on the SQL text by the tests.
 */
function mockQuery(period: Raw[], before: Raw[] = []): jest.Mock {
  const sorted = [...period].sort(screenOrder);
  const keyset = [...period].sort(keysetOrder);
  return jest.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('AS voucher_count')) {
      return [
        {
          voucher_count: sorted.length,
          amount_in: String(sum(sorted, 'amount_in')),
          amount_out: String(sum(sorted, 'amount_out')),
        },
      ];
    }
    if (sql.includes('AS opening_signed')) {
      return [{ opening_signed: String(sum(before, 'signed')) }];
    }
    if (sql.includes('AS signed_before_offset')) {
      const offset = Number(params[params.length - 1]);
      return [{ signed_before_offset: String(sum(sorted.slice(0, offset), 'signed')) }];
    }
    if (sql.includes('AS signed_before_key')) {
      const id = String(params[params.length - 1]);
      const at = String(params[params.length - 2]);
      const preceding = keyset.filter(
        (r) => r.doc_date < at || (r.doc_date === at && r.id < id),
      );
      return [{ signed_before_key: String(sum(preceding, 'signed')) }];
    }
    if (sql.includes('AS cursor_at')) {
      const size = Number(params[params.length - 1]);
      let rows = keyset;
      if (sql.includes('doc_date > $')) {
        const id = String(params[params.length - 2]);
        const at = String(params[params.length - 3]);
        rows = keyset.filter((r) => r.doc_date > at || (r.doc_date === at && r.id > id));
      }
      return rows.slice(0, size).map((r) => ({ ...r, cursor_at: r.doc_date }));
    }
    // The page query: `LIMIT $n OFFSET $m`.
    const offset = Number(params[params.length - 1]);
    const limit = Number(params[params.length - 2]);
    return sorted.slice(offset, offset + limit);
  });
}

function dto(
  filters: Partial<CashFundReportSearchDto['filters']> = {},
  rest: Partial<Omit<CashFundReportSearchDto, 'filters'>> = {},
): CashFundReportSearchDto {
  return {
    reportType: 'cash-in-out-list',
    columns: [...CASH_IN_OUT_LIST_COLUMNS],
    filters: { period: { from: '2026-09-01', to: '2026-09-30' }, ...filters },
    ...rest,
  } as CashFundReportSearchDto;
}

const numbers = (rows: ReportRow[]) => rows.map((r) => r.documentNumber);
const sqlOf = (query: jest.Mock): string[] => query.mock.calls.map((c) => String(c[0]));
const callsOf = (query: jest.Mock): [string, unknown[]][] =>
  query.mock.calls.map((c) => [String(c[0]), c[1] as unknown[]]);

describe('CashInOutListReport', () => {
  let query: jest.Mock;
  let period: { openingBalance: jest.Mock };
  let rbac: { hasPermission: jest.Mock };

  const build = (rows: Raw[] = PERIOD_ROWS, before: Raw[] = BEFORE_ROWS) => {
    query = mockQuery(rows, before);
    return new CashInOutListReport(
      { query } as unknown as DataSource,
      period as unknown as CashFundPeriodService,
      rbac as unknown as RbacService,
    );
  };

  beforeEach(() => {
    period = { openingBalance: jest.fn().mockResolvedValue(FIXTURE_OPENING) };
    rbac = { hasPermission: jest.fn().mockResolvedValue(false) };
  });

  describe('buildColumns', () => {
    it('lists the 16 columns of 00-intent #3 in order with the shared VI labels', async () => {
      const cols = await build().buildColumns();
      expect(cols.map((c) => c.col)).toEqual([...CASH_IN_OUT_LIST_COLUMNS]);
      expect(cols.map((c) => c.name)).toEqual([
        'Ngày chứng từ',
        'Số chứng từ',
        'Loại chứng từ',
        'Tham chiếu',
        'Tiền thu',
        'Tiền chi',
        'Số dư cuối kỳ',
        'Phương thức thanh toán',
        'Tài khoản ngân hàng',
        'Nhân viên thu/chi',
        'Mã đối tượng',
        'Đối tượng nộp/nhận',
        'Diễn giải',
        'Mã cửa hàng',
        'Tên cửa hàng',
        'Số hóa đơn',
      ]);
    });

    it('pins the first four, links the document number and offers the two selects (A-16, A-05)', async () => {
      const cols = await build().buildColumns();
      const byKey = Object.fromEntries(cols.map((c) => [c.col, c]));
      expect(cols.filter((c) => c.pinned === 'left').map((c) => c.col)).toEqual([
        'docDate',
        'documentNumber',
        'documentKind',
        'reference',
      ]);
      expect(byKey.documentNumber.link).toBe(true);
      expect(byKey.docDate).toMatchObject({ type: 'date', filterKind: 'date' });
      expect(byKey.amountIn).toMatchObject({ type: 'currency', filterKind: 'number', align: 'right' });
      expect(byKey.documentKind.filterKind).toBe('select');
      expect(byKey.documentKind.filterOptions).toEqual([
        { value: 'CASH_RECEIPT', label: 'Phiếu thu' },
        { value: 'CASH_PAYMENT', label: 'Phiếu chi' },
        { value: 'BANK_RECEIPT', label: 'Thu tiền gửi' },
        { value: 'BANK_PAYMENT', label: 'Chi tiền gửi' },
      ]);
      expect(byKey.paymentMethod.filterOptions).toEqual([
        { value: 'cash', label: 'Tiền mặt' },
        { value: 'deposit', label: 'Chuyển khoản' },
      ]);
      // Derived from the filtered set — cannot itself be a filter.
      expect(byKey.runningBalance.filterKind).toBe('none');
    });
  });

  describe('AC-08 — opening row, one row per voucher, running balance, footer', () => {
    it('renders the fixture: opening 1.500.000, 9 vouchers, closing 3.770.000, totals 2.670.000 / 400.000', async () => {
      const { rows, totals, total } = await build().buildData(dto(), actor);

      expect(rows).toHaveLength(10);
      expect(rows[0]).toMatchObject({
        reason: 'Số dư đầu kỳ',
        runningBalance: 1500000,
        amountIn: null,
        amountOut: null,
        docDate: null,
        [CASH_FUND_ROW_KEYS.ROW_KIND]: 'opening',
        [CASH_FUND_ROW_KEYS.BOLD]: 1,
      });
      expect(period.openingBalance).toHaveBeenCalledWith(
        { organizationId: 'org-1', branchIds: [BRANCH_A] },
        '2026-09-01',
      );

      const details = rows.slice(1);
      expect(numbers(details)).toEqual([
        'PT-02', 'PTG-01', 'PC-01', 'PT-03', 'PT-04', 'PT-05', 'PC-02', 'PC-03', 'PC-04',
      ]);
      // Each voucher moves money one way; the balance walks forward from the opening row.
      let expected = 1500000;
      for (const r of details) {
        const amountIn = Number(r.amountIn);
        const amountOut = Number(r.amountOut);
        expect((amountIn > 0) !== (amountOut > 0)).toBe(true);
        expected += amountIn - amountOut;
        expect(r.runningBalance).toBe(expected);
      }
      expect(details[details.length - 1].runningBalance).toBe(3770000);
      expect(details.map((r) => r.runningBalance)).toEqual([
        2200000, 3800000, 3600000, 3900000, 3950000, 3970000, 3870000, 3810000, 3770000,
      ]);

      expect(total).toBe(9);
      expect(totals).toMatchObject({ amountIn: 2670000, amountOut: 400000, runningBalance: null });
    });

    it('labels document kind and payment method in Vietnamese and carries the hidden voucher keys', async () => {
      const { rows } = await build().buildData(dto(), actor);
      const byNumber = Object.fromEntries(rows.slice(1).map((r) => [r.documentNumber as string, r]));
      expect(byNumber['PT-02']).toMatchObject({
        documentKind: 'Phiếu thu',
        paymentMethod: 'Tiền mặt',
        reference: 'INVOICE HD0001',
        invoiceNumber: 'HD0001',
        branchCode: 'CN-A',
        branchName: 'Chi nhánh A',
        staffName: 'Thu Ngân',
        [CASH_FUND_ROW_KEYS.ROW_KIND]: 'detail',
        [CASH_FUND_ROW_KEYS.VOUCHER_ID]: 'id-PT-02',
        [CASH_FUND_ROW_KEYS.VOUCHER_KIND]: 'CASH_RECEIPT',
        [CASH_FUND_ROW_KEYS.BOLD]: 0,
        [CASH_FUND_ROW_KEYS.INDENT_LEVEL]: 0,
      });
      expect(byNumber['PTG-01']).toMatchObject({
        documentKind: 'Thu tiền gửi',
        paymentMethod: 'Chuyển khoản',
        depositAccount: 'VCB · 0011',
      });
      expect(byNumber['PC-01']).toMatchObject({ documentKind: 'Phiếu chi', amountOut: 200000, amountIn: 0 });
      const kinds = new Set(rows.slice(1).map((r) => r.documentKind));
      for (const k of kinds) expect(['Phiếu thu', 'Phiếu chi', 'Thu tiền gửi', 'Chi tiền gửi']).toContain(k);
    });

    it('returns no footer for an empty period', async () => {
      const { rows, totals, total } = await build([], []).buildData(dto(), actor);
      expect(rows).toHaveLength(1);
      expect(rows[0][CASH_FUND_ROW_KEYS.ROW_KIND]).toBe('opening');
      expect(totals).toBeNull();
      expect(total).toBe(0);
    });
  });

  describe('SQL — every query reads the shared posted-voucher relation in the period', () => {
    it('carries status = POSTED, no reversal, no soft-delete, org and branch scope, and the period bounds', async () => {
      await build().buildData(dto(), actor);
      const calls = callsOf(query);
      // Page 1 with no narrowing filter: summary + page (opening comes from the period service).
      expect(calls).toHaveLength(2);
      for (const [sql, params] of calls) {
        expect(sql).toContain("h.status = 'POSTED'");
        expect(sql).toContain("h.reference_type::text <> 'REVERSAL'");
        expect(sql).toContain('h.deleted_at IS NULL');
        expect(sql).toContain('h.organization_id = $1');
        expect(sql).toContain('h.branch_id = ANY($2::text[])');
        expect(sql).toContain('v.doc_date >= $3::date AND v.doc_date <= $4::date');
        expect(params.slice(0, 4)).toEqual(['org-1', [BRANCH_A], '2026-09-01', '2026-09-30']);
      }
      const page = sqlOf(query).find((s) => s.includes('OFFSET'))!;
      expect(page).toContain('ORDER BY doc_date ASC, document_number ASC, id ASC');
    });

    it('joins the display columns in the report, not in the shared fragment', async () => {
      await build().buildData(dto(), actor);
      const page = sqlOf(query).find((s) => s.includes('OFFSET'))!;
      expect(page).toContain('LEFT JOIN branches b ON b.id::text = v.branch_id');
      expect(page).toContain('LEFT JOIN users su ON su.id::text = v.staff_id');
      expect(page).toContain('LEFT JOIN deposit_accounts da ON da.id = v.deposit_account_id');
      expect(page).toContain("'INVOICE', 'INVOICE_DEBT', 'INVOICE_KEPT_CHANGE', 'RETURN_CANCEL'");
      expect(page).toContain("v.partner_type = 'EMPLOYEE' AND ep.user_id = v.partner_id");
      expect(page).toContain('COALESCE(v.partner_name, v.party_name) AS partner_name');
    });
  });

  describe('AC-09 filters — fund and staff', () => {
    it('paymentMethod = cash restricts the fund and the opening balance to cash', async () => {
      const cashRows = PERIOD_ROWS.filter((r) => r.fund === 'cash');
      const { rows, totals } = await build(cashRows).buildData(dto({ paymentMethod: 'cash' }), actor);
      for (const [sql, params] of callsOf(query)) {
        expect(sql).toContain('v.fund = $5');
        expect(params[4]).toBe('cash');
      }
      expect(rows[0].runningBalance).toBe(500000);
      expect(numbers(rows)).not.toContain('PTG-01');
      expect(totals).toMatchObject({ amountIn: 1070000, amountOut: 400000 });
      expect(rows[rows.length - 1].runningBalance).toBe(1170000);
    });

    it('fundKind (drill-down from "Tình hình thu chi" IV) is the same predicate', async () => {
      const depositRows = PERIOD_ROWS.filter((r) => r.fund === 'deposit');
      const { rows } = await build(depositRows).buildData(dto({ fundKind: 'deposit' }), actor);
      expect(callsOf(query)[0][1][4]).toBe('deposit');
      expect(rows[0].runningBalance).toBe(1000000);
      expect(numbers(rows.slice(1))).toEqual(['PTG-01']);
      expect(rows[1].runningBalance).toBe(2600000);
    });

    it('employeeIds restricts staff_id and takes the opening from the same staff’s vouchers before the period', async () => {
      const { rows } = await build(PERIOD_ROWS, BEFORE_ROWS).buildData(
        dto({ employeeIds: ['u-cashier'] }),
        actor,
      );
      for (const [sql, params] of callsOf(query)) {
        expect(sql).toMatch(/v\.staff_id = ANY\(\$\d+::text\[\]\)/);
        expect(params).toContainEqual(['u-cashier']);
      }
      // Narrowed set: opening = Σ signed of matching vouchers before `from`, not the fund balance.
      expect(period.openingBalance).not.toHaveBeenCalled();
      const opening = callsOf(query).find(([sql]) => sql.includes('AS opening_signed'))!;
      expect(opening[0]).toContain('v.doc_date < $3::date');
      expect(opening[1].slice(0, 3)).toEqual(['org-1', [BRANCH_A], '2026-09-01']);
      expect(rows[0].runningBalance).toBe(500000);
    });
  });

  describe('AC-10 — column filters narrow rows, opening balance and totals together', () => {
    it('Diễn giải contains "Tiền điện" → PC-02 and PC-03 only, opening/totals on that set', async () => {
      const matching = PERIOD_ROWS.filter((r) => r.reason?.includes('Tiền điện'));
      const { rows, totals, total } = await build(matching, []).buildData(
        dto({}, { columnFilters: [{ col: 'reason', contains: 'Tiền điện' }] }),
        actor,
      );
      for (const [sql, params] of callsOf(query)) {
        expect(sql).toContain("SELECT * FROM (SELECT v.kind");
        expect(sql).toMatch(/filtered WHERE COALESCE\(reason, ''\) ILIKE \$\d+/);
        expect(params).toContain('%Tiền điện%');
      }
      expect(numbers(rows.slice(1))).toEqual(['PC-02', 'PC-03']);
      expect(total).toBe(2);
      expect(period.openingBalance).not.toHaveBeenCalled();
      expect(rows[0].runningBalance).toBe(0);
      expect(totals).toMatchObject({ amountIn: 0, amountOut: 160000 });
      expect(rows.map((r) => r.runningBalance)).toEqual([0, -100000, -160000]);
    });

    it('Tiền chi ≤ 100.000 drops PC-01 and keeps the receipts (NULL / other direction reads as 0)', async () => {
      const matching = PERIOD_ROWS.filter((r) => Number(r.amount_out) <= 100000);
      const { rows, totals, total } = await build(matching, BEFORE_ROWS).buildData(
        dto({}, { columnFilters: [{ col: 'amountOut', lte: 100000 }] }),
        actor,
      );
      for (const [sql, params] of callsOf(query)) {
        expect(sql).toMatch(/COALESCE\(amount_out, 0\) <= \$\d+/);
        expect(params).toContain(100000);
      }
      expect(numbers(rows)).not.toContain('PC-01');
      expect(numbers(rows.slice(1))).toContain('PT-02');
      expect(total).toBe(8);
      // Opening = PT-01 (500.000, amount_out 0 ≤ 100.000) via the narrowed query.
      expect(rows[0].runningBalance).toBe(500000);
      expect(totals).toMatchObject({ amountIn: 2670000, amountOut: 200000 });
      expect(rows[rows.length - 1].runningBalance).toBe(2970000);
    });

    it('translates the other operators: select equals on the raw kind, date eq, text startsWith with escaped wildcards', async () => {
      await build([], []).buildData(
        dto(
          {},
          {
            columnFilters: [
              { col: 'documentKind', equals: 'CASH_PAYMENT' },
              { col: 'paymentMethod', equals: 'deposit' },
              { col: 'docDate', eq: '2026-09-08' },
              { col: 'documentNumber', startsWith: 'PC_' },
              { col: 'runningBalance', gte: 1 }, // not filterable — ignored
            ],
          },
        ),
        actor,
      );
      const [sql, params] = callsOf(query)[0];
      expect(sql).toMatch(/kind = \$\d+/);
      expect(sql).toMatch(/fund = \$\d+/);
      expect(sql).toMatch(/doc_date = \$\d+::date/);
      expect(sql).toMatch(/COALESCE\(document_number, ''\) LIKE \$\d+/);
      expect(sql).not.toContain('runningBalance');
      expect(params.slice(4)).toEqual(['CASH_PAYMENT', 'deposit', '2026-09-08', 'PC\\_%']);
    });
  });

  describe('paging', () => {
    it('page 2 with limit 3 continues the balance from the SQL sum before the offset and has no opening row', async () => {
      const { rows, total } = await build().buildData(dto({}, { page: 2, limit: 3 }), actor);
      expect(numbers(rows)).toEqual(['PT-03', 'PT-04', 'PT-05']);
      expect(rows.every((r) => r[CASH_FUND_ROW_KEYS.ROW_KIND] === 'detail')).toBe(true);
      expect(rows.map((r) => r.runningBalance)).toEqual([3900000, 3950000, 3970000]);
      expect(total).toBe(9);

      const before = callsOf(query).find(([sql]) => sql.includes('AS signed_before_offset'))!;
      expect(before[0]).toContain('ORDER BY doc_date ASC, document_number ASC, id ASC');
      expect(before[0]).toMatch(/LIMIT \$\d+\) s/);
      expect(before[1][before[1].length - 1]).toBe(3);

      const page = callsOf(query).find(([sql]) => sql.includes('OFFSET'))!;
      expect(page[1].slice(-2)).toEqual([3, 3]);
    });

    it('page 1 does not run the before-offset query', async () => {
      await build().buildData(dto({}, { page: 1, limit: 3 }), actor);
      expect(sqlOf(query).some((s) => s.includes('AS signed_before_offset'))).toBe(false);
    });
  });

  it('countRows counts vouchers, named for the row-cap error', async () => {
    await expect(build().countRows(dto(), actor)).resolves.toEqual({ total: 9, subject: 'chứng từ' });
  });

  describe('exportSource (keyset on (doc_date, id), ascending)', () => {
    it('declares the period as its range and only the two money columns as summable', () => {
      const report = build();
      expect(report.exportSource.order).toBe('asc');
      expect(report.exportSource.range(dto())).toEqual({ from: '2026-09-01', to: '2026-09-30' });
      expect(report.exportSource.range(dto({ period: undefined }))).toBeNull();
      expect(report.exportSource.summable([...CASH_IN_OUT_LIST_COLUMNS])).toEqual(['amountIn', 'amountOut']);
    });

    it('pages by (doc_date, id) ascending within the partition, returning the next cursor and a running balance', async () => {
      const report = build();
      const partition = { from: new Date('2026-09-01T00:00:00.000Z'), to: new Date('2026-09-30T00:00:00.001Z') };
      const first = await report.exportSource.page(dto(), actor, { partition, cursor: null, size: 4 });

      const [sql, params] = callsOf(query).find(([s]) => s.includes('AS cursor_at'))!;
      expect(sql).toContain('ORDER BY doc_date ASC, id ASC');
      expect(sql).not.toContain('OFFSET');
      expect(sql).toMatch(/v\.doc_date::timestamp >= \$\d+::timestamp/);
      expect(sql).toMatch(/v\.doc_date::timestamp < \$\d+::timestamp/);
      expect(params).toContain('2026-09-01T00:00:00.000Z');
      expect(params).toContain('2026-09-30T00:00:00.001Z');
      expect(params[params.length - 1]).toBe(4);

      expect(first.rows.map((r) => r.documentNumber)).toEqual(['PT-02', 'PTG-01', 'PC-01', 'PT-03']);
      expect(first.rows.every((r) => r[CASH_FUND_ROW_KEYS.ROW_KIND] === 'detail')).toBe(true);
      expect(first.rows.map((r) => r.runningBalance)).toEqual([2200000, 3800000, 3600000, 3900000]);
      expect(first.nextCursor).toEqual({ at: '2026-09-05', id: 'id-PT-03' });
      expect(first.hasMore).toBe(true);

      const second = await report.exportSource.page(dto(), actor, {
        partition,
        cursor: first.nextCursor,
        size: 4,
      });
      const cursored = callsOf(query).filter(([s]) => s.includes('AS cursor_at'))[1];
      expect(cursored[0]).toMatch(/doc_date > \$(\d+)::date OR \(doc_date = \$\1::date AND id > \$\d+::uuid\)/);
      expect(cursored[1].slice(-3)).toEqual(['2026-09-05', 'id-PT-03', 4]);
      expect(second.rows.map((r) => r.documentNumber)).toEqual(['PT-04', 'PT-05', 'PC-02', 'PC-03']);
      expect(second.rows.map((r) => r.runningBalance)).toEqual([3950000, 3970000, 3870000, 3810000]);

      const last = await report.exportSource.page(dto(), actor, {
        partition,
        cursor: second.nextCursor,
        size: 4,
      });
      expect(last.rows.map((r) => r.documentNumber)).toEqual(['PC-04']);
      expect(last.rows[0].runningBalance).toBe(3770000);
      expect(last.hasMore).toBe(false);
    });

    it('skips the balance query when runningBalance is not an exported column', async () => {
      const report = build();
      const page = await report.exportSource.page(
        dto({}, { columns: ['docDate', 'documentNumber', 'amountIn', 'amountOut'] }),
        actor,
        { partition: {}, cursor: null, size: 100 },
      );
      expect(page.rows[0].runningBalance).toBeNull();
      expect(sqlOf(query).some((s) => s.includes('AS signed_before_key'))).toBe(false);
      expect(period.openingBalance).not.toHaveBeenCalled();
    });
  });

  describe('scope and validation', () => {
    it('requires a period and rejects an inverted one', async () => {
      const report = build();
      await expect(report.buildData(dto({ period: undefined }), actor)).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        report.buildData(dto({ period: { from: '2026-09-30', to: '2026-09-01' } }), actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('clamps the store scope to the actor’s branches without the consolidated key', async () => {
      const report = build();
      await expect(
        report.buildData(dto({ store: { scope: 'group', storeIds: ['b-b'] } }), actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await report.buildData(dto({ store: { scope: 'all', storeIds: [] } }), actor);
      expect(callsOf(query)[0][1][1]).toEqual([BRANCH_A]);
    });

    it('drops the branch predicate for a consolidated actor on "all stores"', async () => {
      rbac.hasPermission.mockResolvedValue(true);
      await build().buildData(dto({ store: { scope: 'all', storeIds: [] } }), actor);
      expect(callsOf(query)[0][1][1]).toBeNull();
      expect(period.openingBalance).toHaveBeenCalledWith({ organizationId: 'org-1', branchIds: null }, '2026-09-01');
    });
  });
});
