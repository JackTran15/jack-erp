import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
  request,
} from './setup/test-app';

/**
 * Bằng chứng điều phối Admin (T-02-05): AC-11 (phân đơn thành công kể cả khi
 * chi nhánh không mở ca POS — cái phân biệt điều phối với duyệt), AC-12
 * (phân trùng đơn đã có chủ → 409 `ORDER_ALREADY_DISPATCHED`, chỉ một dòng vết),
 * AC-13 (tài khoản thiếu quyền `pos.sales-order.dispatch` → 403).
 *
 * Chạy với `OUTBOX_RELAY_DISABLED=1` — thiếu biến này relay khởi động trước
 * khi `outbox_messages` tồn tại và có thể làm cả suite FAIL dù mọi test xanh.
 *
 * `CHK_sales_order_dispatch_events_shape` (migration 1790100200000) sống ở
 * migration, không phải `@Check` trên entity — `resetDatabase()` dựng schema
 * qua `synchronize(true)` (chỉ đọc decorator), nên constraint đó KHÔNG có mặt
 * ở DB e2e này. Ba AC của ticket này (AC-11/12/13) không đòi hỏi DB từ chối
 * một shape sai, nên suite này không tự tạo lại CHECK đó (khác
 * `partner-order.e2e-spec.ts`/`geo.e2e-spec.ts`, vốn tái tạo đúng ràng buộc mà
 * assertion của chúng cần).
 */

const SEEDED_USER_ID = 'c0000000-0000-4000-8000-000000000001';
const SEEDED_ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001'; // seedBaseData's "admin" role — used as the dispatcher

// Vai không có quyền điều phối — nắm nhiều quyền pos.* khác (mô phỏng "Quản lý
// chi nhánh" trong ticket: withholding pos.sales-order.dispatch là ca 403 cố ý).
const BRANCH_MANAGER_ROLE_ID = 'd0000000-0000-4000-8000-000000000093';
const BRANCH_MANAGER_USER_ID = 'c0000000-0000-4000-8000-000000000093';

const SECOND_BRANCH_ID = 'b0000000-0000-4000-8000-000000000002';

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
let branchManagerToken!: string;
let orderSeq = 0;

/** Chèn thẳng một đơn SENT trong pool (`branch_id IS NULL`) — bỏ qua đường
 * intake vì test này chỉ quan tâm hành vi `dispatch`, không phải tạo đơn. */
async function createPoolOrder(ds: DataSource): Promise<string> {
  orderSeq += 1;
  const rows = await ds.query(
    `INSERT INTO sales_orders
       (id, organization_id, branch_id, document_number, status, sales_channel, created_by, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, NULL, $2, 'SENT'::sales_order_status_enum, 'WEB', $3::uuid, NOW(), NOW())
     RETURNING id`,
    [SEEDED_ORG_ID, `DISPATCH-TEST-${orderSeq}`, SEEDED_USER_ID],
  );
  return rows[0].id;
}

