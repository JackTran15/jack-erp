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
 * "Bảng kê thu chi" (cash-in-out-list) end to end on the fixture of
 * `02-requirements.md` (AC-08, AC-09, AC-10, AC-11).
 *
 * Running balance for branch A, 09/2026, in screen order (opening 1.500.000 =
 * 500.000 TM PT-01 + 1.000.000 TG opening balance):
 *   PT-02 +700.000 → 2.200.000 | PTG-01 +1.600.000 → 3.800.000 | PC-01 −200.000 → 3.600.000
 *   PT-03 +300.000 → 3.900.000 | PT-04 +50.000 → 3.950.000    | PT-05 +20.000 → 3.970.000
 *   PC-02 −100.000 → 3.870.000 | PC-03 −60.000 → 3.810.000    | PC-04 −40.000 → 3.770.000
 */
describe('Cash-fund report "Bảng kê thu chi" (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let fx: CashFundFixture;

  const LIST = 'cash-in-out-list';
  const COLUMNS = [
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
  ];
  const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' };
  const YEAR = { from: '2026-01-01', to: '2026-12-31' };

  /** The 9 POSTED vouchers of branch A in 09/2026, in screen order (date, then number). */
  const SEPTEMBER_ORDER = ['PT02', 'PTG01', 'PC01', 'PT03', 'PT04', 'PT05', 'PC02', 'PC03', 'PC04'] as const;
  const RUNNING = [2200000, 3800000, 3600000, 3900000, 3950000, 3970000, 3870000, 3810000, 3770000];

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

  const searchBody = (filters: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    reportType: LIST,
    columns: COLUMNS,
    filters,
    ...extra,
  });

  const search = async (
    filters: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ): Promise<{ rows: any[]; totals: any; total: number }> => {
    const res = await request(app.getHttpServer())
      .post('/reports/cash-fund/search')
      .set(headers())
      .send(searchBody(filters, extra))
      .expect(201);
    return res.body;
  };

  const storeA = { scope: 'group', storeIds: [] as string[] };
  const storeAB = { scope: 'group', storeIds: [] as string[] };

  const details = (rows: any[]) => rows.filter((r) => r.rowKind === 'detail');
  const voucherIds = (rows: any[]) => details(rows).map((r) => r.voucherId);

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
    const read = async (table: string, dateColumn: string, keys: string[]) => {
      for (const key of keys) {
        const id = (fx.vouchers as Record<string, string>)[key];
        const [row] = await ds.query(
          `SELECT document_number, ${dateColumn}::text AS d FROM ${table} WHERE id = $1`,
          [id],
        );
        out[key] = { documentNumber: row.document_number, date: row.d };
      }
    };
    await read('cash_receipts', 'voucher_date', ['PT01', 'PT02', 'PT03', 'PT04', 'PT05']);
    await read('bank_receipts', 'doc_date', ['PTG01']);
    await read('cash_payments', 'voucher_date', ['PC01', 'PC02', 'PC03', 'PC04', 'PC06']);
    return out;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    fx = await seedCashFundFixture(app, seed);
    storeA.storeIds = [fx.branchAId];
    storeAB.storeIds = [fx.branchAId, fx.branchBId];
    db = await loadDbVouchers();
  }, 180000);

  afterAll(async () => {
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  describe('AC-08 — branch A, 09/2026: opening row, 9 vouchers in order, running balance', () => {
    let body: { rows: any[]; totals: any; total: number };

    beforeAll(async () => {
      body = await search({ period: SEPTEMBER, store: storeA }, { page: 1, limit: 50 });
    });

    it('row 0 is "Số dư đầu kỳ" = 1.500.000 (500.000 TM + 1.000.000 TG)', () => {
      expect(body.rows[0]).toMatchObject({
        rowKind: 'opening',
        reason: 'Số dư đầu kỳ',
        runningBalance: 1500000,
        bold: 1,
      });
      expect(body.rows[0].docDate).toBeNull();
      expect(body.rows[0].documentNumber).toBeNull();
    });

    it('then the 9 POSTED vouchers of the period in date order; PC-05, PC-05R and PC-07 absent', () => {
      expect(body.rows).toHaveLength(10);
      expect(voucherIds(body.rows)).toEqual(SEPTEMBER_ORDER.map((k) => fx.vouchers[k]));
      expect(body.total).toBe(9);
      const ids = voucherIds(body.rows);
      expect(ids).not.toContain(fx.vouchers.PC05);
      expect(ids).not.toContain(fx.vouchers.PC05R);
      expect(ids).not.toContain(fx.vouchers.PC07);
      expect(ids).not.toContain(fx.vouchers.PT01);
      expect(ids).not.toContain(fx.vouchers.PC06);
    });

    it('running balance accumulates row by row and ends at 3.770.000', () => {
      expect(details(body.rows).map((r) => r.runningBalance)).toEqual(RUNNING);
    });

    it('totals = Σ thu 2.670.000 / Σ chi 400.000', () => {
      expect(body.totals.amountIn).toBe(2670000);
      expect(body.totals.amountOut).toBe(400000);
      expect(body.totals.runningBalance).toBeNull();
    });

    it('docDate and documentNumber of every row equal the DB voucher (no one-day shift, T-02-07)', () => {
      const rows = details(body.rows);
      SEPTEMBER_ORDER.forEach((key, i) => {
        expect([rows[i].docDate, rows[i].documentNumber]).toEqual([
          db[key].date,
          db[key].documentNumber,
        ]);
      });
      // Spot checks on the fixture dates themselves, so a fixture written on
      // the wrong day cannot hide a shift.
      expect(rows[1].docDate).toBe('2026-09-03'); // PTG-01
      expect(rows[8].docDate).toBe('2026-09-10'); // PC-04
      expect(rows[0].documentNumber).toMatch(/^PT\d+$/); // PT-02
    });

    it('documentKind / paymentMethod carry the Vietnamese labels; amounts sit on one side', () => {
      const rows = details(body.rows);
      const kinds = rows.map((r) => r.documentKind);
      expect(new Set(kinds)).toEqual(new Set(['Phiếu thu', 'Phiếu chi', 'Thu tiền gửi']));
      expect(rows[1].documentKind).toBe('Thu tiền gửi');
      expect(rows[1].paymentMethod).toBe('Chuyển khoản');
      expect(rows[1].depositAccount).toBe('Tiền gửi A · ACC-DEP-A');
      for (const r of rows) {
        expect(['Tiền mặt', 'Chuyển khoản']).toContain(r.paymentMethod);
        expect(r.amountIn === 0 || r.amountOut === 0).toBe(true);
        expect(r.staffName).toBe(fx.staff.admin.name);
        expect(r.branchName).toBe('Main Branch');
        expect(r.voucherKind).toMatch(/^(CASH_RECEIPT|CASH_PAYMENT|BANK_RECEIPT)$/);
        expect(r.bold).toBe(0);
      }
      expect(rows.filter((r) => r.paymentMethod === 'Tiền mặt')).toHaveLength(8);
    });

    it('reason comes from the voucher header', () => {
      const rows = details(body.rows);
      expect(rows[6].reason).toBe('Tiền điện nước tháng 9'); // PC-02
      expect(rows[7].reason).toBe('Tiền điện kho'); // PC-03
    });
  });

  describe('paging — running balance continues across pages', () => {
    it('page 2 of limit 3 has no opening row and starts at PT-03 = 3.900.000', async () => {
      const body = await search({ period: SEPTEMBER, store: storeA }, { page: 2, limit: 3 });
      expect(body.rows).toHaveLength(3);
      expect(body.rows.every((r) => r.rowKind === 'detail')).toBe(true);
      expect(voucherIds(body.rows)).toEqual([fx.vouchers.PT03, fx.vouchers.PT04, fx.vouchers.PT05]);
      expect(body.rows.map((r) => r.runningBalance)).toEqual([3900000, 3950000, 3970000]);
      expect(body.total).toBe(9);
      // The footer is over the whole set, not the page.
      expect(body.totals.amountIn).toBe(2670000);
      expect(body.totals.amountOut).toBe(400000);
    });

    it('page 3 of limit 3 ends at PC-04 = 3.770.000', async () => {
      const body = await search({ period: SEPTEMBER, store: storeA }, { page: 3, limit: 3 });
      expect(voucherIds(body.rows)).toEqual([fx.vouchers.PC02, fx.vouchers.PC03, fx.vouchers.PC04]);
      expect(body.rows.map((r) => r.runningBalance)).toEqual([3870000, 3810000, 3770000]);
    });
  });

  describe('AC-09 — store group, employee, payment method', () => {
    it('stores [A, B] + employee = branch-B user + Tiền mặt → only PC-06 (30.000)', async () => {
      const body = await search({
        period: SEPTEMBER,
        store: storeAB,
        employeeIds: [fx.staff.branchB.userId],
        paymentMethod: 'cash',
      });
      expect(body.rows[0].rowKind).toBe('opening');
      expect(voucherIds(body.rows)).toEqual([fx.vouchers.PC06]);
      const pc06 = body.rows[1];
      expect(pc06).toMatchObject({
        amountIn: 0,
        amountOut: 30000,
        documentKind: 'Phiếu chi',
        paymentMethod: 'Tiền mặt',
        staffName: fx.staff.branchB.name,
        branchName: 'Branch B',
        docDate: db.PC06.date,
        documentNumber: db.PC06.documentNumber,
      });
      // Staff filter narrows the set → opening is Σ of that staff's vouchers before 09/2026 = 0.
      expect(body.rows[0].runningBalance).toBe(0);
      expect(pc06.runningBalance).toBe(-30000);
      expect(body.total).toBe(1);
      expect(body.totals.amountOut).toBe(30000);
      expect(body.totals.amountIn).toBe(0);
    });

    it('stores [A, B] + Chuyển khoản, every employee → only PTG-01 on the deposit opening balance', async () => {
      const body = await search({ period: SEPTEMBER, store: storeAB, paymentMethod: 'deposit' });
      expect(voucherIds(body.rows)).toEqual([fx.vouchers.PTG01]);
      expect(body.rows[0].runningBalance).toBe(1000000);
      expect(body.rows[1].runningBalance).toBe(2600000);
      expect(body.totals.amountIn).toBe(1600000);
      expect(body.total).toBe(1);
    });

    it('stores [A, B], no other filter → 10 vouchers with PC-06 on its date', async () => {
      const body = await search({ period: SEPTEMBER, store: storeAB });
      expect(body.total).toBe(10);
      expect(voucherIds(body.rows)).toContain(fx.vouchers.PC06);
      expect(body.totals.amountOut).toBe(430000);
    });

    it('filter-options employee lists exactly the two staff that sign vouchers, "CODE - Name"', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/cash-fund/filter-options?type=employee')
        .set(headers())
        .expect(200);
      expect(res.body).toEqual([
        {
          value: fx.staff.admin.userId,
          label: `${fx.staff.admin.code} - ${fx.staff.admin.name}`,
          metadata: { name: fx.staff.admin.name },
        },
        {
          value: fx.staff.branchB.userId,
          label: `${fx.staff.branchB.code} - ${fx.staff.branchB.name}`,
          metadata: { name: fx.staff.branchB.name },
        },
      ]);
    });
  });

  describe('AC-10 — column filters narrow rows, opening and totals alike', () => {
    it('reason contains "Tiền điện" → PC-02 and PC-03 only', async () => {
      const body = await search(
        { period: SEPTEMBER, store: storeA },
        { columnFilters: [{ col: 'reason', contains: 'Tiền điện' }] },
      );
      expect(voucherIds(body.rows)).toEqual([fx.vouchers.PC02, fx.vouchers.PC03]);
      expect(body.total).toBe(2);
      // Opening of the filtered set: no matching voucher before 01/09 → 0.
      expect(body.rows[0]).toMatchObject({ rowKind: 'opening', runningBalance: 0 });
      expect(body.rows.slice(1).map((r) => r.runningBalance)).toEqual([-100000, -160000]);
      expect(body.totals.amountIn).toBe(0);
      expect(body.totals.amountOut).toBe(160000);
    });

    it('amountOut ≤ 100.000 → PC-01 (200.000) gone, receipts kept', async () => {
      const body = await search(
        { period: SEPTEMBER, store: storeA },
        { columnFilters: [{ col: 'amountOut', lte: 100000 }] },
      );
      const ids = voucherIds(body.rows);
      expect(ids).not.toContain(fx.vouchers.PC01);
      expect(ids).toEqual(
        SEPTEMBER_ORDER.filter((k) => k !== 'PC01').map((k) => fx.vouchers[k]),
      );
      expect(body.total).toBe(8);
      // Opening of the filtered set = PT-01 (500.000, amountOut 0 ≤ 100.000);
      // the deposit opening balance is not a voucher and drops out.
      expect(body.rows[0].runningBalance).toBe(500000);
      expect(body.rows[body.rows.length - 1].runningBalance).toBe(500000 + 2670000 - 200000);
      expect(body.totals.amountIn).toBe(2670000);
      expect(body.totals.amountOut).toBe(200000);
    });

    it('text filter is case-insensitive and combines with the store scope', async () => {
      const body = await search(
        { period: SEPTEMBER, store: storeAB },
        { columnFilters: [{ col: 'branchName', contains: 'branch b' }] },
      );
      expect(voucherIds(body.rows)).toEqual([fx.vouchers.PC06]);
    });
  });

  describe('AC-11 — column catalog', () => {
    it('returns the 16 columns in order, the first four pinned, Số chứng từ as a link', async () => {
      const res = await request(app.getHttpServer())
        .get(`/reports/cash-fund/columns?reportType=${LIST}`)
        .set(headers())
        .expect(200);
      const columns: any[] = res.body.columns;
      expect(columns.map((c) => c.col)).toEqual(COLUMNS);
      expect(columns.map((c) => c.name)).toEqual([
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
      expect(columns.filter((c) => c.pinned === 'left').map((c) => c.col)).toEqual([
        'docDate',
        'documentNumber',
        'documentKind',
        'reference',
      ]);
      expect(columns.filter((c) => c.link).map((c) => c.col)).toEqual(['documentNumber']);
      expect(columns.find((c) => c.col === 'runningBalance').filterKind).toBe('none');
      expect(columns.find((c) => c.col === 'paymentMethod').filterOptions).toEqual([
        { value: 'cash', label: 'Tiền mặt' },
        { value: 'deposit', label: 'Chuyển khoản' },
      ]);
    });
  });

  describe('export', () => {
    it('year 2026, branch A → .xlsx with the 10 vouchers (no opening row) and a totals line', async () => {
      const exported = await request(app.getHttpServer())
        .post('/reports/cash-fund/export')
        .set(headers())
        .responseType('blob')
        .send(searchBody({ period: YEAR, store: storeA }))
        .expect(200)
        .expect(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );

      const sheet = await readSheet(exported.body);
      const headerRow = findRow(sheet, (v) => v === 'Ngày chứng từ');
      expect([1, 2, 3, 4].map((c) => sheet.getRow(headerRow).getCell(c).value)).toEqual([
        'Ngày chứng từ',
        'Số chứng từ',
        'Loại chứng từ',
        'Tham chiếu',
      ]);

      // PT-01 (30/08) + the 9 of September, then the bold totals row.
      const dataRows = sheet.rowCount - headerRow;
      expect(dataRows).toBe(11);
      const firstData = sheet.getRow(headerRow + 1);
      expect(firstData.getCell(1).value).toBe(db.PT01.date);
      expect(firstData.getCell(2).value).toBe(db.PT01.documentNumber);
      expect(sheet.getRow(headerRow + 1).getCell(13).value).not.toBe('Số dư đầu kỳ');
      for (let i = 0; i < 10; i++) {
        expect(String(sheet.getRow(headerRow + 1 + i).getCell(1).value)).toMatch(/^2026-\d{2}-\d{2}$/);
      }
      const lastVoucher = sheet.getRow(headerRow + 10);
      expect(lastVoucher.getCell(2).value).toBe(db.PC04.documentNumber);
      expect(Number(lastVoucher.getCell(7).value)).toBe(3770000);

      const totalsRow = sheet.getRow(sheet.rowCount);
      expect(Number(totalsRow.getCell(5).value)).toBe(3170000);
      expect(Number(totalsRow.getCell(6).value)).toBe(400000);
    });
  });

  // Last in the file on purpose: it re-points PT-02 / PC-04 at an invoice, and
  // every case above reads the fixture as seeded. `afterAll` puts them back.
  describe('AC-08 (UOW-02) — rows tied to an invoice carry invoiceNumber and _invoiceId', () => {
    const INVOICE_CODE = 'HD-A1';
    let invoiceId: string;
    let original: { PT02: any; PC04: any };
    let body: { rows: any[]; totals: any; total: number };

    beforeAll(async () => {
      // The shared fixture has no invoice: a minimal one on branch A, then PT-02
      // becomes its POS receipt (INVOICE) and PC-04 its refund (REFUND).
      const [row] = await ds.query(
        `INSERT INTO invoices
           (id, organization_id, branch_id, code, status, type, subtotal, discount_amount,
            points_redeemed, points_discount_amount, deposit_amount, amount_due, total_paid,
            is_draft, session_id, staff_id, customer_id, issued_at, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, 'paid', 'SALE', 700000, 0,
            0, 0, 0, 700000, 700000,
            false, '00000000-0000-4000-8000-000000000001', $4::uuid, NULL, '2026-09-02T03:00:00Z',
            $4::uuid, NOW(), NOW())
         RETURNING id`,
        [seed.organizationId, fx.branchAId, INVOICE_CODE, seed.userId],
      );
      invoiceId = row.id;

      const [pt02] = await ds.query(
        `SELECT reference_type, reference_id FROM cash_receipts WHERE id = $1`,
        [fx.vouchers.PT02],
      );
      const [pc04] = await ds.query(
        `SELECT reference_type, reference_id FROM cash_payments WHERE id = $1`,
        [fx.vouchers.PC04],
      );
      original = { PT02: pt02, PC04: pc04 };

      await ds.query(
        `UPDATE cash_receipts SET reference_type = 'INVOICE', reference_id = $2 WHERE id = $1`,
        [fx.vouchers.PT02, invoiceId],
      );
      await ds.query(
        `UPDATE cash_payments SET reference_type = 'REFUND', reference_id = $2 WHERE id = $1`,
        [fx.vouchers.PC04, invoiceId],
      );

      body = await search({ period: SEPTEMBER, store: storeA }, { page: 1, limit: 50 });
    });

    afterAll(async () => {
      await ds.query(
        `UPDATE cash_receipts SET reference_type = $2, reference_id = $3 WHERE id = $1`,
        [fx.vouchers.PT02, original.PT02.reference_type, original.PT02.reference_id],
      );
      await ds.query(
        `UPDATE cash_payments SET reference_type = $2, reference_id = $3 WHERE id = $1`,
        [fx.vouchers.PC04, original.PC04.reference_type, original.PC04.reference_id],
      );
    });

    const rowOf = (key: 'PT02' | 'PC04') =>
      details(body.rows).find((r) => r.voucherId === fx.vouchers[key]);

    it('PT-02 (INVOICE) → invoiceNumber, _invoiceId and reference "INVOICE <mã>"', () => {
      expect(rowOf('PT02')).toMatchObject({
        invoiceNumber: INVOICE_CODE,
        _invoiceId: invoiceId,
        reference: `INVOICE ${INVOICE_CODE}`,
      });
    });

    it('PC-04 (REFUND) → invoiceNumber, _invoiceId and reference "REFUND <mã>"', () => {
      expect(rowOf('PC04')).toMatchObject({
        invoiceNumber: INVOICE_CODE,
        _invoiceId: invoiceId,
        reference: `REFUND ${INVOICE_CODE}`,
      });
    });

    it('every other detail row has _invoiceId = null and no invoiceNumber', () => {
      const others = details(body.rows).filter(
        (r) => r.voucherId !== fx.vouchers.PT02 && r.voucherId !== fx.vouchers.PC04,
      );
      expect(others).toHaveLength(7);
      for (const r of others) {
        expect(r._invoiceId).toBeNull();
        expect(r.invoiceNumber).toBeNull();
      }
    });

    it('rows, running balance and footer are unchanged: 9 vouchers, Σ thu 2.670.000 / Σ chi 400.000', () => {
      expect(voucherIds(body.rows)).toEqual(SEPTEMBER_ORDER.map((k) => fx.vouchers[k]));
      expect(details(body.rows).map((r) => r.runningBalance)).toEqual(RUNNING);
      expect(body.total).toBe(9);
      expect(body.totals.amountIn).toBe(2670000);
      expect(body.totals.amountOut).toBe(400000);
    });

    it('/columns does not expose _invoiceId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/reports/cash-fund/columns?reportType=${LIST}`)
        .set(headers())
        .expect(200);
      const cols: string[] = res.body.columns.map((c: any) => c.col);
      expect(cols).toEqual(COLUMNS);
      expect(cols).not.toContain('_invoiceId');
    });

    it('column filter "Số hóa đơn" contains the code → PT-02 and PC-04 (A-04: REFUND now matches)', async () => {
      const filtered = await search(
        { period: SEPTEMBER, store: storeA },
        { columnFilters: [{ col: 'invoiceNumber', contains: INVOICE_CODE }] },
      );
      expect(voucherIds(filtered.rows)).toEqual([fx.vouchers.PT02, fx.vouchers.PC04]);
    });
  });
});
