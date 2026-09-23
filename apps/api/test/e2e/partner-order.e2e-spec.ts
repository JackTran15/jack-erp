import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { upsertGeoDataset, GeoDataset } from '../../src/modules/geo/geo-dataset.loader';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
  request,
} from './setup/test-app';

/**
 * Bằng chứng đường partner (T-01-05): AC-01 (tạo đơn + gửi lại vẫn đúng một
 * đơn dưới tải chạy thật), AC-06 (key thiếu quyền bị chặn), AC-07 (đơn
 * `branch_id IS NULL` vô hình với mọi chi nhánh).
 *
 * Chạy với `OUTBOX_RELAY_DISABLED=1` — thiếu biến này relay khởi động trước
 * khi `outbox_messages` tồn tại và có thể làm cả suite FAIL dù mọi test xanh.
 */

const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';
const SEEDED_USER_ID = 'c0000000-0000-4000-8000-000000000001';
const SEEDED_ORG_ID = 'a0000000-0000-4000-8000-000000000001';

// Vai đúng: CHỈ partner.order.create — vai kia ("Đối tác") chỉ có
// partner.catalog.read, dùng để chứng minh AC-06 (key sai quyền → 403).
const PARTNER_ORDER_ROLE_ID = 'd0000000-0000-4000-8000-000000000092';
const PARTNER_CATALOG_ROLE_ID = 'd0000000-0000-4000-8000-000000000091';

const SECOND_BRANCH_ID = 'b0000000-0000-4000-8000-000000000002';
const CHANNEL_ID = 'e8000000-0000-4000-8000-000000000001';
const CATEGORY_ID = 'e1000000-0000-4000-8000-000000000001';
const PRODUCT_ID = 'e2000000-0000-4000-8000-000000000001';
const ITEM_ID = 'e3000000-0000-4000-8000-000000000001';
const ITEM_CODE = 'PORD-0001';

const WHITELISTED_IP = '203.0.113.7';

const DATASET_DIR = path.resolve(__dirname, '../../src/database/migrations/data/geo-2026');
function readDataset(): GeoDataset {
  const read = <T>(file: string): T =>
    JSON.parse(readFileSync(path.join(DATASET_DIR, file), 'utf8')) as T;
  return { provinces: read('provinces.json'), wards: read('wards.json') };
}

async function ensurePermission(ds: DataSource, key: string, module: string) {
  await ds.query(
    `INSERT INTO permissions (id, key, description, module)
     VALUES (gen_random_uuid(), $1, $1, $2) ON CONFLICT DO NOTHING`,
    [key, module],
  );
}

async function grantToRole(ds: DataSource, roleId: string, key: string) {
  await ds.query(
    `INSERT INTO role_permissions (id, role_id, permission_id)
     SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
     ON CONFLICT DO NOTHING`,
    [roleId, key],
  );
}

let app!: INestApplication;
let seed!: SeedResult;
let orderKey!: string; // holds partner.order.create
let catalogOnlyKey!: string; // holds only partner.catalog.read
let provinceCode!: string;
let wardCode!: string;
let secondBranchAccessToken!: string;

function orderPayload(externalOrderId: string) {
  return {
    externalOrderId,
    customer: { name: 'Nguyễn Văn A', phone: '0901234567' },
    recipient: { name: 'Nguyễn Văn A', phone: '0901234567' },
    shipping: {
      provinceCode,
      wardCode,
      addressLine: '123 Đường ABC',
      fee: 30000,
    },
    lines: [{ itemCode: ITEM_CODE, quantity: 2 }],
  };
}

