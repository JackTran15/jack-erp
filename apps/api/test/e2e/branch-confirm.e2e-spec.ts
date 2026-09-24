import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { CoaSeederService } from '../../src/modules/accounting/seeders/coa-seeder.service';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
  request,
} from './setup/test-app';

/**
 * Bằng chứng T-11-03 (ADR-12, A-41, A-42, A-46, A-47): duyệt giờ là việc CHI
 * NHÁNH làm SAU khi phân, qua `/mobile/sales-orders/:id/confirm` — không còn
 * là `/admin/sales-orders/:id/confirm` (route đó đã bị gỡ, T-11-01/02).
 *
 * verifies: AC-33, AC-34, AC-35, AC-46, AC-47, AC-48.
 *
 * Chạy với `OUTBOX_RELAY_DISABLED=1` — thiếu biến này relay khởi động trước
 * khi `outbox_messages` tồn tại và có thể làm cả suite FAIL dù mọi test xanh.
 */

const SEEDED_ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const SEEDED_USER_ID = 'c0000000-0000-4000-8000-000000000001';
const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';

const SECOND_BRANCH_ID = 'b0000000-0000-4000-8000-000000000010'; // CN-B

// Vai duyệt: CHỈ pos.sales-order.approve + pos.sales-order.read — gán cho
// một người dùng CN-A (đúng quyền, đúng chi nhánh) và một người dùng CN-B
// (đúng quyền, SAI chi nhánh — ca AC-35 chi nhánh khác).
const APPROVE_ROLE_ID = 'd0000000-0000-4000-8000-000000000095';
const BRANCH_B_USER_ID = 'c0000000-0000-4000-8000-000000000095';

// Vai KHÔNG có approve — ca AC-35 thiếu quyền, tại ĐÚNG chi nhánh CN-A.
const NO_APPROVE_ROLE_ID = 'd0000000-0000-4000-8000-000000000096';
const NO_APPROVE_USER_ID = 'c0000000-0000-4000-8000-000000000096';

const ITEM_ID = 'f3000000-0000-4000-8000-000000000099';
const ITEM_CODE = 'SKU-BC-01';
const CATEGORY_ID = 'f1000000-0000-4000-8000-000000000099';
const PRODUCT_ID = 'f2000000-0000-4000-8000-000000000099';

let app!: INestApplication;
let seed!: SeedResult; // CN-A actor, admin role: dispatch/return + approve (assigned to CN-A)
let branchBToken!: string; // approve perm, assigned ONLY to CN-B
let noApproveToken!: string; // no approve perm, assigned to CN-A
let locationId!: string;
let salespersonProfileId!: string; // employee_profiles của SEEDED_USER — đơn mobile cần một tư vấn viên có thật
let orderSeq = 0;

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

/** Chèn thẳng một đơn web SENT trong pool (`branch_id IS NULL`) — bỏ qua
 * đường intake, test này chỉ quan tâm hành vi dispatch/confirm/approve. */
async function createPoolOrder(ds: DataSource): Promise<string> {
  orderSeq += 1;
  const rows = await ds.query(
    `INSERT INTO sales_orders
       (id, organization_id, branch_id, document_number, status, sales_channel, salesperson_id, created_by, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, NULL, $2, 'SENT'::sales_order_status_enum, 'WEB', NULL, $3::uuid, NOW(), NOW())
     RETURNING id`,
    [SEEDED_ORG_ID, `BRANCH-CONFIRM-${orderSeq}`, SEEDED_USER_ID],
  );
  return rows[0].id;
}

/** Chèn thẳng một đơn của TƯ VẤN VIÊN (mobile), đã ở một chi nhánh sẵn —
 * đường mobile không đi qua điều phối (AC-48). */
async function createBranchMobileOrder(ds: DataSource, branchId: string): Promise<string> {
  orderSeq += 1;
  const rows = await ds.query(
    `INSERT INTO sales_orders
       (id, organization_id, branch_id, document_number, status, sales_channel, salesperson_id, created_by, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, 'SENT'::sales_order_status_enum, 'MOBILE', $5::uuid, $4::uuid, NOW(), NOW())
     RETURNING id`,
    [SEEDED_ORG_ID, branchId, `BRANCH-CONFIRM-MOBILE-${orderSeq}`, SEEDED_USER_ID, salespersonProfileId],
  );
  return rows[0].id;
}

