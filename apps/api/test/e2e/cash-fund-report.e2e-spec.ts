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
import {
  CashFundFixture,
  createLoggedInUser,
  createRole,
  seedCashFundFixture,
} from './setup/cash-fund-fixture';

/**
 * Domain `cash` end to end: permissions, "Tình hình thu chi" on the fixture of
 * `02-requirements.md`, filter options, export, print payload and templates
 * (AC-02, AC-03, AC-04, AC-06, AC-07, AC-19, AC-20, AC-21).
 *
 * Expected figures for branch A, 09/2026 (all POSTED, reversal and draft excluded):
 *   I   = 500.000 (TM: PT-01)          / 1.000.000 (TG: opening balance)
 *   II  = 1.070.000                    / 1.600.000 (PTG-01)
 *   III = 400.000 (PC-01..04)          / 0
 *   IV  = 1.170.000                    / 2.600.000
 */
describe('Cash-fund reports (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let fx: CashFundFixture;

  const SITUATION = 'cash-in-out-situation';
  const COLUMNS = ['lineLabel', 'cash', 'deposit', 'total'];
  const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' };

  const headers = (token = seed.accessToken, branchId = seed.branchId) => ({
    Authorization: authHeader(token),
    'X-Branch-Id': branchId,
  });

  const searchBody = (filters: Record<string, unknown>) => ({
    reportType: SITUATION,
    columns: COLUMNS,
    filters,
  });

  const search = async (
    filters: Record<string, unknown>,
    token = seed.accessToken,
  ): Promise<any[]> => {
    const res = await request(app.getHttpServer())
      .post('/reports/cash-fund/search')
      .set(headers(token))
      .send(searchBody(filters))
      .expect(201);
    return res.body.rows;
  };

  const rowByKey = (rows: any[], lineKey: string) => {
    const row = rows.find((r) => r.lineKey === lineKey);
    if (!row) throw new Error(`no row with lineKey ${lineKey}`);
    return row;
  };
  const amounts = (row: any) => [Number(row.cash), Number(row.deposit), Number(row.total)];

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

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    fx = await seedCashFundFixture(app, seed);
  }, 180000);

  afterAll(async () => {
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  describe('AC-02 — no cash permission', () => {
    let token: string;

    beforeAll(async () => {
      const roleId = await createRole(ds, seed.organizationId, 'no-cash', ['customer.read']);
      token = (
        await createLoggedInUser(app, seed, {
          email: 'no-cash@test.com',
          roleId,
          branchIds: [fx.branchAId],
        })
      ).accessToken;
    });

    it('POST search → 403', async () => {
      await request(app.getHttpServer())
        .post('/reports/cash-fund/search')
        .set(headers(token))
        .send(searchBody({ period: SEPTEMBER, branchId: fx.branchAId }))
        .expect(403);
    });

    it('GET columns → 403', async () => {
      await request(app.getHttpServer())
        .get(`/reports/cash-fund/columns?reportType=${SITUATION}`)
        .set(headers(token))
        .expect(403);
    });
  });

  describe('AC-03 / AC-04 / AC-05 — Tình hình thu chi, branch A, 09/2026', () => {
    let rows: any[];
    let elapsedMs: number;

    beforeAll(async () => {
      const started = Date.now();
      rows = await search({ period: SEPTEMBER, branchId: fx.branchAId });
      elapsedMs = Date.now() - started;
    });

    it('responds under 2 s on the fixture (NFR, measured)', () => {
      // eslint-disable-next-line no-console
      console.log(`[cash-fund-report] search cash-in-out-situation 09/2026: ${elapsedMs} ms`);
      expect(elapsedMs).toBeLessThan(2000);
    });

    it('columns are Khoản mục / Tiền mặt / Tiền gửi / Tổng cộng', async () => {
      const res = await request(app.getHttpServer())
        .get(`/reports/cash-fund/columns?reportType=${SITUATION}`)
        .set(headers())
        .expect(200);
      expect(res.body.columns.map((c: any) => [c.col, c.name])).toEqual([
        ['lineLabel', 'Khoản mục'],
        ['cash', 'Tiền mặt'],
        ['deposit', 'Tiền gửi'],
        ['total', 'Tổng cộng'],
      ]);
    });

    it('renders the I / II / III / IV skeleton with the category lines that moved money, in order', () => {
      expect(rows.map((r) => r.lineKey)).toEqual([
        'opening',
        'inTotal',
        'inSales',
        `inCategory:${fx.categories.thuLai}`,
        'inUncategorized',
        'outTotal',
        'outPurchase',
        `outCategory:${fx.categories.tienDien}`,
        `outCategory:${fx.categories.tienNuoc}`,
        'outUncategorized',
        'closing',
      ]);
      expect(rows.map((r) => r.lineLabel)).toEqual([
        'I. Tiền đầu kỳ',
        'II. Tiền thu trong kỳ',
        'Thu từ bán hàng',
        'Thu lãi',
        'Thu khác',
        'III. Tiền chi trong kỳ',
        'Chi mua hàng hóa',
        'Tiền điện',
        'Tiền nước',
        'Chi khác',
        'IV. Tiền cuối kỳ (IV = I + II - III)',
      ]);
      // No line for a category without vouchers (Tiền thuê) or whose only
      // voucher was reversed (Tiền lương); the DRAFT PC-07 adds nothing.
      expect(rows.some((r) => r.lineKey === `outCategory:${fx.categories.tienLuong}`)).toBe(false);
      expect(rows.some((r) => r.lineKey === `outCategory:${fx.categories.tienThue}`)).toBe(false);
      // The I / II / III / IV lines are bold, the detail lines are not.
      expect(rows.filter((r) => r.bold === 1).map((r) => r.lineKey)).toEqual([
        'opening',
        'inTotal',
        'outTotal',
        'closing',
      ]);
    });

    it('sums each bucket from the fixture vouchers (AC-03)', () => {
      expect(amounts(rowByKey(rows, 'inSales'))).toEqual([1000000, 1600000, 2600000]);
      expect(amounts(rowByKey(rows, `inCategory:${fx.categories.thuLai}`))).toEqual([50000, 0, 50000]);
      expect(amounts(rowByKey(rows, 'inUncategorized'))).toEqual([20000, 0, 20000]);
      expect(amounts(rowByKey(rows, 'inTotal'))).toEqual([1070000, 1600000, 2670000]);
      expect(amounts(rowByKey(rows, 'outPurchase'))).toEqual([200000, 0, 200000]);
      expect(amounts(rowByKey(rows, `outCategory:${fx.categories.tienDien}`))).toEqual([150000, 0, 150000]);
      expect(amounts(rowByKey(rows, `outCategory:${fx.categories.tienNuoc}`))).toEqual([10000, 0, 10000]);
      expect(amounts(rowByKey(rows, 'outUncategorized'))).toEqual([40000, 0, 40000]);
      expect(amounts(rowByKey(rows, 'outTotal'))).toEqual([400000, 0, 400000]);
      for (const r of rows) {
        expect(Number(r.total)).toBe(Number(r.cash) + Number(r.deposit));
      }
    });

    it('opening = vouchers before the period + deposit opening balance; IV = I + II − III (AC-04)', () => {
      expect(amounts(rowByKey(rows, 'opening'))).toEqual([500000, 1000000, 1500000]);
      expect(amounts(rowByKey(rows, 'closing'))).toEqual([1170000, 2600000, 3770000]);
    });

    it("October's I equals September's IV (AC-04)", async () => {
      const october = await search({
        period: { from: '2026-10-01', to: '2026-10-31' },
        branchId: fx.branchAId,
      });
      expect(amounts(rowByKey(october, 'opening'))).toEqual(amounts(rowByKey(rows, 'closing')));
    });
  });

  describe('AC-06 — empty period keeps the skeleton', () => {
    it('2025: exactly the 8 fixed lines, no movement', async () => {
      const rows = await search({
        period: { from: '2025-01-01', to: '2025-12-31' },
        branchId: fx.branchAId,
      });
      expect(rows.map((r) => r.lineKey)).toEqual([
        'opening',
        'inTotal',
        'inSales',
        'inUncategorized',
        'outTotal',
        'outPurchase',
        'outUncategorized',
        'closing',
      ]);
      for (const r of rows) expect(Number(r.cash)).toBe(0);
      for (const key of ['inTotal', 'inSales', 'inUncategorized', 'outTotal', 'outPurchase', 'outUncategorized']) {
        expect(amounts(rowByKey(rows, key))).toEqual([0, 0, 0]);
      }
      // A-03 (resolved): `deposit_accounts.opening_balance` is added regardless of
      // `opening_date`, as Sổ tiền gửi does — so I and IV on the deposit side carry
      // the 1.000.000 opening balance even for a period before that date.
      expect(amounts(rowByKey(rows, 'opening'))).toEqual([0, 1000000, 1000000]);
      expect(amounts(rowByKey(rows, 'closing'))).toEqual([0, 1000000, 1000000]);
    });
  });

  describe('AC-07 — branch scope', () => {
    const tienDien = (rows: any[]) =>
      Number(rows.find((r) => r.lineKey === `outCategory:${fx.categories.tienDien}`)?.cash ?? 0);

    let branchAReaderToken: string;
    let chainReaderToken: string;

    beforeAll(async () => {
      const readerRoleId = await createRole(ds, seed.organizationId, 'cash-branch-reader', [
        'reporting.cash.read',
        'reporting.cash.cash-in-out-situation.read',
      ]);
      branchAReaderToken = (
        await createLoggedInUser(app, seed, {
          email: 'branch-a-reader@test.com',
          roleId: readerRoleId,
          branchIds: [fx.branchAId],
        })
      ).accessToken;
      // Consolidated reader with no branch assignment: the only actor for whom
      // the header-branch fallback (`filters.branchId ?? actor.branchId`) is
      // empty, i.e. the only way the report drops the branch predicate.
      chainReaderToken = (
        await createLoggedInUser(app, seed, {
          email: 'chain-reader@test.com',
          roleId: fx.adminRoleId,
          branchIds: [],
        })
      ).accessToken;
    });

    it('admin (consolidated) asking for B sees only B: Tiền điện = 30.000', async () => {
      const rows = await search({ period: SEPTEMBER, branchId: fx.branchBId });
      expect(tienDien(rows)).toBe(30000);
      expect(amounts(rowByKey(rows, 'opening'))).toEqual([0, 0, 0]);
      expect(amounts(rowByKey(rows, 'outTotal'))).toEqual([30000, 0, 30000]);
    });

    it('branch-A reader without the consolidated key sees A only: Tiền điện = 150.000', async () => {
      const rows = await search({ period: SEPTEMBER }, branchAReaderToken);
      expect(tienDien(rows)).toBe(150000);
    });

    it('branch-A reader asking for B → 403', async () => {
      await request(app.getHttpServer())
        .post('/reports/cash-fund/search')
        .set(headers(branchAReaderToken))
        .send(searchBody({ period: SEPTEMBER, branchId: fx.branchBId }))
        .expect(403);
    });

    it('consolidated reader in chain mode sums every branch: Tiền điện = 180.000', async () => {
      const rows = await search({ period: SEPTEMBER }, chainReaderToken);
      expect(tienDien(rows)).toBe(180000);
      expect(amounts(rowByKey(rows, 'outTotal'))).toEqual([430000, 0, 430000]);
    });

    it('filter-options store: assigned branches only, every branch when consolidated', async () => {
      const asReader = await request(app.getHttpServer())
        .get('/reports/cash-fund/filter-options?type=store')
        .set(headers(branchAReaderToken))
        .expect(200);
      expect(asReader.body.map((o: any) => o.value)).toEqual([fx.branchAId]);

      const asAdmin = await request(app.getHttpServer())
        .get('/reports/cash-fund/filter-options?type=store')
        .set(headers())
        .expect(200);
      expect(asAdmin.body.map((o: any) => o.value).sort()).toEqual(
        [fx.branchAId, fx.branchBId].sort(),
      );
    });
  });

  describe('filter-options paymentMethod', () => {
    it('returns exactly Tiền mặt / Chuyển khoản', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/cash-fund/filter-options?type=paymentMethod')
        .set(headers())
        .expect(200);
      expect(res.body).toEqual([
        { value: 'cash', label: 'Tiền mặt' },
        { value: 'deposit', label: 'Chuyển khoản' },
      ]);
    });
  });

  describe('AC-19 — export', () => {
    it('returns an .xlsx whose header is the selected labels and whose last line is IV', async () => {
      const exported = await request(app.getHttpServer())
        .post('/reports/cash-fund/export')
        .set(headers())
        .responseType('blob')
        .send({
          ...searchBody({ period: SEPTEMBER, branchId: fx.branchAId }),
          columnLabels: { total: 'Cộng' },
        })
        .expect(200)
        .expect(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );

      const sheet = await readSheet(exported.body);
      const headerRow = findRow(sheet, (v) => v === 'Khoản mục');
      expect([1, 2, 3, 4].map((c) => sheet.getRow(headerRow).getCell(c).value)).toEqual([
        'Khoản mục',
        'Tiền mặt',
        'Tiền gửi',
        'Cộng',
      ]);
      expect(sheet.getRow(headerRow).getCell(5).value).toBeFalsy();

      // Every line, unpaged: 11 data rows for 09/2026, the last one being IV.
      const ivRow = findRow(sheet, (v) => v.startsWith('IV.'));
      expect(ivRow - headerRow).toBe(11);
      expect(sheet.rowCount).toBe(ivRow);
      expect([2, 3, 4].map((c) => Number(sheet.getRow(ivRow).getCell(c).value))).toEqual([
        1170000,
        2600000,
        3770000,
      ]);
    });

    it('rejects page/limit on the export body (whole set only)', async () => {
      await request(app.getHttpServer())
        .post('/reports/cash-fund/export')
        .set(headers())
        .send({ ...searchBody({ period: SEPTEMBER, branchId: fx.branchAId }), page: 1 })
        .expect(400);
    });
  });

  describe('AC-20 — print payload', () => {
    it('returns ReportDocumentPayload with every line', async () => {
      const res = await request(app.getHttpServer())
        .post('/reports/cash-fund/print-payload')
        .set(headers())
        .send(searchBody({ period: SEPTEMBER, branchId: fx.branchAId }))
        .expect(200);
      expect(res.body.title).toBe('TÌNH HÌNH THU CHI');
      expect(Array.isArray(res.body.subtitleLines)).toBe(true);
      expect(res.body.subtitleLines.some((l: string) => l.includes('01/09/2026'))).toBe(true);
      expect(res.body.columns.map((c: any) => c.col)).toEqual(COLUMNS);
      expect(res.body.rows).toHaveLength(11);
      expect(res.body.rows[0].lineLabel).toBe('I. Tiền đầu kỳ');
      expect(res.body.rows[10]).toMatchObject({
        lineLabel: 'IV. Tiền cuối kỳ (IV = I + II - III)',
        bold: 1,
        total: 3770000,
      });
      expect(res.body.totals).toBeNull();
    });
  });

  describe('AC-21 — templates (scope chain)', () => {
    let templateId: string;

    it('creates a chain template', async () => {
      const res = await request(app.getHttpServer())
        .post('/reports/cash-fund/templates')
        .set(headers())
        .send({
          reportType: SITUATION,
          name: 'Không cột tiền gửi',
          scope: 'chain',
          columns: [
            { col: 'lineLabel', visible: true, frozen: true },
            { col: 'cash', visible: true },
            { col: 'deposit', visible: false },
            { col: 'total', visible: true },
          ],
        })
        .expect(201);
      templateId = res.body.id;
      expect(res.body.reportType).toBe(SITUATION);
      expect(res.body.columns.map((c: any) => [c.col, c.visible, c.order])).toEqual([
        ['lineLabel', true, 0],
        ['cash', true, 1],
        ['deposit', false, 2],
        ['total', true, 3],
      ]);
    });

    it('lists it for the report type in chain scope', async () => {
      const res = await request(app.getHttpServer())
        .get(`/reports/cash-fund/templates?reportType=${SITUATION}&scope=chain`)
        .set(headers())
        .expect(200);
      expect(res.body.map((t: any) => t.id)).toContain(templateId);
    });

    it('reads it by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/reports/cash-fund/templates/${templateId}?scope=chain`)
        .set(headers())
        .expect(200);
      expect(res.body.name).toBe('Không cột tiền gửi');
      expect(res.body.columns.find((c: any) => c.col === 'deposit').visible).toBe(false);
    });

    it('rejects a column outside the report catalog', async () => {
      await request(app.getHttpServer())
        .post('/reports/cash-fund/templates')
        .set(headers())
        .send({
          reportType: SITUATION,
          name: 'Sai cột',
          scope: 'chain',
          columns: [{ col: 'documentNumber', visible: true }],
        })
        .expect(400);
    });

    it('deletes it', async () => {
      await request(app.getHttpServer())
        .delete(`/reports/cash-fund/templates/${templateId}?scope=chain`)
        .set(headers())
        .expect(200);
      const res = await request(app.getHttpServer())
        .get(`/reports/cash-fund/templates?reportType=${SITUATION}&scope=chain`)
        .set(headers())
        .expect(200);
      expect(res.body.map((t: any) => t.id)).not.toContain(templateId);
    });
  });
});
