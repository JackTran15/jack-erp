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
 * UOW-03 (2026092701-promotion-item-discount-import-export) —
 * `POST /v2/promotions/item-discount-lines/export`.
 *
 * Every case reads the returned bytes back with exceljs: a controller that lets a
 * JSON interceptor wrap the buffer still answers 200, so asserting on the status
 * alone proves nothing about the file a user actually downloads.
 */
describe('Promotion — item-discount lines export (e2e)', () => {
  let app: INestApplication;
  let base: SeedResult;
  let ds: DataSource;

  const URL = '/v2/promotions/item-discount-lines/export';
  const HEADERS_PERCENT = ['Mã SKU*', 'Tên hàng hóa', 'Đơn vị tính', 'Giá bán', '% giảm giá', 'Giá khuyến mại'];
  const HEADERS_AMOUNT = ['Mã SKU*', 'Tên hàng hóa', 'Đơn vị tính', 'Giá bán', 'Số tiền giảm', 'Giá khuyến mại'];

  /** An item that lives in another organization — AC-12. */
  const ORG_B = 'a0000000-0000-4000-8000-0000000000b3';
  const ORG_B_ITEM = 'e2000000-0000-4000-8000-0000000000b3';

  /** Same org, but a role without `promotion.read`. */
  const NO_PERM_USER = 'c0000000-0000-4000-8000-0000000000c3';
  const NO_PERM_ROLE = 'd0000000-0000-4000-8000-0000000000c3';
  let noPermToken: string;

  const exportLines = (body: unknown) =>
    request(app.getHttpServer())
      .post(URL)
      .set({
        Authorization: authHeader(base.accessToken),
        'X-Branch-Id': base.branchId,
      })
      .send(body as object)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

  /** Every row of the first sheet as plain cell values, header row included. */
  async function readRows(body: Buffer): Promise<unknown[][]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(body as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      rows.push((row.values as unknown[]).slice(1));
    });
    return rows;
  }

  // Booting AppModule wires every Kafka consumer (~130s on a local docker stack).
  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    base = await seedBaseData(app);
    await seedPromotionFixtures(app, base);
    ds = app.get(DataSource);

    // AC-12: a second organization owning one item with a recognisable code/name.
    await ds.query(
      `INSERT INTO organizations (id, organization_id, name, contact_email, status, created_by, created_at, updated_at)
       VALUES ($1::uuid, $1::uuid, 'Org B', 'b-export@test.com', 'ACTIVE', $2::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ORG_B, base.userId],
    );
    await ds.query(
      `INSERT INTO items (id, organization_id, code, name, unit, selling_price, is_active, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2, 'SKU-ORGB', 'Hàng của Org B', 'Cái', 999000, true, $3, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ORG_B_ITEM, ORG_B, base.userId],
    );

    // A user in the same org whose only role grants `inventory.read`.
    const hash = await bcrypt.hash('password123', 10);
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'noperm-export@test.com', $3, 'No', 'Perm', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [NO_PERM_USER, base.organizationId, hash],
    );
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'viewer', 'No promotion access', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [NO_PERM_ROLE, base.organizationId],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid) ON CONFLICT DO NOTHING`,
      [NO_PERM_USER, NO_PERM_ROLE, base.organizationId],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid) ON CONFLICT DO NOTHING`,
      [NO_PERM_USER, base.branchId, base.organizationId],
    );
    await ds.query(
      `INSERT INTO role_permissions (id, role_id, permission_id)
       SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = 'inventory.read'
       ON CONFLICT DO NOTHING`,
      [NO_PERM_ROLE],
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'noperm-export@test.com', password: 'password123', organizationId: base.organizationId })
      .expect(200);
    noPermToken = login.body.accessToken;
  }, 300_000);

  // Teardown disconnects each Kafka consumer in turn; the default 30s hook
  // timeout expires mid-teardown and Jest reports it as a suite failure.
  afterAll(async () => {
    await app?.close();
  }, 120_000);

  it('AC-09: PERCENT — headers, request order, 685.000 × 30% = 479.500', async () => {
    const res = await exportLines({
      method: 'PERCENT',
      lines: [
        { targetType: 'ITEM', targetId: PROMO_IDS.item685, value: 30 },
        { targetType: 'ITEM', targetId: PROMO_IDS.item100, value: 10 },
      ],
    }).expect(200);

    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers['content-disposition']).toBe('attachment; filename="GiamGiaHangHoa.xlsx"');

    const rows = await readRows(res.body as Buffer);
    expect(rows).toEqual([
      HEADERS_PERCENT,
      ['SKU-685', 'Giày nữ 685', 'Cái', 685_000, 30, 479_500],
      ['SKU-100', 'Phụ kiện 100', 'Cái', 100_000, 10, 90_000],
    ]);
  });

  it('AC-09: rows follow the request order, not the DB order', async () => {
    const res = await exportLines({
      method: 'PERCENT',
      lines: [
        { targetType: 'ITEM', targetId: PROMO_IDS.item300, value: 5 },
        { targetType: 'ITEM', targetId: PROMO_IDS.item100, value: 10 },
        { targetType: 'ITEM', targetId: PROMO_IDS.item685, value: 30 },
      ],
    }).expect(200);

    const rows = await readRows(res.body as Buffer);
    expect(rows.slice(1).map((r) => r[0])).toEqual(['SKU-300', 'SKU-100', 'SKU-685']);
  });

  it('AC-10: AMOUNT — "Số tiền giảm" header, promo price floors at 0', async () => {
    const res = await exportLines({
      method: 'AMOUNT',
      lines: [
        { targetType: 'ITEM', targetId: PROMO_IDS.item685, value: 50_000 },
        { targetType: 'ITEM', targetId: PROMO_IDS.item100, value: 150_000 },
      ],
    }).expect(200);

    const rows = await readRows(res.body as Buffer);
    expect(rows).toEqual([
      HEADERS_AMOUNT,
      ['SKU-685', 'Giày nữ 685', 'Cái', 685_000, 50_000, 635_000],
      ['SKU-100', 'Phụ kiện 100', 'Cái', 100_000, 150_000, 0],
    ]);
  });

  it.each([
    ['PERCENT', HEADERS_PERCENT],
    ['AMOUNT', HEADERS_AMOUNT],
  ])('AC-11: %s with no lines — template with the header row only', async (method, headers) => {
    const res = await exportLines({ method, lines: [] }).expect(200);

    expect(res.headers['content-disposition']).toBe('attachment; filename="GiamGiaHangHoa.xlsx"');
    const rows = await readRows(res.body as Buffer);
    expect(rows).toEqual([headers]);
  });

  it('AC-12: a targetId from another organization is dropped without leaking its code or name', async () => {
    const res = await exportLines({
      method: 'PERCENT',
      lines: [
        { targetType: 'ITEM', targetId: ORG_B_ITEM, value: 20 },
        { targetType: 'ITEM', targetId: PROMO_IDS.item685, value: 30 },
      ],
    }).expect(200);

    const rows = await readRows(res.body as Buffer);
    expect(rows).toEqual([HEADERS_PERCENT, ['SKU-685', 'Giày nữ 685', 'Cái', 685_000, 30, 479_500]]);

    const flat = JSON.stringify(rows);
    expect(flat).not.toContain('SKU-ORGB');
    expect(flat).not.toContain('Org B');
  });

  it('403 for a user without promotion.read', async () => {
    await request(app.getHttpServer())
      .post(URL)
      .set({ Authorization: authHeader(noPermToken), 'X-Branch-Id': base.branchId })
      .send({ method: 'PERCENT', lines: [] })
      .expect(403);
  });
});
