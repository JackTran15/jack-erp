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
 * Bằng chứng T-13-03 (§10, ADR-14, A-51, A-53, A-54): lịch sử một đơn ghép LÚC
 * ĐỌC từ `sales_order_dispatch_events` + cột của đơn — không phải một bảng ghi
 * riêng. Suite này lái đơn qua đủ vòng đời thật (dispatch/confirm/return/
 * approve/cancel) rồi đọc `GET …/history` qua cả hai đường Admin và mobile.
 *
 * verifies: AC-50, AC-51, AC-52, AC-53, AC-54.
 *
 * Chạy với `OUTBOX_RELAY_DISABLED=1` — xem ghi chú ở `branch-confirm.e2e-spec.ts`.
 */

const SEEDED_ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const SEEDED_USER_ID = 'c0000000-0000-4000-8000-000000000001';
const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';

const SECOND_BRANCH_ID = 'b0000000-0000-4000-8000-000000000010'; // CN-B

// Vai CN-B: approve + read (mobile) — gán CHỈ cho CN-B, dùng để confirm/approve
// tại CN-B và cho ca AC-52 "chi nhánh đang giữ thấy toàn bộ lịch sử".
const BRANCH_B_ROLE_ID = 'd0000000-0000-4000-8000-000000000097';
const BRANCH_B_USER_ID = 'c0000000-0000-4000-8000-000000000097';

// Vai KHÔNG có dispatch lẫn read-all — ca AC-53 thiếu quyền trên đường Admin.
const NO_HISTORY_ROLE_ID = 'd0000000-0000-4000-8000-000000000098';
const NO_HISTORY_USER_ID = 'c0000000-0000-4000-8000-000000000098';

const ITEM_ID = 'f3000000-0000-4000-8000-000000000098';
const ITEM_CODE = 'SKU-SOH-01';
const CATEGORY_ID = 'f1000000-0000-4000-8000-000000000098';
const PRODUCT_ID = 'f2000000-0000-4000-8000-000000000098';

let app!: INestApplication;
let seed!: SeedResult; // CN-A actor: dispatch/return/read-all/approve/cancel, assigned to CN-A
let branchBToken!: string; // approve + read, assigned ONLY to CN-B
let noHistoryToken!: string; // no dispatch, no read-all
let salespersonProfileId!: string;
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

/** Chèn thẳng một đơn web SENT trong pool (`branch_id IS NULL`), kênh WEB. */
async function createPoolOrder(ds: DataSource): Promise<string> {
  orderSeq += 1;
  const rows = await ds.query(
    `INSERT INTO sales_orders
       (id, organization_id, branch_id, document_number, status, sales_channel, salesperson_id, created_by, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, NULL, $2, 'SENT'::sales_order_status_enum, 'WEB', NULL, $3::uuid, NOW(), NOW())
     RETURNING id`,
    [SEEDED_ORG_ID, `SO-HIST-${orderSeq}`, SEEDED_USER_ID],
  );
  return rows[0].id;
}

/** Chèn thẳng một đơn tư vấn viên (mobile), đã ở một chi nhánh sẵn. */
async function createBranchMobileOrder(ds: DataSource, branchId: string): Promise<string> {
  orderSeq += 1;
  const rows = await ds.query(
    `INSERT INTO sales_orders
       (id, organization_id, branch_id, document_number, status, sales_channel, salesperson_id, created_by, created_at, updated_at)
     VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3, 'SENT'::sales_order_status_enum, 'MOBILE', $5::uuid, $4::uuid, NOW(), NOW())
     RETURNING id`,
    [SEEDED_ORG_ID, branchId, `SO-HIST-MOBILE-${orderSeq}`, SEEDED_USER_ID, salespersonProfileId],
  );
  return rows[0].id;
}

async function addLine(ds: DataSource, orderId: string, quantity: number): Promise<void> {
  await ds.query(
    `INSERT INTO sales_order_lines
       (id, sales_order_id, line_no, item_id, item_code, item_name, unit, quantity, unit_price, line_total)
     VALUES (gen_random_uuid(), $1::uuid, 1, $2::uuid, $3, 'Hàng thử sales-order-history', 'cái', $4::numeric, 100000, $4::numeric * 100000)`,
    [orderId, ITEM_ID, ITEM_CODE, quantity],
  );
}

