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
 * UOW-04 (2026092701-promotion-item-discount-import-export) —
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
  const HEADERS_PERCENT = ['Mã SKU*', 'Tên hàng hóa', 'Đơn vị tính', 'Giá bán', '% giảm giá', 'Giá khuyến mại'];
  const HEADERS_AMOUNT = ['Mã SKU*', 'Tên hàng hóa', 'Đơn vị tính', 'Giá bán', 'Số tiền giảm', 'Giá khuyến mại'];
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

  it('AC-14: PERCENT file with SKU-685=30, SKU-200=20 → 2 valid ITEM rows, 0 errors', async () => {
    const file = await buildXlsx(HEADERS_PERCENT, [
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
          value: 30,
        },
        {
          rowNumber: 3,
          targetType: 'ITEM',
          targetId: PROMO_IDS.item200,
          code: 'SKU-200',
          name: 'Phụ kiện 200',
          value: 20,
        },
      ],
      errors: [],
    });
  });

  it('AC-15: each bad row comes back with its Excel row number and a Vietnamese reason; valid rows survive', async () => {
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

  it('AC-15: AMOUNT — non-positive amounts are rejected with the amount message', async () => {
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

  describe('AC-16: file-level column problems → 400, no rows', () => {
    it('"Số tiền giảm" column with method=PERCENT', async () => {
      const file = await buildXlsx(HEADERS_AMOUNT, [['SKU-685', 'Giày nữ 685', 'Cái', 685_000, 50_000, 635_000]]);

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

    it('method=FIXED_PRICE is rejected by validation', async () => {
      const file = await percentFile([['SKU-685', 30]]);

      await upload(file, 'FIXED_PRICE').expect(400);
    });
  });

  it('AC-17: case/whitespace-insensitive codes; a product code resolves to PRODUCT', async () => {
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

  it('AC-18: item and product codes of another organization are "not found"', async () => {
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

  describe('AC-19: size and format limits', () => {
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

  describe('AC-20: round-trip — importing an exported file returns the same targetIds and values', () => {
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
    ])('%s', async (method, lines) => {
      const exported = await exportFile({ method, lines });

      const res = await upload(exported, method).expect(200);

      expect(res.body.errors).toEqual([]);
      expect(
        res.body.rows.map((r: { targetType: string; targetId: string; value: number }) => ({
          targetType: r.targetType,
          targetId: r.targetId,
          value: r.value,
        })),
      ).toEqual(lines);
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
