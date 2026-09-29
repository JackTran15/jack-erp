import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import * as bcrypt from 'bcryptjs';
import {
  authHeader,
  createTestApp,
  request,
  resetDatabase,
  seedBaseData,
  type SeedResult,
} from './setup/test-app';
import { PROMO_IDS, seedPromotionFixtures } from './setup/promotion-seed';

/**
 * UOW-04 (2026092701-promotion-item-discount-import-export), extended by UOW-02
 * (2026092801-promotion-item-discount-columns-sheets): sheet picked by method,
 * legacy 1-sheet files still accepted, `FIXED_PRICE` reads codes only —
 * `POST /v2/promotions/item-discount-lines/import`.
 *
 * Files are built with exceljs inside the test, so every case uploads a real
 * `.xlsx` through multer and exercises the org-scoped, case-insensitive code
 * lookup (`LOWER(TRIM(code)) IN (...)`) against Postgres.
 */
describe('Promotion — item-discount lines import (e2e)', () => {
  let app: INestApplication;
  let base: SeedResult;
  let ds: DataSource;

  const URL = '/v2/promotions/item-discount-lines/import';
  const EXPORT_URL = '/v2/promotions/item-discount-lines/export';
  /** The 6-column, single `Sheet1` layout exported before 2026092801 (AC-18). */
  const LEGACY_HEADERS_PERCENT = ['Mã SKU*', 'Tên hàng hóa', 'Đơn vị tính', 'Giá bán', '% giảm giá', 'Giá khuyến mại'];
  const LEGACY_HEADERS_AMOUNT = ['Mã SKU*', 'Tên hàng hóa', 'Đơn vị tính', 'Giá bán', 'Số tiền giảm', 'Giá khuyến mại'];
  const SHEET_PERCENT = 'Giảm giá theo %';
  const SHEET_AMOUNT = 'Giảm giá theo số tiền';
  const SHEET_FIXED = 'Đồng giá';
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  /** A product (mẫu mã) in the test org, code distinct from every item code — AC-17. */
  const PRODUCT_ID = 'e3000000-0000-4000-8000-0000000000a4';
  const PRODUCT_CODE = 'MM-IMP-685';

  /** An item and a product that live in another organization — AC-18. */
  const ORG_B = 'a0000000-0000-4000-8000-0000000000b4';
  const ORG_B_ITEM = 'e2000000-0000-4000-8000-0000000000b4';
  const ORG_B_PRODUCT = 'e3000000-0000-4000-8000-0000000000b4';

  /** Same org, a role granting `promotion.read` only (no `promotion.write`). */
  const READ_ONLY_USER = 'c0000000-0000-4000-8000-0000000000c4';
  const READ_ONLY_ROLE = 'd0000000-0000-4000-8000-0000000000c4';
  let readOnlyToken: string;

  type Cell = string | number | null;

  async function buildXlsx(headers: string[], rows: Cell[][]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(headers);
    for (const row of rows) sheet.addRow(row);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  interface SheetSpec {
    name: string;
    headers: string[];
    rows: Cell[][];
  }

  async function buildWorkbook(sheets: SheetSpec[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    for (const spec of sheets) {
      const sheet = workbook.addWorksheet(spec.name);
      sheet.addRow(spec.headers);
      for (const row of spec.rows) sheet.addRow(row);
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Headers `Mã SKU*` + value column, one `[code, value]` pair per row. */
  const percentFile = (rows: Cell[][]) => buildXlsx(['Mã SKU*', '% giảm giá'], rows);

  const upload = (
    file: Buffer | undefined,
    method: string,
    opts: { token?: string; filename?: string; contentType?: string } = {},
  ) => {
    const req = request(app.getHttpServer())
      .post(URL)
      .set({ Authorization: authHeader(opts.token ?? base.accessToken), 'X-Branch-Id': base.branchId })
      .field('method', method);
    if (file) {
      req.attach('file', file, {
        filename: opts.filename ?? 'GiamGiaHangHoa.xlsx',
        contentType: opts.contentType ?? XLSX_MIME,
      });
    }
    return req;
  };

  const exportFile = async (body: object): Promise<Buffer> => {
    const res = await request(app.getHttpServer())
      .post(EXPORT_URL)
      .set({ Authorization: authHeader(base.accessToken), 'X-Branch-Id': base.branchId })
      .send(body)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    return res.body as Buffer;
  };

  // Booting AppModule wires every Kafka consumer (~130s on a local docker stack).
  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    base = await seedBaseData(app);
    await seedPromotionFixtures(app, base);
    ds = app.get(DataSource);

    await ds.query(
      `INSERT INTO products (id, organization_id, code, name, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, 'Mẫu giày nữ 685', $4::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [PRODUCT_ID, base.organizationId, PRODUCT_CODE, base.userId],
    );
    await ds.query(`UPDATE items SET product_id = $1::uuid WHERE id = $2::uuid`, [PRODUCT_ID, PROMO_IDS.item685]);

    // AC-18: a second organization owning one item and one product.
    await ds.query(
      `INSERT INTO organizations (id, organization_id, name, contact_email, status, created_by, created_at, updated_at)
       VALUES ($1::uuid, $1::uuid, 'Org B', 'b-import@test.com', 'ACTIVE', $2::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ORG_B, base.userId],
    );
    await ds.query(
      `INSERT INTO items (id, organization_id, code, name, unit, selling_price, is_active, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2, 'SKU-ORGB', 'Hàng của Org B', 'Cái', 999000, true, $3, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ORG_B_ITEM, ORG_B, base.userId],
    );
    await ds.query(
      `INSERT INTO products (id, organization_id, code, name, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'MM-ORGB', 'Mẫu của Org B', $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ORG_B_PRODUCT, ORG_B, base.userId],
    );

    // A user in the same org whose only role grants `promotion.read`.
    const hash = await bcrypt.hash('password123', 10);
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'readonly-import@test.com', $3, 'Read', 'Only', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [READ_ONLY_USER, base.organizationId, hash],
    );
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'promotion-viewer', 'promotion.read only', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [READ_ONLY_ROLE, base.organizationId],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid) ON CONFLICT DO NOTHING`,
      [READ_ONLY_USER, READ_ONLY_ROLE, base.organizationId],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid) ON CONFLICT DO NOTHING`,
      [READ_ONLY_USER, base.branchId, base.organizationId],
    );
    await ds.query(
      `INSERT INTO role_permissions (id, role_id, permission_id)
       SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = 'promotion.read'
       ON CONFLICT DO NOTHING`,
      [READ_ONLY_ROLE],
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'readonly-import@test.com', password: 'password123', organizationId: base.organizationId })
      .expect(200);
    readOnlyToken = login.body.accessToken;
  }, 300_000);

  // Teardown disconnects each Kafka consumer in turn; the default 30s hook
  // timeout expires mid-teardown and Jest reports it as a suite failure.
  afterAll(async () => {
    await app?.close();
  }, 120_000);

  it('[2026092801] AC-18 / [2026092701] AC-14: legacy 1-sheet 6-column PERCENT file → 2 valid ITEM rows, 0 errors', async () => {
    const file = await buildXlsx(LEGACY_HEADERS_PERCENT, [
      ['SKU-685', 'Giày nữ 685', 'Cái', 685_000, 30, 479_500],
      ['SKU-200', 'Phụ kiện 200', 'Cái', 200_000, 20, 160_000],
    ]);

    const res = await upload(file, 'PERCENT').expect(200);

    expect(res.body).toEqual({
      rows: [
        {
          rowNumber: 2,
          targetType: 'ITEM',
          targetId: PROMO_IDS.item685,
          code: 'SKU-685',
          name: 'Giày nữ 685',
          unit: 'Cái',
          sellingPrice: 685_000,
          value: 30,
        },
        {
          rowNumber: 3,
          targetType: 'ITEM',
          targetId: PROMO_IDS.item200,
          code: 'SKU-200',
          name: 'Phụ kiện 200',
          unit: 'Cái',
          sellingPrice: 200_000,
          value: 20,
        },
      ],
      errors: [],
    });
  });

  it('[2026092701] AC-15: each bad row comes back with its Excel row number and a Vietnamese reason; valid rows survive', async () => {
    const file = await percentFile([
      ['SKU-685', 30], // 2 valid
      ['KHONG-TON-TAI', 10], // 3 not found
      [null, 10], // 4 missing code
      ['SKU-100', 120], // 5 % > 100
      ['SKU-300', 'abc'], // 6 not a number
      ['SKU-OTHER', null], // 7 empty value
      ['SKU-200', 20], // 8 duplicate of 10
      [null, null], // 9 fully empty → skipped silently
      ['sku-200', 25], // 10 duplicate of 8 (case-insensitive)
      ['SKU-ZERO', 0], // 11 value ≤ 0
    ]);

    const res = await upload(file, 'PERCENT').expect(200);

    expect(res.body.rows).toEqual([
      expect.objectContaining({ rowNumber: 2, targetId: PROMO_IDS.item685, value: 30 }),
    ]);
    const percentMsg = '% giảm giá phải lớn hơn 0 và không quá 100';
    expect(res.body.errors).toEqual([
      { rowNumber: 3, code: 'KHONG-TON-TAI', message: "Không tìm thấy hàng hóa có mã 'KHONG-TON-TAI'" },
      { rowNumber: 4, message: 'Thiếu mã SKU' },
      { rowNumber: 5, code: 'SKU-100', message: percentMsg },
      { rowNumber: 6, code: 'SKU-300', message: percentMsg },
      { rowNumber: 7, code: 'SKU-OTHER', message: percentMsg },
      { rowNumber: 8, code: 'SKU-200', message: 'Mã SKU bị trùng trong file (dòng 8, 10)' },
      { rowNumber: 10, code: 'sku-200', message: 'Mã SKU bị trùng trong file (dòng 8, 10)' },
      { rowNumber: 11, code: 'SKU-ZERO', message: percentMsg },
    ]);
  });

  it('[2026092701] AC-15: AMOUNT — non-positive amounts are rejected with the amount message', async () => {
    const file = await buildXlsx(['Mã SKU*', 'Số tiền giảm'], [
      ['SKU-685', 50_000],
      ['SKU-100', 0],
      ['SKU-300', -5],
    ]);

    const res = await upload(file, 'AMOUNT').expect(200);

    expect(res.body.rows).toEqual([
      expect.objectContaining({ rowNumber: 2, targetId: PROMO_IDS.item685, value: 50_000 }),
    ]);
    expect(res.body.errors).toEqual([
      { rowNumber: 3, code: 'SKU-100', message: 'Số tiền giảm phải lớn hơn 0' },
      { rowNumber: 4, code: 'SKU-300', message: 'Số tiền giảm phải lớn hơn 0' },
    ]);
  });

  describe('[2026092701] AC-16: file-level column problems → 400, no rows', () => {
    it('"Số tiền giảm" column with method=PERCENT', async () => {
      const file = await buildXlsx(LEGACY_HEADERS_AMOUNT, [['SKU-685', 'Giày nữ 685', 'Cái', 685_000, 50_000, 635_000]]);

      const res = await upload(file, 'PERCENT').expect(400);

      expect(res.body.message).toBe("File có cột 'Số tiền giảm' nhưng chương trình đang giảm theo %");
      expect(res.body.rows).toBeUndefined();
    });

    it('"% giảm giá" column with method=AMOUNT', async () => {
      const file = await percentFile([['SKU-685', 30]]);

      const res = await upload(file, 'AMOUNT').expect(400);

      expect(res.body.message).toBe("File có cột '% giảm giá' nhưng chương trình đang giảm theo số tiền");
    });

    it('missing "Mã SKU" column', async () => {
      const file = await buildXlsx(['Tên hàng hóa', '% giảm giá'], [['Giày nữ 685', 30]]);

      const res = await upload(file, 'PERCENT').expect(400);

      expect(res.body.message).toBe("File thiếu cột 'Mã SKU'");
      expect(res.body.rows).toBeUndefined();
    });

    it('an unknown method is rejected by validation', async () => {
      const file = await percentFile([['SKU-685', 30]]);

      await upload(file, 'BUY_X_GET_Y').expect(400);
    });
  });

  it('[2026092701] AC-17: case/whitespace-insensitive codes; a product code resolves to PRODUCT', async () => {
    const file = await percentFile([
      [' sku-685 ', 30],
      [`  ${PRODUCT_CODE.toLowerCase()} `, 15],
    ]);

    const res = await upload(file, 'PERCENT').expect(200);

    expect(res.body).toEqual({
      rows: [
        {
          rowNumber: 2,
          targetType: 'ITEM',
          targetId: PROMO_IDS.item685,
          code: 'SKU-685',
          name: 'Giày nữ 685',
          unit: 'Cái',
          sellingPrice: 685_000,
          value: 30,
        },
        {
          rowNumber: 3,
          targetType: 'PRODUCT',
          targetId: PRODUCT_ID,
          code: PRODUCT_CODE,
          name: 'Mẫu giày nữ 685',
          value: 15,
        },
      ],
      errors: [],
    });
  });

  it('[2026092701] AC-18: item and product codes of another organization are "not found"', async () => {
    const file = await percentFile([
      ['SKU-ORGB', 10],
      ['MM-ORGB', 10],
      ['SKU-685', 30],
    ]);

    const res = await upload(file, 'PERCENT').expect(200);

    expect(res.body.rows).toEqual([expect.objectContaining({ rowNumber: 4, targetId: PROMO_IDS.item685 })]);
    expect(res.body.errors).toEqual([
      { rowNumber: 2, code: 'SKU-ORGB', message: "Không tìm thấy hàng hóa có mã 'SKU-ORGB'" },
      { rowNumber: 3, code: 'MM-ORGB', message: "Không tìm thấy hàng hóa có mã 'MM-ORGB'" },
    ]);
    const flat = JSON.stringify(res.body);
    expect(flat).not.toContain(ORG_B_ITEM);
    expect(flat).not.toContain(ORG_B_PRODUCT);
    expect(flat).not.toContain('Org B');
  });

  describe('[2026092701] AC-19: size and format limits', () => {
    const codeRows = (n: number): Cell[][] =>
      Array.from({ length: n }, (_, i) => [`GEN-${String(i + 1).padStart(4, '0')}`, 10]);

    it('exactly 2.000 data rows is accepted (one batched lookup)', async () => {
      const file = await percentFile([['SKU-685', 30], ...codeRows(1999)]);

      const res = await upload(file, 'PERCENT').expect(200);

      expect(res.body.rows).toHaveLength(1);
      expect(res.body.errors).toHaveLength(1999);
    });

    it('2.001 data rows → 400 "File vượt quá 2.000 dòng"', async () => {
      const file = await percentFile(codeRows(2001));

      const res = await upload(file, 'PERCENT').expect(400);

      expect(res.body.message).toBe('File vượt quá 2.000 dòng');
    });

    it('a .csv upload → 400 "File không đúng định dạng .xlsx"', async () => {
      const csv = Buffer.from('Mã SKU*,% giảm giá\nSKU-685,30\n', 'utf8');

      const res = await upload(csv, 'PERCENT', { filename: 'GiamGiaHangHoa.csv', contentType: 'text/csv' }).expect(
        400,
      );

      expect(res.body.message).toBe('File không đúng định dạng .xlsx');
    });

    it('garbage bytes named .xlsx → 400 "File không đúng định dạng .xlsx"', async () => {
      const res = await upload(Buffer.from('not a zip at all'), 'PERCENT').expect(400);

      expect(res.body.message).toBe('File không đúng định dạng .xlsx');
    });

    it('no file → 400 "Chưa chọn file"', async () => {
      const res = await upload(undefined, 'PERCENT').expect(400);

      expect(res.body.message).toBe('Chưa chọn file');
    });
  });

  describe('[2026092801] AC-15: a 3-sheet file is read from the sheet of the chosen method only', () => {
    const threeSheetFile = () =>
      buildWorkbook([
        { name: SHEET_PERCENT, headers: ['Mã SKU*', 'Tên hàng hóa', '% giảm giá'], rows: [['SKU-685', 'Giày nữ 685', 30]] },
        {
          name: SHEET_AMOUNT,
          headers: ['Mã SKU*', 'Tên hàng hóa', 'Số tiền giảm'],
          rows: [['SKU-200', 'Phụ kiện 200', 20_000]],
        },
        { name: SHEET_FIXED, headers: ['Mã SKU*', 'Tên hàng hóa'], rows: [] },
      ]);

    it('AMOUNT → only SKU-200 (20.000) from "Giảm giá theo số tiền"', async () => {
      const res = await upload(await threeSheetFile(), 'AMOUNT').expect(200);

      expect(res.body).toEqual({
        rows: [
          {
            rowNumber: 2,
            targetType: 'ITEM',
            targetId: PROMO_IDS.item200,
            code: 'SKU-200',
            name: 'Phụ kiện 200',
            unit: 'Cái',
            sellingPrice: 200_000,
            value: 20_000,
          },
        ],
        errors: [],
      });
    });

    it('PERCENT → only SKU-685 (30) from "Giảm giá theo %"', async () => {
      const res = await upload(await threeSheetFile(), 'PERCENT').expect(200);

      expect(res.body.errors).toEqual([]);
      expect(res.body.rows).toEqual([
        expect.objectContaining({ rowNumber: 2, targetId: PROMO_IDS.item685, code: 'SKU-685', value: 30 }),
      ]);
    });

    it('sheet names match after trim, case-insensitively', async () => {
      const file = await buildWorkbook([
        { name: '  GIẢM GIÁ THEO SỐ TIỀN ', headers: ['Mã SKU*', 'Số tiền giảm'], rows: [['SKU-200', 20_000]] },
        { name: 'Ghi chú', headers: ['Mã SKU*', '% giảm giá'], rows: [['SKU-685', 30]] },
      ]);

      const res = await upload(file, 'AMOUNT').expect(200);

      expect(res.body.errors).toEqual([]);
      expect(res.body.rows).toEqual([expect.objectContaining({ targetId: PROMO_IDS.item200, value: 20_000 })]);
    });
  });

  it('[2026092801] AC-16: FIXED_PRICE — blank code skipped, unknown code and duplicates reported, valid row has no value', async () => {
    const file = await buildWorkbook([
      { name: SHEET_PERCENT, headers: ['Mã SKU*', 'Tên hàng hóa', '% giảm giá'], rows: [] },
      { name: SHEET_AMOUNT, headers: ['Mã SKU*', 'Tên hàng hóa', 'Số tiền giảm'], rows: [] },
      {
        name: SHEET_FIXED,
        headers: ['Mã SKU*', 'Tên hàng hóa'],
        rows: [
          ['SKU-685', 'Giày nữ 685'], // 2 duplicate of 6
          ['SKU-200', 'Phụ kiện 200'], // 3 valid
          [null, 'Dòng không có mã'], // 4 blank code → skipped silently
          ['KHONG-TON-TAI', 'Không có'], // 5 not found
          ['sku-685', 'Giày nữ 685'], // 6 duplicate of 2 (case-insensitive)
        ],
      },
    ]);

    const res = await upload(file, 'FIXED_PRICE').expect(200);

    // toEqual on the whole row: a `value` key on a FIXED_PRICE line would fail here.
    expect(res.body).toEqual({
      rows: [
        {
          rowNumber: 3,
          targetType: 'ITEM',
          targetId: PROMO_IDS.item200,
          code: 'SKU-200',
          name: 'Phụ kiện 200',
          unit: 'Cái',
          sellingPrice: 200_000,
        },
      ],
      errors: [
        { rowNumber: 2, code: 'SKU-685', message: 'Mã SKU bị trùng trong file (dòng 2, 6)' },
        { rowNumber: 5, code: 'KHONG-TON-TAI', message: "Không tìm thấy hàng hóa có mã 'KHONG-TON-TAI'" },
        { rowNumber: 6, code: 'sku-685', message: 'Mã SKU bị trùng trong file (dòng 2, 6)' },
      ],
    });
  });

  describe("[2026092801] AC-17: a multi-sheet file without the method's sheet → 400, no rows", () => {
    it('PERCENT, sheets "Sheet1" + "Sheet2"', async () => {
      const file = await buildWorkbook([
        { name: 'Sheet1', headers: ['Mã SKU*', '% giảm giá'], rows: [['SKU-685', 30]] },
        { name: 'Sheet2', headers: ['Mã SKU*', '% giảm giá'], rows: [['SKU-100', 10]] },
      ]);

      const res = await upload(file, 'PERCENT').expect(400);

      expect(res.body.message).toBe("File không có sheet 'Giảm giá theo %'");
      expect(res.body.rows).toBeUndefined();
    });

    it('FIXED_PRICE, the two value sheets present but "Đồng giá" missing', async () => {
      const file = await buildWorkbook([
        { name: SHEET_PERCENT, headers: ['Mã SKU*', 'Tên hàng hóa', '% giảm giá'], rows: [['SKU-685', 'x', 30]] },
        { name: SHEET_AMOUNT, headers: ['Mã SKU*', 'Tên hàng hóa', 'Số tiền giảm'], rows: [] },
      ]);

      const res = await upload(file, 'FIXED_PRICE').expect(400);

      expect(res.body.message).toBe("File không có sheet 'Đồng giá'");
    });
  });

  describe('[2026092801] AC-18: a legacy 1-sheet 6-column "% giảm giá" file is still accepted', () => {
    const legacyPercentFile = () =>
      buildXlsx(LEGACY_HEADERS_PERCENT, [
        ['SKU-685', 'Giày nữ 685', 'Cái', 685_000, 30, 479_500],
        ['SKU-200', 'Phụ kiện 200', 'Cái', 200_000, 'abc', null],
        [null, 'Không có mã', null, null, 150, null],
      ]);

    it('FIXED_PRICE reads the codes and ignores the value column (A-10)', async () => {
      const res = await upload(await legacyPercentFile(), 'FIXED_PRICE').expect(200);

      expect(res.body).toEqual({
        rows: [
          {
            rowNumber: 2,
            targetType: 'ITEM',
            targetId: PROMO_IDS.item685,
            code: 'SKU-685',
            name: 'Giày nữ 685',
            unit: 'Cái',
            sellingPrice: 685_000,
          },
          {
            rowNumber: 3,
            targetType: 'ITEM',
            targetId: PROMO_IDS.item200,
            code: 'SKU-200',
            name: 'Phụ kiện 200',
            unit: 'Cái',
            sellingPrice: 200_000,
          },
        ],
        errors: [],
      });
    });

    it('AMOUNT → 400, the column does not match the method', async () => {
      const res = await upload(await legacyPercentFile(), 'AMOUNT').expect(400);

      expect(res.body.message).toBe("File có cột '% giảm giá' nhưng chương trình đang giảm theo số tiền");
      expect(res.body.rows).toBeUndefined();
    });
  });

  describe('[2026092801] AC-19: round-trip — importing an exported 3-sheet file returns the same targets', () => {
    const PRICE_BY_ITEM: Record<string, number> = {
      [PROMO_IDS.item685]: 685_000,
      [PROMO_IDS.item100]: 100_000,
      [PROMO_IDS.item200]: 200_000,
    };

    it.each([
      [
        'PERCENT',
        [
          { targetType: 'ITEM', targetId: PROMO_IDS.item685, value: 30 },
          { targetType: 'ITEM', targetId: PROMO_IDS.item100, value: 10 },
          { targetType: 'PRODUCT', targetId: PRODUCT_ID, value: 12.5 },
        ],
      ],
      [
        'AMOUNT',
        [
          { targetType: 'ITEM', targetId: PROMO_IDS.item685, value: 50_000 },
          { targetType: 'ITEM', targetId: PROMO_IDS.item100, value: 150_000 },
        ],
      ],
      [
        'FIXED_PRICE',
        [
          { targetType: 'ITEM', targetId: PROMO_IDS.item685 },
          { targetType: 'ITEM', targetId: PROMO_IDS.item200 },
          { targetType: 'PRODUCT', targetId: PRODUCT_ID },
        ],
      ],
    ])('%s', async (method, lines: { targetType: string; targetId: string; value?: number }[]) => {
      const exported = await exportFile({ method, lines });

      const res = await upload(exported, method).expect(200);

      expect(res.body.errors).toEqual([]);
      type Row = { targetType: string; targetId: string; value?: number; unit?: string; sellingPrice?: number };
      const rows = res.body.rows as Row[];
      expect(
        rows.map((r) => ({
          targetType: r.targetType,
          targetId: r.targetId,
          ...(r.value !== undefined && { value: r.value }),
        })),
      ).toEqual(lines);
      if (method === 'FIXED_PRICE') {
        for (const r of rows) expect(r).not.toHaveProperty('value');
      }

      // A-14: ITEM rows carry unit + selling price read from the DB; PRODUCT rows carry neither.
      for (const r of rows) {
        if (r.targetType === 'ITEM') {
          expect(r).toMatchObject({ unit: 'Cái', sellingPrice: PRICE_BY_ITEM[r.targetId] });
        } else {
          expect(r).not.toHaveProperty('unit');
          expect(r).not.toHaveProperty('sellingPrice');
        }
      }
    });
  });

  it('403 for a user with only promotion.read', async () => {
    // Control: the role really carries promotion.read — export (promotion.read) is allowed.
    await request(app.getHttpServer())
      .post(EXPORT_URL)
      .set({ Authorization: authHeader(readOnlyToken), 'X-Branch-Id': base.branchId })
      .send({ method: 'PERCENT', lines: [] })
      .expect(200);

    const file = await percentFile([['SKU-685', 30]]);
    await upload(file, 'PERCENT', { token: readOnlyToken }).expect(403);
  });
});
