import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  request,
  SeedResult,
} from './setup/test-app';
import { CashFundFixture, seedCashFundFixture } from './setup/cash-fund-fixture';

/**
 * The three "Chi tiền" reports end to end on the fixture of `02-requirements.md`
 * (AC-12 .. AC-18): "Chi tiền theo mục chi" (#4), "Bảng kê tiền chi theo mục
 * chi" (#5) and "Chi tiền theo thời gian" (#6).
 *
 * Expense lines of branch A in 09/2026 (PC-01 is a supplier payment, PC-05 is
 * reversed, PC-07 is a draft, PC-06 sits on branch B — none of them count):
 *   PC-02 08/09  Tiền điện 90.000 + Tiền nước 10.000
 *   PC-03 09/09  Tiền điện 60.000
 *   PC-04 10/09  (no category → "Chi khác") 40.000
 *
 * The drill-downs (AC-13, AC-18) are FE dialogs; here they are checked as the
 * request the dialog issues: #5 with `categoryIds` / the bucket's date range.
 *
 * AC-15 needs 120 detail lines in 3 groups, which the shared fixture does not
 * carry. This spec posts them through the real endpoint in 10/2026 (so every
 * September assertion is untouched): 40 lines without a category (1.000 each),
 * 40 on Tiền điện (2.000 each), 40 on Tiền nước (3.000 each).
 */