describe('Partner order intake — /v2/partner/orders (E2E)', () => {
  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    const ds = app.get(DataSource);

    await ds.query('CREATE EXTENSION IF NOT EXISTS unaccent');
    await upsertGeoDataset(ds, readDataset());

    // `resetDatabase()` rebuilds the schema via `synchronize(true)`, which is
    // driven by entity decorators only — this partial unique index lives in
    // migration 1790100100000-ExtendSalesOrdersForOnlineIntake and is NOT an
    // entity-level `@Index`, so it never gets (re)created that way. Without it
    // the replay/concurrency assertions below are testing nothing.
    await ds.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_sales_orders_org_channel_external"
        ON "sales_orders" ("organization_id", "sales_channel_id", "external_order_id")
        WHERE "external_order_id" IS NOT NULL
    `);

    const dataset = readDataset();
    const province = dataset.provinces[0];
    const ward = dataset.wards.find((w) => w.provinceCode === province.code);
    if (!ward) throw new Error('Fixture geo dataset has no ward for the first province');
    provinceCode = province.code;
    wardCode = ward.code;

    // Second branch — used to prove AC-07 (pool order invisible to every branch).
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Second Branch', 'ACTIVE', false, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [SECOND_BRANCH_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );
    // Grant the seeded admin access to it too — BranchScopeGuard 403s any
    // X-Branch-Id the actor is not assigned to, independent of AC-07.
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
       ON CONFLICT DO NOTHING`,
      [SEEDED_USER_ID, SECOND_BRANCH_ID, SEEDED_ORG_ID],
    );
    // `branchIds` is embedded in the JWT at login time — `seed.accessToken`
    // predates this assignment, so log in again to get a token that carries it.
    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'password123', organizationId: SEEDED_ORG_ID })
      .expect(200);
    secondBranchAccessToken = relogin.body.accessToken;

    // Sales channel the key will speak for.
    await ds.query(
      `INSERT INTO sales_channels (id, organization_id, created_by, code, name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'WEB', 'Website', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [CHANNEL_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );

    // Minimal product/category/item so partnerLines() can price a line.
    await ds.query(
      `INSERT INTO inventory_item_categories
         (id, organization_id, created_by, name, code, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Danh mục test', 'CAT-01', 'ACTIVE'::inventory_item_category_status_enum, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [CATEGORY_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );
    await ds.query(
      `INSERT INTO products (id, organization_id, created_by, code, name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'PORD-P1', 'Sản phẩm test', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [PRODUCT_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );
    await ds.query(
      `INSERT INTO items
         (id, organization_id, created_by, code, name, unit, is_active,
          selling_price, purchase_price, product_id, category_id, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'Hàng test', 'pcs', true, 100000, 60000, $5::uuid, $6::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ITEM_ID, SEEDED_ORG_ID, SEEDED_USER_ID, ITEM_CODE, PRODUCT_ID, CATEGORY_ID],
    );

    // Two roles, permission sets from the ticket: "Đối tác đặt hàng" holds
    // exactly partner.order.create; "Đối tác" holds exactly partner.catalog.read.
    await ensurePermission(ds, 'partner.order.create', 'partner-order');
    await ensurePermission(ds, 'partner.catalog.read', 'partner-catalog');
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Đối tác đặt hàng', 'Partner order role', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [PARTNER_ORDER_ROLE_ID, SEEDED_ORG_ID],
    );
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Đối tác', 'Partner catalog role', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [PARTNER_CATALOG_ROLE_ID, SEEDED_ORG_ID],
    );
    await grantToRole(ds, PARTNER_ORDER_ROLE_ID, 'partner.order.create');
    await grantToRole(ds, PARTNER_CATALOG_ROLE_ID, 'partner.catalog.read');

    // seedBaseData's admin role needs pos.sales-order.read to exercise
    // GET /mobile/sales-orders below.
    await ensurePermission(ds, 'pos.sales-order.read', 'pos');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.read');
    await ensurePermission(ds, 'api-key.read', 'api-key');
    await ensurePermission(ds, 'api-key.create', 'api-key');
    await grantToRole(ds, SEEDED_ROLE_ID, 'api-key.read');
    await grantToRole(ds, SEEDED_ROLE_ID, 'api-key.create');
    await app.get(RbacService).invalidateUserPermissions(SEEDED_USER_ID, SEEDED_ORG_ID);

    const orderKeyRes = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({
        name: 'Partner order key',
        roles: [PARTNER_ORDER_ROLE_ID],
        ipWhitelist: [WHITELISTED_IP],
        salesChannelId: CHANNEL_ID,
      })
      .expect(201);
    orderKey = orderKeyRes.body.rawKey;

    const catalogKeyRes = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({
        name: 'Catalog-only key',
        roles: [PARTNER_CATALOG_ROLE_ID],
        ipWhitelist: [WHITELISTED_IP],
        salesChannelId: CHANNEL_ID,
      })
      .expect(201);
    catalogOnlyKey = catalogKeyRes.body.rawKey;
  }, 600_000);

  afterAll(async () => {
    await app?.close();
  });

  const postOrder = (key: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/v2/partner/orders')
      .set('X-Api-Key', key)
      .set('X-Forwarded-For', WHITELISTED_IP)
      .send(body);

  it('AC-01: đối tác đặt đơn hợp lệ → 201, đơn rơi vào pool (branch_id NULL)', async () => {
    const res = await postOrder(orderKey, orderPayload('AC01-ORDER-1')).expect(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('SENT');
    expect(res.body.lines).toHaveLength(1);
    // Đối tác gửi MÃ (T-01-08); dòng trả về mang cả UUID lẫn mã, giá do server chốt.
    expect(res.body.lines[0]).toMatchObject({ itemId: ITEM_ID, itemCode: ITEM_CODE, quantity: 2 });

    const ds = app.get(DataSource);
    const [row] = await ds.query('SELECT branch_id FROM sales_orders WHERE id = $1', [res.body.id]);
    expect(row.branch_id).toBeNull();
  });

  it('AC-04/T-01-08: itemCode lạ → 400 ORDER_LINE_ITEM_UNKNOWN kèm mã; gửi itemId → 400 field lạ; không đơn nào được tạo', async () => {
    const unknown = await postOrder(orderKey, { ...orderPayload('T0108-UNKNOWN'), lines: [{ itemCode: 'KHONG-CO-MA-NAY', quantity: 1 }] }).expect(400);
    expect(unknown.body.details.code).toBe('ORDER_LINE_ITEM_UNKNOWN');
    expect(unknown.body.message).toContain('KHONG-CO-MA-NAY');

    const byId = await postOrder(orderKey, { ...orderPayload('T0108-BYID'), lines: [{ itemId: ITEM_ID, quantity: 1 }] }).expect(400);
    expect(JSON.stringify(byId.body.message)).toContain('itemId');

    const ds = app.get(DataSource);
    const rows = await ds.query(
      `SELECT id FROM sales_orders WHERE organization_id = $1 AND external_order_id LIKE 'T0108-%'`,
      [SEEDED_ORG_ID],
    );
    expect(rows).toHaveLength(0);
  });

  it('AC-06: gửi lại cùng externalOrderId → 200 với đúng id cũ, không tạo đơn thứ hai', async () => {
    const first = await postOrder(orderKey, orderPayload('AC06-RESEND')).expect(201);

    const second = await postOrder(orderKey, orderPayload('AC06-RESEND')).expect(200);
    expect(second.body.id).toBe(first.body.id);

    const ds = app.get(DataSource);
    const rows = await ds.query(
      `SELECT id FROM sales_orders WHERE organization_id = $1 AND sales_channel_id = $2 AND external_order_id = $3`,
      [SEEDED_ORG_ID, CHANNEL_ID, 'AC06-RESEND'],
    );
    expect(rows).toHaveLength(1);
  });

  it('AC-06 concurrency: hai request cùng externalOrderId chạy song song vẫn ra đúng một đơn', async () => {
    const externalOrderId = 'AC06-PARALLEL';
    const [resA, resB] = await Promise.all([
      postOrder(orderKey, orderPayload(externalOrderId)),
      postOrder(orderKey, orderPayload(externalOrderId)),
    ]);

    // Đúng một trong hai request được 201 (tạo mới), request kia đọc lại và
    // trả 200 — nhưng cả hai PHẢI thành công (không request nào lỗi/áp treo).
    expect([resA.status, resB.status].sort()).toEqual([200, 201]);
    expect(resA.body.id).toBe(resB.body.id);

    const ds = app.get(DataSource);
    const rows = await ds.query(
      `SELECT id FROM sales_orders WHERE organization_id = $1 AND sales_channel_id = $2 AND external_order_id = $3`,
      [SEEDED_ORG_ID, CHANNEL_ID, externalOrderId],
    );
    expect(rows).toHaveLength(1);
  });

  it('AC-06: key thiếu quyền partner.order.create → 403, không tạo đơn', async () => {
    await postOrder(catalogOnlyKey, orderPayload('AC06-NO-PERMISSION')).expect(403);

    const ds = app.get(DataSource);
    const rows = await ds.query(
      `SELECT id FROM sales_orders WHERE organization_id = $1 AND external_order_id = $2`,
      [SEEDED_ORG_ID, 'AC06-NO-PERMISSION'],
    );
    expect(rows).toHaveLength(0);
  });

  it('AC-07: đơn pool (branch_id NULL) vô hình với TỪNG chi nhánh qua GET /mobile/sales-orders', async () => {
    await postOrder(orderKey, orderPayload('AC07-INVISIBLE')).expect(201);

    const inBranch1 = await request(app.getHttpServer())
      .get('/mobile/sales-orders')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .expect(200);
    expect(inBranch1.body.data).toEqual([]);

    const inBranch2 = await request(app.getHttpServer())
      .get('/mobile/sales-orders')
      .set('Authorization', authHeader(secondBranchAccessToken))
      .set('X-Branch-Id', SECOND_BRANCH_ID)
      .expect(200);
    expect(inBranch2.body.data).toEqual([]);
  });
});