describe('Sales order history — GET …/sales-orders/:id/history (E2E, T-13-03)', () => {
  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    const ds = app.get(DataSource);

    const [profile] = await ds.query(
      `INSERT INTO employee_profiles (id, organization_id, user_id, code, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'NV-SOH-001', $2::uuid, NOW(), NOW())
       RETURNING id`,
      [SEEDED_ORG_ID, SEEDED_USER_ID],
    );
    salespersonProfileId = profile.id;

    // `seedBaseData` chèn tổ chức bằng SQL thô — không bắn `organization.created`,
    // nên COA cần cho `/cash/accounts` phải seed thẳng, giống branch-confirm.
    await app.get(CoaSeederService).seedForOrganization(seed.organizationId, seed.userId);

    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Branch B', 'ACTIVE', false, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [SECOND_BRANCH_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );

    // Đăng ký thêm CN-B cho SEEDED_USER: cần assignment (không cần JWT branchId
    // ở đây — chỉ dùng để `/inventory/storages` + `/inventory/locations` +
    // `/cash/accounts` + `/pos/sessions/open` tạo được ở CN-B, mọi lời gọi này
    // gửi `X-Branch-Id` nhưng đọc quyền qua `PermissionGuard`, không đòi JWT
    // branchId khớp) — `BranchScopeGuard` không áp cho các route này.
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
       ON CONFLICT DO NOTHING`,
      [SEEDED_USER_ID, SECOND_BRANCH_ID, SEEDED_ORG_ID],
    );

    // seed.accessToken (admin role, CN-A): dispatch + return + confirm/approve +
    // cancel + read-all — lái mọi mốc trừ những mốc phải xảy ra tại CN-B.
    await ensurePermission(ds, 'pos.sales-order.dispatch', 'pos');
    await ensurePermission(ds, 'pos.sales-order.approve', 'pos');
    await ensurePermission(ds, 'pos.sales-order.read', 'pos');
    await ensurePermission(ds, 'pos.sales-order.read-all', 'pos');
    await ensurePermission(ds, 'pos.sales-order.cancel', 'pos');
    await ensurePermission(ds, 'pos.invoice.write', 'pos');
    await ensurePermission(ds, 'pos.session.manage', 'pos');
    await ensurePermission(ds, 'cash-account.write', 'cash');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.dispatch');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.approve');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.read');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.read-all');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.cancel');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.invoice.write');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.session.manage');

    const passwordHash = await import('bcryptjs').then((b) => b.hash('password123', 10));

    // Branch B user — approve + read (mobile), CHỈ gán CN-B.
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Thu ngân CN-B (history)', 'Approve role, branch B only', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [BRANCH_B_ROLE_ID, SEEDED_ORG_ID],
    );
    await grantToRole(ds, BRANCH_B_ROLE_ID, 'pos.sales-order.approve');
    await grantToRole(ds, BRANCH_B_ROLE_ID, 'pos.sales-order.read');
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'branch-b-history@test.com', $3, 'Branch', 'B', true, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [BRANCH_B_USER_ID, SEEDED_ORG_ID, passwordHash],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)
       ON CONFLICT DO NOTHING`,
      [BRANCH_B_USER_ID, BRANCH_B_ROLE_ID, SEEDED_ORG_ID],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
       ON CONFLICT DO NOTHING`,
      [BRANCH_B_USER_ID, SECOND_BRANCH_ID, SEEDED_ORG_ID],
    );

    // No-history user — không có dispatch lẫn read-all (chỉ `pos.sale.create`).
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Nhân viên không có quyền xem lịch sử', 'No history role', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [NO_HISTORY_ROLE_ID, SEEDED_ORG_ID],
    );
    await ensurePermission(ds, 'pos.sale.create', 'pos');
    await grantToRole(ds, NO_HISTORY_ROLE_ID, 'pos.sale.create');
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'no-history@test.com', $3, 'No', 'History', true, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [NO_HISTORY_USER_ID, SEEDED_ORG_ID, passwordHash],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)
       ON CONFLICT DO NOTHING`,
      [NO_HISTORY_USER_ID, NO_HISTORY_ROLE_ID, SEEDED_ORG_ID],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
       ON CONFLICT DO NOTHING`,
      [NO_HISTORY_USER_ID, seed.branchId, SEEDED_ORG_ID],
    );

    await app.get(RbacService).invalidateUserPermissions(SEEDED_USER_ID, SEEDED_ORG_ID);
    await app.get(RbacService).invalidateUserPermissions(BRANCH_B_USER_ID, SEEDED_ORG_ID);
    await app.get(RbacService).invalidateUserPermissions(NO_HISTORY_USER_ID, SEEDED_ORG_ID);

    const loginB = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'branch-b-history@test.com', password: 'password123', organizationId: SEEDED_ORG_ID })
      .expect(200);
    branchBToken = loginB.body.accessToken;

    const loginNoHistory = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'no-history@test.com', password: 'password123', organizationId: SEEDED_ORG_ID })
      .expect(200);
    noHistoryToken = loginNoHistory.body.accessToken;

    // `branchIds` nằm trong JWT — relogin để token mang CN-B vừa gán
    // (BranchScopeGuard kiểm `user.branchIds` từ JWT).
    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'password123', organizationId: SEEDED_ORG_ID })
      .expect(200);
    seed.accessToken = relogin.body.accessToken;

    // `ActorContext.branchId` là `fromJwt ?? fromHeader` (JWT THẮNG) — token vừa
    // relogin ở trên vẫn mang chi nhánh ĐẦU TIÊN (CN-A) làm JWT `branchId`, nên
    // `X-Branch-Id: SECOND_BRANCH_ID` một mình bị bỏ qua bởi bất cứ gì đọc
    // `actor.branchId` (kho/vị trí/quỹ/ca CN-B bên dưới). `/auth/switch-branch`
    // đúc một token có JWT `branchId` THẬT SỰ là CN-B — nhưng nó cũng THU HỒI
    // phiên đứng sau token truyền vào, nên phải chạy trên một lượt đăng nhập
    // RIÊNG, không phải `seed.accessToken` (vẫn cần dùng cho phần còn lại).
    const secondLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'password123', organizationId: SEEDED_ORG_ID })
      .expect(200);
    const switchBranch = await request(app.getHttpServer())
      .post('/auth/switch-branch')
      .set('Authorization', authHeader(secondLogin.body.accessToken))
      .send({ branchId: SECOND_BRANCH_ID })
      .expect(200);
    const branchBAdminToken: string = switchBranch.body.accessToken;

    // Hàng + kho/vị trí thật để `approve()` tạo được hoá đơn nháp (giống
    // branch-confirm.e2e-spec.ts) — cần cho cả CN-A và CN-B (AC-50 phân lại).
    await ds.query(
      `INSERT INTO inventory_item_categories
         (id, organization_id, created_by, name, code, status, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Danh mục sales-order-history', 'CAT-SOH', 'ACTIVE'::inventory_item_category_status_enum, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [CATEGORY_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );
    await ds.query(
      `INSERT INTO products (id, organization_id, created_by, code, name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'PROD-SOH', 'Sản phẩm sales-order-history', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [PRODUCT_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );
    await ds.query(
      `INSERT INTO items
         (id, organization_id, created_by, code, name, unit, is_active,
          selling_price, purchase_price, product_id, category_id, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'Hàng sales-order-history', 'cái', true, 100000, 60000, $5::uuid, $6::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [ITEM_ID, SEEDED_ORG_ID, SEEDED_USER_ID, ITEM_CODE, PRODUCT_ID, CATEGORY_ID],
    );

    for (const [branchId, branchToken] of [
      [seed.branchId, seed.accessToken],
      [SECOND_BRANCH_ID, branchBAdminToken],
    ] as const) {
      const storageRes = await request(app.getHttpServer())
        .post('/inventory/storages')
        .set('Authorization', authHeader(branchToken))
        .set('X-Branch-Id', branchId)
        .send({ name: `Kho sales-order-history ${branchId}`, branchId })
        .expect(201);
      const locRes = await request(app.getHttpServer())
        .post('/inventory/locations')
        .set('Authorization', authHeader(branchToken))
        .set('X-Branch-Id', branchId)
        .send({
          code: `SOH-LOC-${branchId.slice(-4)}`,
          type: 'SHELF',
          name: `Vị trí sales-order-history ${branchId}`,
          storageId: storageRes.body.id,
          branchId,
        })
        .expect(201);
      await ds.query(`UPDATE storages SET is_main_storage = true WHERE id = $1::uuid`, [storageRes.body.id]);
      await ds.query(`UPDATE locations SET is_default = true WHERE id = $1::uuid`, [locRes.body.id]);

      // Tồn ở cả hai chi nhánh — đủ cho đơn 1 sản phẩm ở mỗi ca.
      await ds.query(
        `INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 10, $5, NOW(), NOW())`,
        [SEEDED_ORG_ID, branchId, ITEM_ID, locRes.body.id, SEEDED_USER_ID],
      );

      // Quỹ + ca POS mở tại chi nhánh để `approve()` tạo được nháp.
      const cashGl = await ds.query(
        `SELECT id FROM accounts WHERE organization_id = $1 AND code = '1111' LIMIT 1`,
        [SEEDED_ORG_ID],
      );
      const cashAccountRes = await request(app.getHttpServer())
        .post('/cash/accounts')
        .set('Authorization', authHeader(branchToken))
        .set('X-Branch-Id', branchId)
        .send({
          name: `Quỹ sales-order-history ${branchId}`,
          type: 'REGISTER',
          accountId: cashGl[0].id,
          balance: 0,
        })
        .expect(201);
      await request(app.getHttpServer())
        .post('/pos/sessions/open')
        .set('Authorization', authHeader(branchToken))
        .set('X-Branch-Id', branchId)
        .send({ branchId, cashAccountId: cashAccountRes.body.id, openingCashAmount: 0 })
        .expect(201);
    }
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

  const cancel = (token: string, orderId: string, branchId: string, reason: string) =>
    request(app.getHttpServer())
      .post(`/mobile/sales-orders/${orderId}/cancel`)
      .set('Authorization', authHeader(token))
      .set('X-Branch-Id', branchId)
      .send({ reason });

  const adminHistory = (token: string, orderId: string) =>
    request(app.getHttpServer())
      .get(`/admin/sales-orders/${orderId}/history`)
      .set('Authorization', authHeader(token));

  const mobileHistory = (token: string, orderId: string, branchId: string) =>
    request(app.getHttpServer())
      .get(`/mobile/sales-orders/${orderId}/history`)
      .set('Authorization', authHeader(token))
      .set('X-Branch-Id', branchId);

  it('AC-50: vòng đủ 7 mốc — nhận, phân CN-A, CN-A duyệt, CN-A trả (lý do), phân CN-B, CN-B duyệt, thu ngân CN-B xử lý', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);
    await addLine(ds, orderId, 1);

    await dispatch(orderId, seed.branchId).expect(200);
    await confirm(seed.accessToken, orderId, seed.branchId).expect(200);
    await returnToPool(orderId, 'hết hàng').expect(200);
    await dispatch(orderId, SECOND_BRANCH_ID).expect(200);
    await confirm(branchBToken, orderId, SECOND_BRANCH_ID).expect(200);
    const approveRes = await approve(branchBToken, orderId, SECOND_BRANCH_ID).expect(200);
    expect(approveRes.body.status).toBe('PROCESSED');

    const res = await adminHistory(seed.accessToken, orderId).expect(200);
    const { entries } = res.body as {
      orderId: string;
      orderCode: string;
      currentStatus: string;
      entries: Array<Record<string, unknown>>;
    };

    expect(entries).toHaveLength(7);
    expect(entries.map((e) => e.kind)).toEqual([
      'RECEIVED',
      'DISPATCHED',
      'CONFIRMED',
      'RETURNED',
      'DISPATCHED',
      'CONFIRMED',
      'PROCESSED',
    ]);

    // Thứ tự thời gian không giảm (đã sort theo `at`, phụ theo lifecycle rank).
    const times = entries.map((e) => Date.parse(e.at as string));
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }

    const returned = entries[3];
    expect(returned.reason).toBe('hết hàng');
    expect(returned.branchName).toBeTruthy(); // chi nhánh TRẢ (CN-A)

    const secondDispatch = entries[4];
    expect(secondDispatch.branchName).toBeTruthy(); // CN-B

    const processed = entries[6];
    expect(processed.invoiceCode).toBeTruthy();
    expect(processed.statusAfter).toBe('Đã xử lý');
    expect(processed.branchName).toBeTruthy(); // CN-B đang giữ lúc xử lý

    const received = entries[0];
    expect(received.statusAfter).toBeTruthy();
  }, 60_000);

  it('AC-51: huỷ có lý do — mốc cuối là Huỷ đơn kèm người huỷ, thời gian và lý do', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);
    await addLine(ds, orderId, 1);

    await cancel(seed.accessToken, orderId, seed.branchId, 'khách đổi ý').expect(200);

    const res = await adminHistory(seed.accessToken, orderId).expect(200);
    const entries = res.body.entries as Array<Record<string, unknown>>;

    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.kind)).toEqual(['RECEIVED', 'CANCELLED']);
    const cancelled = entries[1];
    expect(cancelled.reason).toBe('khách đổi ý');
    expect(cancelled.actorName).toBeTruthy();
    expect(cancelled.at).toBeTruthy();
    expect(cancelled.statusAfter).toBe('Đã huỷ');
  });

  it('AC-51: đơn cũ không có dòng sự kiện nào (cột được UPDATE thẳng) vẫn có mốc Nhận đơn + Thu ngân xử lý', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);
    await addLine(ds, orderId, 1);

    // Mô phỏng một đơn xử lý TRƯỚC khi có tính năng lịch sử: không dispatch,
    // không confirm — chỉ set thẳng các cột trên đơn, không dòng sự kiện nào.
    await ds.query(
      `UPDATE sales_orders
       SET status = 'PROCESSED'::sales_order_status_enum,
           branch_id = $2::uuid,
           approved_at = NOW(),
           approved_by = $3::uuid
       WHERE id = $1::uuid`,
      [orderId, seed.branchId, SEEDED_USER_ID],
    );

    const events = await ds.query(
      `SELECT id FROM sales_order_dispatch_events WHERE sales_order_id = $1`,
      [orderId],
    );
    expect(events).toHaveLength(0);

    const res = await adminHistory(seed.accessToken, orderId).expect(200);
    const entries = res.body.entries as Array<Record<string, unknown>>;

    expect(entries.map((e) => e.kind)).toEqual(['RECEIVED', 'PROCESSED']);
    expect(entries[0].kind).toBe('RECEIVED');
    expect(entries[1].kind).toBe('PROCESSED');
    expect(entries[1].actorName).toBeTruthy();
  });

  it('AC-52: chi nhánh khác (không giữ đơn) → 403, không lộ mốc nào', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);
    await addLine(ds, orderId, 1);

    await dispatch(orderId, seed.branchId).expect(200);
    await confirm(seed.accessToken, orderId, seed.branchId).expect(200);
    await returnToPool(orderId, 'trả để phân sang CN-B').expect(200);
    await dispatch(orderId, SECOND_BRANCH_ID).expect(200);

    // seed.accessToken được gán CN-A — đơn giờ ở CN-B, không phải CN-A đang giữ.
    const res = await mobileHistory(seed.accessToken, orderId, seed.branchId).expect(403);
    expect(res.body.details?.code ?? res.body.message).toBeTruthy();
    expect(res.body.entries).toBeUndefined();
  });

  it('AC-52: chi nhánh đang giữ thấy toàn bộ lịch sử, kể cả mốc trả về của chi nhánh cũ kèm lý do', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);
    await addLine(ds, orderId, 1);

    await dispatch(orderId, seed.branchId).expect(200);
    await confirm(seed.accessToken, orderId, seed.branchId).expect(200);
    await returnToPool(orderId, 'trả để phân sang CN-B (AC-52)').expect(200);
    await dispatch(orderId, SECOND_BRANCH_ID).expect(200);

    const res = await mobileHistory(branchBToken, orderId, SECOND_BRANCH_ID).expect(200);
    const entries = res.body.entries as Array<Record<string, unknown>>;

    expect(entries.map((e) => e.kind)).toEqual(['RECEIVED', 'DISPATCHED', 'CONFIRMED', 'RETURNED', 'DISPATCHED']);
    const returned = entries.find((e) => e.kind === 'RETURNED')!;
    expect(returned.reason).toBe('trả để phân sang CN-B (AC-52)');
  });

  it('AC-53: người dùng không có dispatch lẫn read-all → 403 trên đường Admin', async () => {
    const ds = app.get(DataSource);
    const orderId = await createPoolOrder(ds);
    await addLine(ds, orderId, 1);

    const res = await adminHistory(noHistoryToken, orderId).expect(403);
    expect(res.body.entries).toBeUndefined();
  });

  it('AC-54: đơn tư vấn viên — mốc Nhận đơn (người = tư vấn viên) + Thu ngân xử lý, không có mốc điều phối', async () => {
    const ds = app.get(DataSource);
    const orderId = await createBranchMobileOrder(ds, seed.branchId);
    await addLine(ds, orderId, 1);

    const approveRes = await approve(seed.accessToken, orderId, seed.branchId).expect(200);
    expect(approveRes.body.status).toBe('PROCESSED');

    const res = await adminHistory(seed.accessToken, orderId).expect(200);
    const entries = res.body.entries as Array<Record<string, unknown>>;

    expect(entries.map((e) => e.kind)).toEqual(['RECEIVED', 'PROCESSED']);
    expect(entries.some((e) => ['DISPATCHED', 'CONFIRMED', 'RETURNED'].includes(e.kind as string))).toBe(false);

    const [profile] = await ds.query(
      `SELECT u.first_name, u.last_name FROM employee_profiles ep
       JOIN users u ON u.id = ep.user_id WHERE ep.id = $1`,
      [salespersonProfileId],
    );
    const expectedName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
    expect(entries[0].actorName).toBe(expectedName);

    const processed = entries[1];
    expect(processed.invoiceCode).toBeTruthy();
  }, 60_000);
});
