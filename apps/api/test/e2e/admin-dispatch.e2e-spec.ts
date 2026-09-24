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

  it('AC-11/AC-46: phân đơn pool cho chi nhánh không mở ca POS nào vẫn → 200, branch_id được set, trạng thái vẫn SENT, confirmed_at vẫn NULL', async () => {
    const ds = app.get(DataSource);

    // Không có ca POS nào được mở cho SECOND_BRANCH_ID trong suốt suite này —
    // đúng ADR-02: điều phối không phải duyệt, không đụng PosSessionService.
    const openSessions = await ds.query(
      `SELECT id FROM pos_sessions WHERE branch_id = $1 AND status = 'OPEN'`,
      [SECOND_BRANCH_ID],
    );
    expect(openSessions).toHaveLength(0);

    const orderId = await createPoolOrder(ds);
    // AC-46: phân đơn CHƯA duyệt — duyệt giờ là việc của chi nhánh, SAU khi
    // phân (T-11, ADR-12); Admin không còn đòi confirmed_at trước dispatch.
    const res = await dispatchOrder(seed.accessToken, orderId, SECOND_BRANCH_ID).expect(200);
    expect(res.body.id).toBe(orderId);
    expect(res.body.status).toBe('SENT');
    expect(res.body.confirmedAt).toBeNull();

    const [row] = await ds.query(
      'SELECT branch_id, status, confirmed_at FROM sales_orders WHERE id = $1',
      [orderId],
    );
    expect(row.branch_id).toBe(SECOND_BRANCH_ID);
    expect(row.status).toBe('SENT');
    expect(row.confirmed_at).toBeNull();

    const events = await ds.query(
      `SELECT action, to_branch_id, from_branch_id FROM sales_order_dispatch_events WHERE sales_order_id = $1 AND action = 'DISPATCH'`,
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
      `SELECT action FROM sales_order_dispatch_events WHERE sales_order_id = $1 AND action = 'DISPATCH'`,
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
      `SELECT action FROM sales_order_dispatch_events WHERE sales_order_id = $1 AND action = 'DISPATCH'`,
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

  it('AC-39: GET /admin/sales-orders?unassigned=true trả stockShort và chainStockAtIntake của từng dòng', async () => {
    const ds = app.get(DataSource);
    const shortId = await createPoolOrder(ds);
    const legacyId = await createPoolOrder(ds);

    // Snapshot như T-08-03 ghi lúc nhận đơn: đơn thiếu hàng, dòng chụp tồn = 2.
    await ds.query('UPDATE sales_orders SET stock_short = true WHERE id = $1', [shortId]);
    const insertLine = (orderId: string, chainStock: string | null) =>
      ds.query(
        `INSERT INTO sales_order_lines
           (id, sales_order_id, line_no, item_id, item_code, item_name, unit, quantity, unit_price, line_total, chain_stock_at_intake)
         VALUES (gen_random_uuid(), $1::uuid, 1, gen_random_uuid(), 'SKU-500', 'Hàng thử', 'cái', 3, 10000, 30000, $2)`,
        [orderId, chainStock],
      );
    await insertLine(shortId, '2');
    // Đơn cũ / không qua đường đối tác: cột để NULL, cờ mặc định false.
    await insertLine(legacyId, null);

    const res = await request(app.getHttpServer())
      .get('/admin/sales-orders')
      .query({ unassigned: 'true', limit: 100 })
      .set('Authorization', authHeader(seed.accessToken))
      .expect(200);

    const short = res.body.data.find((o: { id: string }) => o.id === shortId);
    const legacy = res.body.data.find((o: { id: string }) => o.id === legacyId);
    expect(short).toBeDefined();
    expect(legacy).toBeDefined();

    expect(short.stockShort).toBe(true);
    expect(short.lines).toHaveLength(1);
    // `numeric` ép về SỐ, không phải chuỗi "2".
    expect(short.lines[0].chainStockAtIntake).toBe(2);

    expect(legacy.stockShort).toBe(false);
    expect(legacy.lines[0].chainStockAtIntake).toBeNull();
  });

  /**
   * `POST /admin/sales-orders/stock-check` (ADR-09) — nền của dialog "Duyệt
   * đơn" (AC-30/AC-31): toàn chuỗi khi `branchId` vắng, tại chi nhánh khi có.
   * `stock_balances` đòi FK thật tới `items`/`locations` (không như
   * `sales_order_lines.item_id`, vốn không có FK) — gieo fixture đầy đủ như
   * `partner-order.e2e-spec.ts`.
   */
  describe('Đối chiếu tồn — POST /admin/sales-orders/stock-check (ADR-09)', () => {
    const STOCK_CHECK_CATEGORY_ID = 'f1000000-0000-4000-8000-000000000001';
    const STOCK_CHECK_PRODUCT_ID = 'f2000000-0000-4000-8000-000000000001';
    const STOCK_CHECK_ITEM_ID = 'f3000000-0000-4000-8000-000000000001';
    const STOCK_CHECK_ITEM_CODE = 'SKU-CHECK';
    const STOCK_CHECK_STORAGE_A_ID = 'f4000000-0000-4000-8000-00000000000a';
    const STOCK_CHECK_STORAGE_B_ID = 'f4000000-0000-4000-8000-00000000000b';
    const STOCK_CHECK_LOCATION_A_ID = 'f5000000-0000-4000-8000-00000000000a';
    const STOCK_CHECK_LOCATION_B_ID = 'f5000000-0000-4000-8000-00000000000b';

    let stockCheckOrderId!: string;

    beforeAll(async () => {
      const ds = app.get(DataSource);

      await ds.query(
        `INSERT INTO inventory_item_categories
           (id, organization_id, created_by, name, code, status, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'Danh mục stock-check', 'CAT-CHECK', 'ACTIVE'::inventory_item_category_status_enum, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [STOCK_CHECK_CATEGORY_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
      );
      await ds.query(
        `INSERT INTO products (id, organization_id, created_by, code, name, is_active, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'PROD-CHECK', 'Sản phẩm stock-check', true, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [STOCK_CHECK_PRODUCT_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
      );
      await ds.query(
        `INSERT INTO items
           (id, organization_id, created_by, code, name, unit, is_active,
            selling_price, purchase_price, product_id, category_id, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'Hàng stock-check', 'pcs', true, 100000, 60000, $5::uuid, $6::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [STOCK_CHECK_ITEM_ID, SEEDED_ORG_ID, SEEDED_USER_ID, STOCK_CHECK_ITEM_CODE, STOCK_CHECK_PRODUCT_ID, STOCK_CHECK_CATEGORY_ID],
      );

      for (const [storageId, locationId, branchId, code] of [
        [STOCK_CHECK_STORAGE_A_ID, STOCK_CHECK_LOCATION_A_ID, seed.branchId, 'CHK-A'],
        [STOCK_CHECK_STORAGE_B_ID, STOCK_CHECK_LOCATION_B_ID, SECOND_BRANCH_ID, 'CHK-B'],
      ]) {
        await ds.query(
          `INSERT INTO storages (id, organization_id, branch_id, name, created_by, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [storageId, SEEDED_ORG_ID, branchId, `Kho ${code}`, SEEDED_USER_ID],
        );
        await ds.query(
          `INSERT INTO locations (id, organization_id, branch_id, storage_id, code, name, type, created_by, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $5, 'SHELF', $6::uuid, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [locationId, SEEDED_ORG_ID, branchId, storageId, `${code}-01`, SEEDED_USER_ID],
        );
      }

      // CN-A: 2 tồn; CN-B: 3 tồn — toàn chuỗi = 5.
      await ds.query(
        `INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 2, $5, NOW(), NOW())`,
        [SEEDED_ORG_ID, seed.branchId, STOCK_CHECK_ITEM_ID, STOCK_CHECK_LOCATION_A_ID, SEEDED_USER_ID],
      );
      await ds.query(
        `INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 3, $5, NOW(), NOW())`,
        [SEEDED_ORG_ID, SECOND_BRANCH_ID, STOCK_CHECK_ITEM_ID, STOCK_CHECK_LOCATION_B_ID, SEEDED_USER_ID],
      );

      // Đơn cần 4 — đủ toàn chuỗi (5), thiếu 2 nếu chỉ soi CN-A (2).
      stockCheckOrderId = await createPoolOrder(ds);
      await ds.query(
        `INSERT INTO sales_order_lines
           (id, sales_order_id, line_no, item_id, item_code, item_name, unit, quantity, unit_price, line_total)
         VALUES (gen_random_uuid(), $1::uuid, 1, $2::uuid, $3, 'Hàng stock-check', 'pcs', 4, 100000, 400000)`,
        [stockCheckOrderId, STOCK_CHECK_ITEM_ID, STOCK_CHECK_ITEM_CODE],
      );
    });

    const stockCheck = (orders: Array<{ orderId: string; branchId?: string }>) =>
      request(app.getHttpServer())
        .post('/admin/sales-orders/stock-check')
        .set('Authorization', authHeader(seed.accessToken))
        .send({ orders });

    it('toàn chuỗi: shortBy = 0, sufficient = true (2 + 3 >= 4)', async () => {
      const res = await stockCheck([{ orderId: stockCheckOrderId }]).expect(200);
      const order = res.body.orders.find((o: { orderId: string }) => o.orderId === stockCheckOrderId);
      expect(order).toBeDefined();
      expect(order.branchId).toBeNull();
      expect(order.sufficient).toBe(true);
      expect(order.shortLineCount).toBe(0);
      expect(order.lines[0].available).toBe(5);
      expect(order.lines[0].shortBy).toBe(0);
    });

    it('theo chi nhánh: chỉ CN-A (2) → thiếu 2, sufficient = false', async () => {
      const res = await stockCheck([{ orderId: stockCheckOrderId, branchId: seed.branchId }]).expect(200);
      const order = res.body.orders.find((o: { orderId: string }) => o.orderId === stockCheckOrderId);
      expect(order).toBeDefined();
      expect(order.branchId).toBe(seed.branchId);
      expect(order.sufficient).toBe(false);
      expect(order.shortLineCount).toBe(1);
      expect(order.lines[0].available).toBe(2);
      expect(order.lines[0].shortBy).toBe(2);
    });
  });
});