describe('Admin dispatch — POST /admin/sales-orders/:id/dispatch (E2E)', () => {
  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    const ds = app.get(DataSource);

    // Second branch — the dispatch target.
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Second Branch', 'ACTIVE', false, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [SECOND_BRANCH_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );

    // Dispatcher: grant pos.sales-order.dispatch to seedBaseData's admin role.
    await ensurePermission(ds, 'pos.sales-order.dispatch', 'pos');
    await ensurePermission(ds, 'pos.sales-order.read-all', 'pos');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.dispatch');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.read-all');

    // Branch Manager: separate user/role holding several pos.* permissions but
    // deliberately NOT pos.sales-order.dispatch — the negative case AC-13 wants.
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Quản lý chi nhánh', 'Branch manager role, no dispatch', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [BRANCH_MANAGER_ROLE_ID, SEEDED_ORG_ID],
    );
    await ensurePermission(ds, 'pos.sales-order.read', 'pos');
    await ensurePermission(ds, 'pos.sale.create', 'pos');
    await grantToRole(ds, BRANCH_MANAGER_ROLE_ID, 'pos.sales-order.read');
    await grantToRole(ds, BRANCH_MANAGER_ROLE_ID, 'pos.sale.create');

    const passwordHash = await import('bcryptjs').then((b) => b.hash('password123', 10));
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'branch-manager@test.com', $3, 'Branch', 'Manager', true, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [BRANCH_MANAGER_USER_ID, SEEDED_ORG_ID, passwordHash],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)
       ON CONFLICT DO NOTHING`,
      [BRANCH_MANAGER_USER_ID, BRANCH_MANAGER_ROLE_ID, SEEDED_ORG_ID],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
       ON CONFLICT DO NOTHING`,
      [BRANCH_MANAGER_USER_ID, seed.branchId, SEEDED_ORG_ID],
    );

    await app.get(RbacService).invalidateUserPermissions(SEEDED_USER_ID, SEEDED_ORG_ID);
    await app.get(RbacService).invalidateUserPermissions(BRANCH_MANAGER_USER_ID, SEEDED_ORG_ID);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'branch-manager@test.com', password: 'password123', organizationId: SEEDED_ORG_ID })
      .expect(200);
    branchManagerToken = login.body.accessToken;
  }, 600_000);

  afterAll(async () => {
    await app?.close();
  });

  const dispatchOrder = (token: string, orderId: string, branchId: string) =>
    request(app.getHttpServer())
      .post(`/admin/sales-orders/${orderId}/dispatch`)
      .set('Authorization', authHeader(token))
      .send({ branchId });

  it('AC-11: phân đơn pool cho chi nhánh không mở ca POS nào vẫn → 200, branch_id được set, trạng thái vẫn SENT', async () => {
    const ds = app.get(DataSource);

    // Không có ca POS nào được mở cho SECOND_BRANCH_ID trong suốt suite này —
    // đúng ADR-02: điều phối không phải duyệt, không đụng PosSessionService.
    const openSessions = await ds.query(
      `SELECT id FROM pos_sessions WHERE branch_id = $1 AND status = 'OPEN'`,
      [SECOND_BRANCH_ID],
    );
    expect(openSessions).toHaveLength(0);

    const orderId = await createPoolOrder(ds);
    const res = await dispatchOrder(seed.accessToken, orderId, SECOND_BRANCH_ID).expect(200);
    expect(res.body.id).toBe(orderId);
    expect(res.body.status).toBe('SENT');

    const [row] = await ds.query('SELECT branch_id, status FROM sales_orders WHERE id = $1', [orderId]);
    expect(row.branch_id).toBe(SECOND_BRANCH_ID);
    expect(row.status).toBe('SENT');

    const events = await ds.query(
      `SELECT action, to_branch_id, from_branch_id FROM sales_order_dispatch_events WHERE sales_order_id = $1`,
      [orderId],
    );
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('DISPATCH');
    expect(events[0].to_branch_id).toBe(SECOND_BRANCH_ID);
    expect(events[0].from_branch_id).toBeNull();
  });

  it('AC-12: phân đơn đã có chủ lần hai → 409 ORDER_ALREADY_DISPATCHED, không sinh thêm dòng vết', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);

    await dispatchOrder(seed.accessToken, orderId, SECOND_BRANCH_ID).expect(200);
    const second = await dispatchOrder(seed.accessToken, orderId, seed.branchId).expect(409);
    // `ConflictException({ code, message })`'s `code` isn't a top-level
    // `HttpException.code` — the global filter only promotes that field, so
    // `dispatch()`'s own `code` lands in `details` alongside the response body.
    expect(second.body.details.code).toBe('ORDER_ALREADY_DISPATCHED');

    const events = await ds.query(
      `SELECT action FROM sales_order_dispatch_events WHERE sales_order_id = $1`,
      [orderId],
    );
    expect(events).toHaveLength(1);

    const [row] = await ds.query('SELECT branch_id FROM sales_orders WHERE id = $1', [orderId]);
    expect(row.branch_id).toBe(SECOND_BRANCH_ID);
  });

  it('AC-12 concurrency: hai lượt dispatch song song cho hai chi nhánh khác nhau → một 200, một 409, đúng một dòng vết', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);

    const [resA, resB] = await Promise.all([
      dispatchOrder(seed.accessToken, orderId, SECOND_BRANCH_ID),
      dispatchOrder(seed.accessToken, orderId, seed.branchId),
    ]);
    expect([resA.status, resB.status].sort()).toEqual([200, 409]);

    const events = await ds.query(
      `SELECT action FROM sales_order_dispatch_events WHERE sales_order_id = $1`,
      [orderId],
    );
    expect(events).toHaveLength(1);
  });

  it('AC-13: tài khoản thiếu quyền pos.sales-order.dispatch → 403, đơn vẫn ở pool', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);

    await dispatchOrder(branchManagerToken, orderId, seed.branchId).expect(403);

    const [row] = await ds.query('SELECT branch_id FROM sales_orders WHERE id = $1', [orderId]);
    expect(row.branch_id).toBeNull();

    const events = await ds.query(
      `SELECT action FROM sales_order_dispatch_events WHERE sales_order_id = $1`,
      [orderId],
    );
    expect(events).toHaveLength(0);
  });
});