describe('Cash-fund expense reports "Chi tiền theo mục chi / Bảng kê tiền chi theo mục chi / Chi tiền theo thời gian" (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let fx: CashFundFixture;

  const BY_CATEGORY = 'expenses-by-category';
  const LIST = 'expense-list-by-category';
  const BY_TIME = 'expenses-by-time';

  const BY_CATEGORY_COLUMNS = ['categoryId', 'categoryName', 'categoryKind', 'amount'];
  const LIST_COLUMNS = [
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
  ];
  const BY_TIME_COLUMNS = ['bucket', 'amount'];

  const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' };
  const OCTOBER = { from: '2026-10-01', to: '2026-10-31' };
  const YEAR = { from: '2026-01-01', to: '2026-12-31' };

  /** AC-15 seed: lines per group, unit amount per group. */
  const EXTRA_PER_GROUP = 40;
  const EXTRA_UNIT = { uncategorized: 1000, tienDien: 2000, tienNuoc: 3000 };
  const EXTRA_TOTAL =
    EXTRA_PER_GROUP * (EXTRA_UNIT.uncategorized + EXTRA_UNIT.tienDien + EXTRA_UNIT.tienNuoc); // 240.000

  /** `document_number` and the calendar date, read straight from the voucher table. */
  interface DbVoucher {
    documentNumber: string;
    date: string;
  }
  let db: Record<string, DbVoucher>;

  const headers = (token = seed.accessToken, branchId = seed.branchId) => ({
    Authorization: authHeader(token),
    'X-Branch-Id': branchId,
  });

  const searchBody = (
    reportType: string,
    columns: string[],
    filters: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) => ({ reportType, columns, filters, ...extra });

  type SearchResult = { rows: any[]; totals: any; total: number };

  const run = async (
    reportType: string,
    columns: string[],
    filters: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ): Promise<SearchResult> => {
    const res = await request(app.getHttpServer())
      .post('/reports/cash-fund/search')
      .set(headers())
      .send(searchBody(reportType, columns, filters, extra))
      .expect(201);
    return res.body;
  };

  const storeA = { scope: 'group', storeIds: [] as string[] };

  /** #4 and #6 take the header branch as `filters.branchId`; #5 takes the store picker. */
  const byCategory = (filters: Record<string, unknown>, extra = {}) =>
    run(BY_CATEGORY, BY_CATEGORY_COLUMNS, { branchId: fx.branchAId, ...filters }, extra);
  const list = (filters: Record<string, unknown>, extra = {}) =>
    run(LIST, LIST_COLUMNS, { store: storeA, ...filters }, extra);
  const byTime = (filters: Record<string, unknown>, extra = {}) =>
    run(BY_TIME, BY_TIME_COLUMNS, { branchId: fx.branchAId, ...filters }, extra);

  const ofKind = (rows: any[], kind: string) => rows.filter((r) => r.rowKind === kind);
  const details = (rows: any[]) => ofKind(rows, 'detail');
  const groups = (rows: any[]) => ofKind(rows, 'group');

  async function readSheet(body: Buffer): Promise<ExcelJS.Worksheet> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body as unknown as ArrayBuffer);
    return workbook.worksheets[0];
  }

  function findRow(sheet: ExcelJS.Worksheet, predicate: (first: string) => boolean): number {
    for (let r = 1; r <= sheet.rowCount; r++) {
      const v = sheet.getRow(r).getCell(1).value;
      if (typeof v === 'string' && predicate(v)) return r;
    }
    throw new Error('row not found');
  }

  async function loadDbVouchers(): Promise<Record<string, DbVoucher>> {
    const out: Record<string, DbVoucher> = {};
    for (const key of ['PC02', 'PC03', 'PC04'] as const) {
      const [row] = await ds.query(
        `SELECT document_number, voucher_date::text AS d FROM cash_payments WHERE id = $1`,
        [fx.vouchers[key]],
      );
      out[key] = { documentNumber: row.document_number, date: row.d };
    }
    return out;
  }

  /** AC-15 data: 120 EXPENSE lines on branch A in 10/2026, dates spread over the month. */
  async function seedOctoberLines(): Promise<void> {
    const expenseGl = await ds.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = '642' LIMIT 1`,
      [seed.organizationId],
    );
    const contraAccountId: string = expenseGl[0].id;
    const groupsToSeed: { categoryId?: string; amount: number; description: string }[] = [
      { amount: EXTRA_UNIT.uncategorized, description: 'Chi khác T10' },
      { categoryId: fx.categories.tienDien, amount: EXTRA_UNIT.tienDien, description: 'Tiền điện T10' },
      { categoryId: fx.categories.tienNuoc, amount: EXTRA_UNIT.tienNuoc, description: 'Tiền nước T10' },
    ];
    for (const g of groupsToSeed) {
      for (let i = 0; i < EXTRA_PER_GROUP; i++) {
        const day = String(1 + (i % 31)).padStart(2, '0');
        await request(app.getHttpServer())
          .post('/cash-payments')
          .set(headers())
          .send({
            voucherDate: `2026-10-${day}`,
            purpose: 'EXPENSE',
            cashAccountId: fx.cashAccountAId,
            contraAccountId,
            totalAmount: g.amount,
            staffId: fx.staff.admin.userId,
            lines: [
              {
                description: `${g.description} #${i + 1}`,
                amount: g.amount,
                ...(g.categoryId ? { categoryId: g.categoryId } : {}),
              },
            ],
          })
          .expect(201);
      }
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    fx = await seedCashFundFixture(app, seed);
    storeA.storeIds = [fx.branchAId];
    db = await loadDbVouchers();
    await seedOctoberLines();
  }, 300000);

  afterAll(async () => {
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  // ---------------------------------------------------------------------------
  // #4 — Chi tiền theo mục chi
  // ---------------------------------------------------------------------------
  describe('AC-12 — "Chi tiền theo mục chi": one row per mục chi, largest first', () => {
    let body: SearchResult;

    beforeAll(async () => {
      body = await byCategory({ period: SEPTEMBER });
    });

    it('exactly 3 rows: Tiền điện 150.000, Chi khác 40.000, Tiền nước 10.000', () => {
      expect(body.rows.map((r) => [r.categoryName, r.amount])).toEqual([
        ['Tiền điện', 150000],
        ['Chi khác', 40000],
        ['Tiền nước', 10000],
      ]);
      expect(body.total).toBe(3);
    });

    it('categoryId is the drill-down key ("uncategorized" for Chi khác); categoryKind = the category code', () => {
      expect(body.rows.map((r) => r.categoryId)).toEqual([
        fx.categories.tienDien,
        'uncategorized',
        fx.categories.tienNuoc,
      ]);
      expect(body.rows.map((r) => r.categoryKind)).toEqual(['TIEN_DIEN', null, 'TIEN_NUOC']);
      for (const r of body.rows) {
        expect(r).toMatchObject({ rowKind: 'detail', bold: 0, indentLevel: 0 });
      }
    });

    it('totals = 200.000; no row for the supplier payment (PC-01), the reversed Tiền lương (PC-05), nor Tiền thuê', () => {
      expect(body.totals).toEqual({ amount: 200000 });
      const names = body.rows.map((r) => r.categoryName);
      expect(names).not.toContain('Tiền lương');
      expect(names).not.toContain('Tiền thuê');
      expect(names).not.toContain('Chi mua hàng hóa');
      expect(body.rows.reduce((s, r) => s + r.amount, 0)).toBe(200000);
    });

    it('branch B in the same period → only Tiền điện 30.000 (PC-06); the draft PC-07 never counts', async () => {
      const b = await byCategory({ period: SEPTEMBER, branchId: fx.branchBId });
      expect(b.rows.map((r) => [r.categoryName, r.amount])).toEqual([['Tiền điện', 30000]]);
      expect(b.totals.amount).toBe(30000);
    });

    it('columns endpoint: categoryId, categoryName (link), categoryKind, amount', async () => {
      const res = await request(app.getHttpServer())
        .get(`/reports/cash-fund/columns?reportType=${BY_CATEGORY}`)
        .set(headers())
        .expect(200);
      const columns: any[] = res.body.columns;
      expect(columns.map((c) => c.col)).toEqual(BY_CATEGORY_COLUMNS);
      expect(columns.map((c) => c.name)).toEqual(['ID Mục chi', 'Mục chi', 'Loại Mục chi', 'Số tiền chi']);
      expect(columns.filter((c) => c.link).map((c) => c.col)).toEqual(['categoryName']);
    });
  });

  describe('AC-13 — drill-down from a mục chi = #5 with categoryIds', () => {
    it('categoryIds = [Tiền điện] → TỔNG CHI 150.000, one group, PC-03 (60.000) then PC-02 (90.000)', async () => {
      const body = await list({ period: SEPTEMBER, categoryIds: [fx.categories.tienDien] });
      expect(body.rows[0]).toMatchObject({ rowKind: 'grandTotal', reason: 'TỔNG CHI', amount: 150000 });
      expect(groups(body.rows).map((g) => [g.reason, g.amount])).toEqual([['Tiền điện', 150000]]);
      expect(details(body.rows).map((d) => [d.documentNumber, d.amount])).toEqual([
        [db.PC03.documentNumber, 60000],
        [db.PC02.documentNumber, 90000],
      ]);
      expect(details(body.rows).map((d) => d.voucherId)).toEqual([fx.vouchers.PC03, fx.vouchers.PC02]);
      expect(body.total).toBe(3);
      expect(body.totals.amount).toBe(150000);
    });

    it('categoryIds = ["uncategorized"] → one group Chi khác with PC-04 (40.000)', async () => {
      const body = await list({ period: SEPTEMBER, categoryIds: ['uncategorized'] });
      expect(body.rows[0]).toMatchObject({ rowKind: 'grandTotal', amount: 40000 });
      expect(groups(body.rows).map((g) => [g.reason, g.amount, g.categoryId])).toEqual([
        ['Chi khác', 40000, 'uncategorized'],
      ]);
      expect(details(body.rows).map((d) => [d.documentNumber, d.amount, d.categoryId])).toEqual([
        [db.PC04.documentNumber, 40000, 'uncategorized'],
      ]);
      expect(body.total).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // #5 — Bảng kê tiền chi theo mục chi
  // ---------------------------------------------------------------------------
  describe('AC-14 — "Bảng kê tiền chi theo mục chi": TỔNG CHI, group rows, indented lines', () => {
    let body: SearchResult;

    beforeAll(async () => {
      body = await list({ period: SEPTEMBER }, { page: 1, limit: 50 });
    });

    it('row 0 is "TỔNG CHI" = 200.000, bold, with no document columns', () => {
      expect(body.rows[0]).toMatchObject({
        rowKind: 'grandTotal',
        reason: 'TỔNG CHI',
        amount: 200000,
        bold: 1,
        indentLevel: 0,
      });
      expect(body.rows[0].docDate).toBeNull();
      expect(body.rows[0].documentNumber).toBeNull();
    });

    it('flat layout: Chi khác → PC-04; Tiền điện → PC-03, PC-02; Tiền nước → PC-02 — 7 rows counted, 8 shown', () => {
      expect(body.total).toBe(7);
      expect(body.rows).toHaveLength(8);
      expect(body.rows.map((r) => r.rowKind)).toEqual([
        'grandTotal',
        'group',
        'detail',
        'group',
        'detail',
        'detail',
        'group',
        'detail',
      ]);
      expect(groups(body.rows).map((g) => [g.reason, g.amount, g.categoryId])).toEqual([
        ['Chi khác', 40000, 'uncategorized'],
        ['Tiền điện', 150000, fx.categories.tienDien],
        ['Tiền nước', 10000, fx.categories.tienNuoc],
      ]);
      expect(details(body.rows).map((d) => [d.documentNumber, d.amount, d.categoryId])).toEqual([
        [db.PC04.documentNumber, 40000, 'uncategorized'],
        [db.PC03.documentNumber, 60000, fx.categories.tienDien],
        [db.PC02.documentNumber, 90000, fx.categories.tienDien],
        [db.PC02.documentNumber, 10000, fx.categories.tienNuoc],
      ]);
    });

    it('group rows are bold with the name in "Diễn giải"; details are indented and carry the hidden keys', () => {
      for (const g of groups(body.rows)) {
        expect(g).toMatchObject({ bold: 1, indentLevel: 0 });
        expect(g.docDate).toBeNull();
        expect(g.documentNumber).toBeNull();
      }
      const d = details(body.rows);
      expect(d.map((r) => r.voucherId)).toEqual([
        fx.vouchers.PC04,
        fx.vouchers.PC03,
        fx.vouchers.PC02,
        fx.vouchers.PC02,
      ]);
      for (const r of d) {
        expect(r).toMatchObject({ bold: 0, indentLevel: 1, voucherKind: 'CASH_PAYMENT' });
        expect(typeof r.lineId).toBe('string');
        expect(r.lineId).toMatch(/^[0-9a-f-]{36}$/);
      }
      // The two PC-02 lines are different lines of the same voucher.
      expect(d[2].lineId).not.toBe(d[3].lineId);
    });

    it('docDate of every detail equals the DB voucher_date (no one-day shift, T-02-07)', () => {
      const d = details(body.rows);
      expect(d.map((r) => r.docDate)).toEqual([db.PC04.date, db.PC03.date, db.PC02.date, db.PC02.date]);
      expect(d[0].docDate).toBe('2026-09-10');
      expect(d[2].docDate).toBe('2026-09-08');
    });

    it('detail columns: Tiền mặt, the staff, the branch, the line description as Diễn giải', () => {
      const d = details(body.rows);
      for (const r of d) {
        expect(r.paymentMethod).toBe('Tiền mặt');
        expect(r.staffName).toBe(fx.staff.admin.name);
        expect(r.branchName).toBe('Main Branch');
        expect(r.depositAccount).toBeNull();
        expect(r.invoiceNumber).toBeNull();
      }
      expect(d.map((r) => r.reason)).toEqual(['Hoàn tiền khách', 'Tiền điện kho', 'Tiền điện', 'Tiền nước']);
    });

    it('totals = 200.000 over the whole set; PC-01, PC-05, PC-06, PC-07 are absent', () => {
      expect(body.totals).toEqual({ amount: 200000 });
      const ids = details(body.rows).map((r) => r.voucherId);
      for (const k of ['PC01', 'PC05', 'PC05R', 'PC06', 'PC07'] as const) {
        expect(ids).not.toContain(fx.vouchers[k]);
      }
    });

    it('paymentMethod / employeeIds narrow the same line set (deposit → nothing; branch-B user → nothing on A)', async () => {
      const deposit = await list({ period: SEPTEMBER, paymentMethod: 'deposit' });
      expect(deposit.total).toBe(0);
      expect(deposit.rows).toEqual([expect.objectContaining({ rowKind: 'grandTotal', amount: 0 })]);
      expect(deposit.totals).toBeNull();

      const staffB = await list({ period: SEPTEMBER, employeeIds: [fx.staff.branchB.userId] });
      expect(staffB.total).toBe(0);

      const cash = await list({ period: SEPTEMBER, paymentMethod: 'cash', employeeIds: [fx.staff.admin.userId] });
      expect(cash.total).toBe(7);
      expect(cash.totals.amount).toBe(200000);
    });

    it('a column filter on Diễn giải keeps the group subtotal and TỔNG CHI on the filtered set', async () => {
      const filtered = await list(
        { period: SEPTEMBER },
        { columnFilters: [{ col: 'reason', contains: 'tiền điện' }] },
      );
      expect(filtered.rows[0]).toMatchObject({ rowKind: 'grandTotal', amount: 150000 });
      expect(groups(filtered.rows).map((g) => [g.reason, g.amount])).toEqual([['Tiền điện', 150000]]);
      expect(details(filtered.rows)).toHaveLength(2);
      expect(filtered.total).toBe(3);
    });

    it('columns endpoint: 14 columns, docDate/documentNumber pinned, documentNumber a link, categoryName last', async () => {
      const res = await request(app.getHttpServer())
        .get(`/reports/cash-fund/columns?reportType=${LIST}`)
        .set(headers())
        .expect(200);
      const columns: any[] = res.body.columns;
      expect(columns.map((c) => c.col)).toEqual(LIST_COLUMNS);
      expect(columns.filter((c) => c.pinned === 'left').map((c) => c.col)).toEqual(['docDate', 'documentNumber']);
      expect(columns.filter((c) => c.link).map((c) => c.col)).toEqual(['documentNumber']);
      expect(columns.find((c) => c.col === 'categoryName').name).toBe('Mục chi');
    });
  });

  describe('AC-15 — paging over the flat list (120 lines in 3 groups, 10/2026)', () => {
    let page1: SearchResult;
    let page2: SearchResult;
    let page3: SearchResult;
    const TOTAL_ROWS = 3 + 3 * EXTRA_PER_GROUP; // 123

    beforeAll(async () => {
      page1 = await list({ period: OCTOBER }, { page: 1, limit: 50 });
      page2 = await list({ period: OCTOBER }, { page: 2, limit: 50 });
      page3 = await list({ period: OCTOBER }, { page: 3, limit: 50 });
    });

    it('total counts group rows and detail rows, not TỔNG CHI: 3 + 120 = 123 on every page', () => {
      expect([page1.total, page2.total, page3.total]).toEqual([TOTAL_ROWS, TOTAL_ROWS, TOTAL_ROWS]);
    });

    it('page 1 = TỔNG CHI + 50 flat rows: Chi khác (40 lines) then Tiền điện cut after 8 lines', () => {
      expect(page1.rows).toHaveLength(51);
      expect(page1.rows[0]).toMatchObject({ rowKind: 'grandTotal', amount: EXTRA_TOTAL });
      expect(page1.rows[1]).toMatchObject({
        rowKind: 'group',
        reason: 'Chi khác',
        amount: EXTRA_PER_GROUP * EXTRA_UNIT.uncategorized,
        categoryId: 'uncategorized',
      });
      const flat = page1.rows.slice(1);
      expect(flat.map((r) => r.rowKind).filter((k) => k === 'group')).toHaveLength(2);
      expect(flat[41]).toMatchObject({
        rowKind: 'group',
        reason: 'Tiền điện',
        amount: EXTRA_PER_GROUP * EXTRA_UNIT.tienDien,
        categoryId: fx.categories.tienDien,
      });
      expect(flat.slice(1, 41).every((r) => r.rowKind === 'detail' && r.categoryId === 'uncategorized')).toBe(true);
      expect(flat.slice(1, 41).every((r) => r.amount === EXTRA_UNIT.uncategorized)).toBe(true);
      expect(
        flat.slice(42).every((r) => r.rowKind === 'detail' && r.categoryId === fx.categories.tienDien),
      ).toBe(true);
      expect(flat.slice(42)).toHaveLength(8);
      // Details inside a group are newest first.
      const dates = flat.slice(1, 41).map((r) => r.docDate);
      expect([...dates].sort().reverse()).toEqual(dates);
      expect(dates[0]).toBe('2026-10-31');
    });

    it('page 2 starts at flat row 51 — a Tiền điện detail, no repeated group header — then Tiền nước', () => {
      expect(page2.rows).toHaveLength(50);
      expect(page2.rows.some((r) => r.rowKind === 'grandTotal')).toBe(false);
      expect(page2.rows[0]).toMatchObject({ rowKind: 'detail', categoryId: fx.categories.tienDien });
      expect(groups(page2.rows).map((g) => [g.reason, g.amount])).toEqual([
        ['Tiền nước', EXTRA_PER_GROUP * EXTRA_UNIT.tienNuoc],
      ]);
      expect(page2.rows.slice(0, 32).every((r) => r.rowKind === 'detail' && r.categoryId === fx.categories.tienDien)).toBe(true);
      expect(page2.rows[32]).toMatchObject({ rowKind: 'group', reason: 'Tiền nước' });
      expect(page2.rows.slice(33).every((r) => r.rowKind === 'detail' && r.categoryId === fx.categories.tienNuoc)).toBe(true);
      expect(page2.rows.slice(33)).toHaveLength(17);
    });

    it('page 3 holds the remaining 23 Tiền nước lines and nothing else', () => {
      expect(page3.rows).toHaveLength(23);
      expect(page3.rows.every((r) => r.rowKind === 'detail' && r.categoryId === fx.categories.tienNuoc)).toBe(true);
      expect(page3.rows.every((r) => r.amount === EXTRA_UNIT.tienNuoc)).toBe(true);
    });

    it('the three pages are one flat list: 3 group rows + 120 distinct lines, no line twice', () => {
      const flat = [...page1.rows.slice(1), ...page2.rows, ...page3.rows];
      expect(flat).toHaveLength(TOTAL_ROWS);
      expect(groups(flat)).toHaveLength(3);
      const lineIds = details(flat).map((r) => r.lineId);
      expect(lineIds).toHaveLength(3 * EXTRA_PER_GROUP);
      expect(new Set(lineIds).size).toBe(3 * EXTRA_PER_GROUP);
    });

    it('the footer is the whole set on every page: 240.000', () => {
      expect(page1.totals).toEqual({ amount: EXTRA_TOTAL });
      expect(page2.totals).toEqual({ amount: EXTRA_TOTAL });
      expect(page3.totals).toEqual({ amount: EXTRA_TOTAL });
    });

    it('a page past the end is empty but still reports total and totals', async () => {
      const page4 = await list({ period: OCTOBER }, { page: 4, limit: 50 });
      expect(page4.rows).toEqual([]);
      expect(page4.total).toBe(TOTAL_ROWS);
      expect(page4.totals).toEqual({ amount: EXTRA_TOTAL });
    });
  });

  // ---------------------------------------------------------------------------
  // #6 — Chi tiền theo thời gian
  // ---------------------------------------------------------------------------
  describe('AC-16 — "Chi tiền theo thời gian": day / week / month buckets', () => {
    it('day, 09/2026 → 08/09 100.000; 09/09 60.000; 10/09 40.000; totals 200.000; no empty days', async () => {
      const body = await byTime({ period: SEPTEMBER, timeBucket: 'day' });
      expect(body.rows.map((r) => [r.bucket, r.amount])).toEqual([
        ['08/09/2026', 100000],
        ['09/09/2026', 60000],
        ['10/09/2026', 40000],
      ]);
      expect(body.rows.map((r) => [r.bucketFrom, r.bucketTo])).toEqual([
        ['2026-09-08', '2026-09-08'],
        ['2026-09-09', '2026-09-09'],
        ['2026-09-10', '2026-09-10'],
      ]);
      expect(body.totals).toEqual({ amount: 200000 });
      expect(body.total).toBe(3);
      for (const r of body.rows) {
        expect(r).toMatchObject({ rowKind: 'detail', bold: 0, indentLevel: 0 });
      }
    });

    it('timeBucket omitted defaults to day', async () => {
      const body = await byTime({ period: SEPTEMBER });
      expect(body.rows.map((r) => r.bucket)).toEqual(['08/09/2026', '09/09/2026', '10/09/2026']);
    });

    it('month, year 2026 → "09/2026" 200.000 and the AC-15 "10/2026" 240.000; bucket range clamped to the month', async () => {
      const body = await byTime({ period: YEAR, timeBucket: 'month' });
      expect(body.rows.map((r) => [r.bucket, r.amount, r.bucketFrom, r.bucketTo])).toEqual([
        ['09/2026', 200000, '2026-09-01', '2026-09-30'],
        ['10/2026', EXTRA_TOTAL, '2026-10-01', '2026-10-31'],
      ]);
      expect(body.total).toBe(2);
      expect(body.totals.amount).toBe(200000 + EXTRA_TOTAL);
    });

    it('month, 09/2026 only → one row "09/2026" 200.000', async () => {
      const body = await byTime({ period: SEPTEMBER, timeBucket: 'month' });
      expect(body.rows.map((r) => [r.bucket, r.amount])).toEqual([['09/2026', 200000]]);
    });

    it('week (Monday start): 08/09–10/09 all fall in the ISO week of Mon 07/09 → one row "Tuần 37/2026" 200.000', async () => {
      const body = await byTime({ period: SEPTEMBER, timeBucket: 'week' });
      expect(body.rows.map((r) => [r.bucket, r.amount, r.bucketFrom, r.bucketTo])).toEqual([
        ['Tuần 37/2026', 200000, '2026-09-07', '2026-09-13'],
      ]);
      expect(body.totals.amount).toBe(200000);
    });

    it('week over the year keeps the October lines in their own weeks; the bucket range is clamped to the period', async () => {
      const body = await byTime({ period: { from: '2026-09-01', to: '2026-10-05' }, timeBucket: 'week' });
      expect(body.rows[0]).toMatchObject({ bucket: 'Tuần 37/2026', amount: 200000 });
      // The last week is cut at the period's end, never past it.
      const last = body.rows[body.rows.length - 1];
      expect(last.bucketTo).toBe('2026-10-05');
      expect(body.totals.amount).toBe(200000 + sumOctober('2026-10-01', '2026-10-05'));
    });

    it('quarter / year', async () => {
      const q = await byTime({ period: YEAR, timeBucket: 'quarter' });
      expect(q.rows.map((r) => [r.bucket, r.amount])).toEqual([
        ['Q3/2026', 200000],
        ['Q4/2026', EXTRA_TOTAL],
      ]);
      const y = await byTime({ period: YEAR, timeBucket: 'year' });
      expect(y.rows.map((r) => [r.bucket, r.amount, r.bucketFrom, r.bucketTo])).toEqual([
        ['2026', 200000 + EXTRA_TOTAL, '2026-01-01', '2026-12-31'],
      ]);
    });

    it('timeBucket "fortnight" is refused (400)', async () => {
      await request(app.getHttpServer())
        .post('/reports/cash-fund/search')
        .set(headers())
        .send(
          searchBody(BY_TIME, BY_TIME_COLUMNS, {
            period: SEPTEMBER,
            branchId: fx.branchAId,
            timeBucket: 'fortnight',
          }),
        )
        .expect(400);
    });

    it('columns endpoint: bucket (link) and amount', async () => {
      const res = await request(app.getHttpServer())
        .get(`/reports/cash-fund/columns?reportType=${BY_TIME}`)
        .set(headers())
        .expect(200);
      const columns: any[] = res.body.columns;
      expect(columns.map((c) => [c.col, c.name, !!c.link])).toEqual([
        ['bucket', 'Ngày', true],
        ['amount', 'Số tiền chi', false],
      ]);
    });
  });

  describe('AC-17 — expenses-by-time filtered by mục chi', () => {
    it('day + categoryIds [Tiền điện] → 08/09 90.000; 09/09 60.000; totals 150.000', async () => {
      const body = await byTime({
        period: SEPTEMBER,
        timeBucket: 'day',
        categoryIds: [fx.categories.tienDien],
      });
      expect(body.rows.map((r) => [r.bucket, r.amount])).toEqual([
        ['08/09/2026', 90000],
        ['09/09/2026', 60000],
      ]);
      expect(body.totals).toEqual({ amount: 150000 });
      expect(body.total).toBe(2);
    });

    it('categoryIds ["uncategorized"] → only 10/09 40.000; [Tiền nước, "uncategorized"] → 08/09 10.000 + 10/09 40.000', async () => {
      const only = await byTime({ period: SEPTEMBER, categoryIds: ['uncategorized'] });
      expect(only.rows.map((r) => [r.bucket, r.amount])).toEqual([['10/09/2026', 40000]]);

      const both = await byTime({
        period: SEPTEMBER,
        categoryIds: [fx.categories.tienNuoc, 'uncategorized'],
      });
      expect(both.rows.map((r) => [r.bucket, r.amount])).toEqual([
        ['08/09/2026', 10000],
        ['10/09/2026', 40000],
      ]);
      expect(both.totals.amount).toBe(50000);
    });

    it('expenses-by-category honours the same categoryIds filter', async () => {
      const body = await byCategory({
        period: SEPTEMBER,
        categoryIds: [fx.categories.tienNuoc, 'uncategorized'],
      });
      expect(body.rows.map((r) => [r.categoryName, r.amount])).toEqual([
        ['Chi khác', 40000],
        ['Tiền nước', 10000],
      ]);
      expect(body.totals.amount).toBe(50000);
    });
  });

  describe('AC-18 — drill-down from a day bucket = #5 with period = that day', () => {
    it('08/09..08/09 → TỔNG CHI 100.000; Tiền điện → PC-02 90.000; Tiền nước → PC-02 10.000', async () => {
      const body = await list({ period: { from: '2026-09-08', to: '2026-09-08' } });
      expect(body.rows[0]).toMatchObject({ rowKind: 'grandTotal', reason: 'TỔNG CHI', amount: 100000 });
      expect(body.rows.map((r) => r.rowKind)).toEqual(['grandTotal', 'group', 'detail', 'group', 'detail']);
      expect(groups(body.rows).map((g) => [g.reason, g.amount])).toEqual([
        ['Tiền điện', 90000],
        ['Tiền nước', 10000],
      ]);
      const d = details(body.rows);
      expect(d.map((r) => [r.documentNumber, r.amount, r.docDate])).toEqual([
        [db.PC02.documentNumber, 90000, '2026-09-08'],
        [db.PC02.documentNumber, 10000, '2026-09-08'],
      ]);
      expect(d.every((r) => r.voucherId === fx.vouchers.PC02)).toBe(true);
      expect(body.total).toBe(4);
      expect(body.totals.amount).toBe(100000);
    });

    it('the bucket range carried on the day row is exactly what the dialog sends', async () => {
      const time = await byTime({ period: SEPTEMBER, timeBucket: 'day' });
      const day = time.rows.find((r) => r.bucket === '08/09/2026');
      const body = await list({
        period: { from: day.bucketFrom, to: day.bucketTo },
        categoryIds: [fx.categories.tienDien],
      });
      expect(body.rows[0]).toMatchObject({ rowKind: 'grandTotal', amount: 90000 });
      expect(details(body.rows)).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Shared filter options + export
  // ---------------------------------------------------------------------------
  describe('filter-options type=expenseCategory', () => {
    it('"Chi khác" first, then the active OUT categories in display order; IN categories absent', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/cash-fund/filter-options?type=expenseCategory')
        .set(headers())
        .expect(200);
      expect(res.body).toEqual([
        { value: 'uncategorized', label: 'Chi khác' },
        { value: fx.categories.tienDien, label: 'Tiền điện' },
        { value: fx.categories.tienNuoc, label: 'Tiền nước' },
        { value: fx.categories.tienThue, label: 'Tiền thuê' },
        { value: fx.categories.tienLuong, label: 'Tiền lương' },
      ]);
      expect(res.body.map((o: any) => o.value)).not.toContain(fx.categories.thuLai);
    });

    it('search narrows by name and keeps "Chi khác" only when it matches', async () => {
      const dien = await request(app.getHttpServer())
        .get('/reports/cash-fund/filter-options')
        .query({ type: 'expenseCategory', search: 'điện' })
        .set(headers())
        .expect(200);
      expect(dien.body).toEqual([{ value: fx.categories.tienDien, label: 'Tiền điện' }]);

      const khac = await request(app.getHttpServer())
        .get('/reports/cash-fund/filter-options')
        .query({ type: 'expenseCategory', search: 'khác' })
        .set(headers())
        .expect(200);
      expect(khac.body).toEqual([{ value: 'uncategorized', label: 'Chi khác' }]);
    });
  });

  describe('export', () => {
    it('expense-list-by-category, 09/2026, store A → .xlsx with the 4 detail lines (no group / TỔNG CHI rows) and a totals line', async () => {
      const exported = await request(app.getHttpServer())
        .post('/reports/cash-fund/export')
        .set(headers())
        .responseType('blob')
        .send(searchBody(LIST, LIST_COLUMNS, { period: SEPTEMBER, store: storeA }))
        .expect(200)
        .expect(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );

      const sheet = await readSheet(exported.body);
      const headerRow = findRow(sheet, (v) => v === 'Ngày chứng từ');
      expect([1, 2, 6, 14].map((c) => sheet.getRow(headerRow).getCell(c).value)).toEqual([
        'Ngày chứng từ',
        'Số chứng từ',
        'Số tiền chi',
        'Mục chi',
      ]);

      // 4 detail lines + the totals row; no "TỔNG CHI" and no group row in the file.
      expect(sheet.rowCount - headerRow).toBe(5);
      const lines = [1, 2, 3, 4].map((i) => sheet.getRow(headerRow + i));
      for (const row of lines) {
        expect(String(row.getCell(1).value)).toMatch(/^2026-09-\d{2}$/);
        expect(row.getCell(5).value).not.toBe('TỔNG CHI');
      }
      expect(lines.map((r) => r.getCell(2).value)).toEqual([
        db.PC04.documentNumber,
        db.PC03.documentNumber,
        db.PC02.documentNumber,
        db.PC02.documentNumber,
      ]);
      expect(lines.map((r) => Number(r.getCell(6).value)).sort((a, b) => a - b)).toEqual([
        10000, 40000, 60000, 90000,
      ]);
      expect(new Set(lines.map((r) => r.getCell(14).value))).toEqual(
        new Set(['Chi khác', 'Tiền điện', 'Tiền nước']),
      );

      const totalsRow = sheet.getRow(sheet.rowCount);
      expect(Number(totalsRow.getCell(6).value)).toBe(200000);
    });

    it('export of the 120-line October set streams every line (keyset) in one file', async () => {
      const exported = await request(app.getHttpServer())
        .post('/reports/cash-fund/export')
        .set(headers())
        .responseType('blob')
        .send(searchBody(LIST, LIST_COLUMNS, { period: OCTOBER, store: storeA }))
        .expect(200);
      const sheet = await readSheet(exported.body);
      const headerRow = findRow(sheet, (v) => v === 'Ngày chứng từ');
      expect(sheet.rowCount - headerRow).toBe(3 * EXTRA_PER_GROUP + 1);
      expect(Number(sheet.getRow(sheet.rowCount).getCell(6).value)).toBe(EXTRA_TOTAL);
    });
  });

  /** Σ of the AC-15 lines whose date lies in [from, to] (both `YYYY-MM-DD`, in 10/2026). */
  function sumOctober(from: string, to: string): number {
    let sum = 0;
    for (const unit of Object.values(EXTRA_UNIT)) {
      for (let i = 0; i < EXTRA_PER_GROUP; i++) {
        const day = `2026-10-${String(1 + (i % 31)).padStart(2, '0')}`;
        if (day >= from && day <= to) sum += unit;
      }
    }
    return sum;
  }
});