async function addLine(ds: DataSource, orderId: string, quantity: number): Promise<void> {
  await ds.query(
    `INSERT INTO sales_order_lines
       (id, sales_order_id, line_no, item_id, item_code, item_name, unit, quantity, unit_price, line_total)
     VALUES (gen_random_uuid(), $1::uuid, 1, $2::uuid, $3, 'Hàng thử branch-confirm', 'cái', $4::numeric, 100000, $4::numeric * 100000)`,
    [orderId, ITEM_ID, ITEM_CODE, quantity],
  );
}

describe('Branch confirm — POST /mobile/sales-orders/:id/confirm (E2E, T-11-03)', () => {
  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    const ds = app.get(DataSource);

    const [profile] = await ds.query(
      `INSERT INTO employee_profiles (id, organization_id, user_id, code, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'NV-BC-001', $2::uuid, NOW(), NOW())
       RETURNING id`,
      [SEEDED_ORG_ID, SEEDED_USER_ID],
    );
    salespersonProfileId = profile.id;

    // `seedBaseData` inserts the org by raw SQL — no `organization.created`
    // event fires, so the chart of accounts (needed for `/cash/accounts`
    // below) never gets seeded unless called directly, same as
    // `buildCheckoutSagaFixture` does.
    await app.get(CoaSeederService).seedForOrganization(seed.organizationId, seed.userId);

    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Branch B', 'ACTIVE', false, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [SECOND_BRANCH_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );

    // seed.accessToken's admin role: dispatch + return + read-all, so it can
    // drive the org-wide side of every fixture (dispatch/return-to-pool) and
    // also act as the CN-A branch user (it's already assigned to seed.branchId).
    await ensurePermission(ds, 'pos.sales-order.dispatch', 'pos');
    await ensurePermission(ds, 'pos.sales-order.approve', 'pos');
    await ensurePermission(ds, 'pos.sales-order.read', 'pos');
    await ensurePermission(ds, 'pos.invoice.write', 'pos');
    await ensurePermission(ds, 'pos.session.manage', 'pos');
    await ensurePermission(ds, 'cash-account.write', 'cash');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.dispatch');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.approve');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.read');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.invoice.write');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.session.manage');

    // Branch B user — correct permission, wrong branch (AC-35 "CN khác").
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Thu ngân CN-B', 'Approve role, branch B only', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [APPROVE_ROLE_ID, SEEDED_ORG_ID],
    );
    await grantToRole(ds, APPROVE_ROLE_ID, 'pos.sales-order.approve');
    await grantToRole(ds, APPROVE_ROLE_ID, 'pos.sales-order.read');
    const passwordHash = await import('bcryptjs').then((b) => b.hash('password123', 10));
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'branch-b@test.com', $3, 'Branch', 'B', true, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [BRANCH_B_USER_ID, SEEDED_ORG_ID, passwordHash],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)
       ON CONFLICT DO NOTHING`,
      [BRANCH_B_USER_ID, APPROVE_ROLE_ID, SEEDED_ORG_ID],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
       ON CONFLICT DO NOTHING`,
      [BRANCH_B_USER_ID, SECOND_BRANCH_ID, SEEDED_ORG_ID],
    );

    // No-approve user — missing permission, RIGHT branch (AC-35 "thiếu quyền").
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Nhân viên CN-A không có quyền duyệt', 'No approve role', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [NO_APPROVE_ROLE_ID, SEEDED_ORG_ID],
    );
    await ensurePermission(ds, 'pos.sale.create', 'pos');
    await grantToRole(ds, NO_APPROVE_ROLE_ID, 'pos.sale.create');
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'no-approve@test.com', $3, 'No', 'Approve', true, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [NO_APPROVE_USER_ID, SEEDED_ORG_ID, passwordHash],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)
       ON CONFLICT DO NOTHING`,
      [NO_APPROVE_USER_ID, NO_APPROVE_ROLE_ID, SEEDED_ORG_ID],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
       ON CONFLICT DO NOTHING`,
      [NO_APPROVE_USER_ID, seed.branchId, SEEDED_ORG_ID],
    );

    await app.get(RbacService).invalidateUserPermissions(SEEDED_USER_ID, SEEDED_ORG_ID);
    await app.get(RbacService).invalidateUserPermissions(BRANCH_B_USER_ID, SEEDED_ORG_ID);
    await app.get(RbacService).invalidateUserPermissions(NO_APPROVE_USER_ID, SEEDED_ORG_ID);

    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'branch-b@test.com', password: 'password123', organizationId: SEEDED_ORG_ID })
      .expect(200);
    branchBToken = loginB.body.accessToken;

    const loginNoApprove = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'no-approve@test.com', password: 'password123', organizationId: SEEDED_ORG_ID })
      .expect(200);
    noApproveToken = loginNoApprove.body.accessToken;

    // Real item + storage/location at CN-A so `approve()` can create a draft
    // invoice (it validates `itemId` against the catalog and resolves a
    // showroom location — see online-order-fulfilment.e2e-spec.ts).
    await ds.query(
      `INSERT INTO inventory_item_categories
         (id, organization_id, created_by, name, code, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Danh mục branch-confirm', 'CAT-BC', 'ACTIVE'::inventory_item_category_status_enum, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [CATEGORY_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );
    await ds.query(
      `INSERT INTO products (id, organization_id, created_by, code, name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'PROD-BC', 'Sản phẩm branch-confirm', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [PRODUCT_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );
    await ds.query(
      `INSERT INTO items
         (id, organization_id, created_by, code, name, unit, is_active,
          selling_price, purchase_price, product_id, category_id, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'Hàng branch-confirm', 'cái', true, 100000, 60000, $5::uuid, $6::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ITEM_ID, SEEDED_ORG_ID, SEEDED_USER_ID, ITEM_CODE, PRODUCT_ID, CATEGORY_ID],
    );

    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({ name: 'Kho branch-confirm', branchId: seed.branchId })
      .expect(201);
    const locRes = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({
        code: 'BC-LOC',
        type: 'SHELF',
        name: 'Vị trí branch-confirm',
        storageId: storageRes.body.id,
        branchId: seed.branchId,
      })
      .expect(201);
    await ds.query(`UPDATE storages SET is_main_storage = true WHERE id = $1::uuid`, [storageRes.body.id]);
    await ds.query(`UPDATE locations SET is_default = true WHERE id = $1::uuid`, [locRes.body.id]);
    locationId = locRes.body.id;

    // Tồn phục vụ ca đối chiếu chi nhánh: CN-A = 2, CN-B = 3.
    await ds.query(
      `INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 2, $5, NOW(), NOW())`,
      [SEEDED_ORG_ID, seed.branchId, ITEM_ID, locationId, SEEDED_USER_ID],
    );

    // Quỹ + ca POS mở tại CN-A để `approve()` sau khi duyệt tạo được nháp.
    const cashGl = await ds.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = '1111' LIMIT 1`,
      [SEEDED_ORG_ID],
    );
    const cashAccountRes = await request(app.getHttpServer())
      .post('/cash/accounts')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({
        name: 'Quỹ branch-confirm',
        type: 'REGISTER',
        accountId: cashGl[0].id,
        balance: 0,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/pos/sessions/open')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({ branchId: seed.branchId, cashAccountId: cashAccountRes.body.id, openingCashAmount: 0 })
      .expect(201);
  }, 600_000);

  afterAll(async () => {
    await app?.close();
  });

  const dispatch = (orderId: string, branchId: string) =>
    request(app.getHttpServer())
      .post(`/admin/sales-orders/${orderId}/dispatch`)
      .set('Authorization', authHeader(seed.accessToken))
      .send({ branchId });

  const returnToPool = (orderId: string, reason: string) =>
    request(app.getHttpServer())
      .post(`/admin/sales-orders/${orderId}/return`)
      .set('Authorization', authHeader(seed.accessToken))
      .send({ reason });

  const confirm = (token: string, orderId: string, branchId: string) =>
    request(app.getHttpServer())
      .post(`/mobile/sales-orders/${orderId}/confirm`)
      .set('Authorization', authHeader(token))
      .set('X-Branch-Id', branchId);

  const approve = (token: string, orderId: string, branchId: string) =>
    request(app.getHttpServer())
      .post(`/mobile/sales-orders/${orderId}/approve`)
      .set('Authorization', authHeader(token))
      .set('X-Branch-Id', branchId);

  const stockCheck = (token: string, branchId: string, orderIds: string[]) =>
    request(app.getHttpServer())
      .post('/mobile/sales-orders/stock-check')
      .set('Authorization', authHeader(token))
      .set('X-Branch-Id', branchId)
      .send({ orderIds });

  const listMobile = (token: string, branchId: string, query: Record<string, string>) =>
    request(app.getHttpServer())
      .get('/mobile/sales-orders')
      .set('Authorization', authHeader(token))
      .set('X-Branch-Id', branchId)
      .query(query);

  it('AC-34: thu ngân xử lý (approve) đơn web CHƯA duyệt → 409 ORDER_NOT_CONFIRMED, không có hoá đơn nháp; duyệt rồi xử lý lại thì thành công', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);
    await addLine(ds, orderId, 1);
    await dispatch(orderId, seed.branchId).expect(200);

    const beforeConfirm = await approve(seed.accessToken, orderId, seed.branchId).expect(409);
    expect(beforeConfirm.body.details.code).toBe('ORDER_NOT_CONFIRMED');

    const [row] = await ds.query('SELECT status, invoice_id FROM sales_orders WHERE id = $1', [orderId]);
    expect(row.status).toBe('SENT');
    expect(row.invoice_id).toBeNull();

    const confirmRes = await confirm(seed.accessToken, orderId, seed.branchId).expect(200);
    expect(confirmRes.body.confirmedAt).not.toBeNull();

    const afterApprove = await approve(seed.accessToken, orderId, seed.branchId).expect(200);
    expect(afterApprove.body.status).toBe('PROCESSED');

    const [rowAfter] = await ds.query('SELECT status, invoice_id FROM sales_orders WHERE id = $1', [orderId]);
    expect(rowAfter.status).toBe('PROCESSED');
    expect(rowAfter.invoice_id).toBeTruthy();
  });

  it('AC-35: chi nhánh khác duyệt đơn của CN-A → 403 ORDER_NOT_HELD_BY_BRANCH, đơn không đổi', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);
    await addLine(ds, orderId, 1);
    await dispatch(orderId, seed.branchId).expect(200);

    const res = await confirm(branchBToken, orderId, SECOND_BRANCH_ID).expect(403);
    expect(res.body.details?.code).toBe('ORDER_NOT_HELD_BY_BRANCH');

    const [row] = await ds.query('SELECT confirmed_at, branch_id FROM sales_orders WHERE id = $1', [orderId]);
    expect(row.confirmed_at).toBeNull();
    expect(row.branch_id).toBe(seed.branchId);
  });

  it('AC-35: người dùng CN-A không có quyền duyệt → 403, đơn không đổi', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);
    await addLine(ds, orderId, 1);
    await dispatch(orderId, seed.branchId).expect(200);

    await confirm(noApproveToken, orderId, seed.branchId).expect(403);

    const [row] = await ds.query('SELECT confirmed_at FROM sales_orders WHERE id = $1', [orderId]);
    expect(row.confirmed_at).toBeNull();
  });

  it('AC-33: duyệt một đơn vừa được trả về pool → 409 ORDER_NOT_CONFIRMABLE, không đổi gì', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);
    await addLine(ds, orderId, 1);
    await dispatch(orderId, seed.branchId).expect(200);
    await returnToPool(orderId, 'trả lại để thử AC-33').expect(200);

    const res = await confirm(seed.accessToken, orderId, seed.branchId).expect(409);
    expect(res.body.details.code).toBe('ORDER_NOT_CONFIRMABLE');

    const [row] = await ds.query('SELECT branch_id, confirmed_at FROM sales_orders WHERE id = $1', [orderId]);
    expect(row.branch_id).toBeNull();
    expect(row.confirmed_at).toBeNull();
  });

  it('AC-46: Admin phân đơn CHƯA duyệt vẫn thành công — chỉ set branch_id, confirmed_at vẫn NULL', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);
    await addLine(ds, orderId, 1);

    const res = await dispatch(orderId, seed.branchId).expect(200);
    expect(res.body.status).toBe('SENT');
    expect(res.body.confirmedAt).toBeNull();

    const [row] = await ds.query('SELECT branch_id, confirmed_at, status FROM sales_orders WHERE id = $1', [orderId]);
    expect(row.branch_id).toBe(seed.branchId);
    expect(row.confirmed_at).toBeNull();
    expect(row.status).toBe('SENT');
  });

  it('AC-47: trả đơn đã duyệt về pool rồi phân lại cho CN-B → confirmed_at NULL ở CN-B, dòng CONFIRM cũ vẫn còn', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);
    await addLine(ds, orderId, 1);
    await dispatch(orderId, seed.branchId).expect(200);
    await confirm(seed.accessToken, orderId, seed.branchId).expect(200);

    await returnToPool(orderId, 'trả lại để phân sang CN-B').expect(200);
    await dispatch(orderId, SECOND_BRANCH_ID).expect(200);

    const [row] = await ds.query('SELECT branch_id, confirmed_at FROM sales_orders WHERE id = $1', [orderId]);
    expect(row.branch_id).toBe(SECOND_BRANCH_ID);
    expect(row.confirmed_at).toBeNull();

    const confirmEvents = await ds.query(
      `SELECT action FROM sales_order_dispatch_events WHERE sales_order_id = $1 AND action = 'CONFIRM'`,
      [orderId],
    );
    expect(confirmEvents).toHaveLength(1);
  });

  it('AC-48: đơn tư vấn viên (mobile) xử lý được không cần duyệt; duyệt nó thì 409 ORDER_NOT_CONFIRMABLE', async () => {
    const ds = app.get(DataSource);
    const orderId = await createBranchMobileOrder(ds, seed.branchId);
    await addLine(ds, orderId, 1);

    const confirmRes = await confirm(seed.accessToken, orderId, seed.branchId).expect(409);
    expect(confirmRes.body.details.code).toBe('ORDER_NOT_CONFIRMABLE');

    const approveRes = await approve(seed.accessToken, orderId, seed.branchId).expect(200);
    expect(approveRes.body.status).toBe('PROCESSED');
  });

  it('A-47: GET /mobile/sales-orders?awaitingCashier=true loại đơn web SENT chưa duyệt, giữ đơn đã duyệt và đơn mobile', async () => {
    const ds = app.get(DataSource);

    const unconfirmedWeb = await createPoolOrder(ds);
    await addLine(ds, unconfirmedWeb, 1);
    await dispatch(unconfirmedWeb, seed.branchId).expect(200);

    const confirmedWeb = await createPoolOrder(ds);
    await addLine(ds, confirmedWeb, 1);
    await dispatch(confirmedWeb, seed.branchId).expect(200);
    await confirm(seed.accessToken, confirmedWeb, seed.branchId).expect(200);

    const mobileOrder = await createBranchMobileOrder(ds, seed.branchId);
    await addLine(ds, mobileOrder, 1);

    const res = await listMobile(seed.accessToken, seed.branchId, { awaitingCashier: 'true', limit: '100' }).expect(200);
    const ids = (res.body.data as Array<{ id: string }>).map((row) => row.id);

    expect(ids).not.toContain(unconfirmedWeb);
    expect(ids).toContain(confirmedWeb);
    expect(ids).toContain(mobileOrder);
  });

  it('Đối chiếu tồn chi nhánh: chỉ tính tồn TẠI CN-A và bỏ qua đơn chi nhánh khác', async () => {
    const ds = app.get(DataSource);

    const ownOrder = await createPoolOrder(ds);
    await addLine(ds, ownOrder, 4); // CN-A chỉ có 2 → thiếu 2
    await dispatch(ownOrder, seed.branchId).expect(200);

    const otherBranchOrder = await createPoolOrder(ds);
    await addLine(ds, otherBranchOrder, 1);
    await dispatch(otherBranchOrder, SECOND_BRANCH_ID).expect(200);

    const res = await stockCheck(seed.accessToken, seed.branchId, [ownOrder, otherBranchOrder]).expect(200);
    const orderIds = (res.body.orders as Array<{ orderId: string }>).map((o) => o.orderId);
    expect(orderIds).toContain(ownOrder);
    expect(orderIds).not.toContain(otherBranchOrder);

    const own = res.body.orders.find((o: { orderId: string }) => o.orderId === ownOrder);
    expect(own.branchId).toBe(seed.branchId);
    expect(own.sufficient).toBe(false);
    expect(own.lines[0].available).toBe(2);
    expect(own.lines[0].shortBy).toBe(2);
  });
});
