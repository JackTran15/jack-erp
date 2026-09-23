import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { upsertGeoDataset, GeoDataset } from '../../src/modules/geo/geo-dataset.loader';
import { authHeader, request } from './setup/test-app';
import { buildCheckoutSagaFixture, CheckoutSagaFixture } from './setup/checkout-saga-fixture';

/**
 * Bằng chứng T-05-06: một đơn web đi trọn đường — partner tạo (pool) → Admin
 * phân chi nhánh → chi nhánh xử lý (approve) → thu ngân "hoàn tất" (checkout)
 * → đối chiếu tiền: `shipping_fee_amount`, `sales_channel`, `amount_due`,
 * công nợ COD, điểm tích luỹ.
 *
 * verifies: AC-16, AC-17, AC-19, AC-20.
 *
 * Chạy với `OUTBOX_RELAY_DISABLED=1` — thiếu biến này relay khởi động trước
 * khi `outbox_messages` tồn tại và có thể làm cả suite FAIL dù mọi test xanh.
 *
 * Constraint: KHÔNG có assertion nào trong suite này cần một ràng buộc DB chỉ
 * sống trong migration (partial unique index / CHECK) — dispatch/approve/
 * checkout đều tự chặn bằng application logic (transaction lock, service-level
 * ConflictException), nên suite này không tự tạo lại constraint nào, giống
 * `admin-dispatch.e2e-spec.ts`.
 */

const SEEDED_ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const SEEDED_USER_ID = 'c0000000-0000-4000-8000-000000000001';
const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';

const PARTNER_ORDER_ROLE_ID = 'd0000000-0000-4000-8000-000000000094';
const CHANNEL_ID = 'e8000000-0000-4000-8000-000000000002';

const SECOND_BRANCH_ID = 'b0000000-0000-4000-8000-000000000003';

const WHITELISTED_IP = '203.0.113.9';

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

let fixture!: CheckoutSagaFixture;
let app!: INestApplication;
let ds!: DataSource;
let orderKey!: string;
let provinceCode!: string;
let wardCode!: string;
let itemId!: string;
let cashAccountId!: string;
  let locationId!: string;

function orderPayload(externalOrderId: string) {
  return {
    externalOrderId,
    customer: { name: 'Trần Thị B', phone: '0909876543' },
    recipient: { name: 'Trần Thị B', phone: '0909876543' },
    shipping: {
      provinceCode,
      wardCode,
      addressLine: '45 Đường XYZ',
      fee: 30000,
    },
    lines: [{ itemCode: 'FUL-ITEM-1', quantity: 1 }],
  };
}

describe('Online order fulfilment — partner → dispatch → approve → checkout (E2E)', () => {
  beforeAll(async () => {
    fixture = await buildCheckoutSagaFixture();
    app = fixture.app;
    ds = fixture.ds;

    await ds.query('CREATE EXTENSION IF NOT EXISTS unaccent');
    await upsertGeoDataset(ds, readDataset());
    const dataset = readDataset();
    const province = dataset.provinces[0];
    const ward = dataset.wards.find((w) => w.provinceCode === province.code);
    if (!ward) throw new Error('Fixture geo dataset has no ward for the first province');
    provinceCode = province.code;
    wardCode = ward.code;

    // Second branch — the dispatch target, deliberately with no POS session
    // open yet (Done-when: "chưa mở ca chạy TRƯỚC ca mở ca trong cùng spec").
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Fulfilment Branch', 'ACTIVE', false, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [SECOND_BRANCH_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
       ON CONFLICT DO NOTHING`,
      [SEEDED_USER_ID, SECOND_BRANCH_ID, SEEDED_ORG_ID],
    );
    // `branchIds` is embedded in the JWT at login — relogin so the token
    // carries the just-added branch assignment.
    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'password123', organizationId: SEEDED_ORG_ID })
      .expect(200);
    fixture.seed.accessToken = relogin.body.accessToken;

    // Sales channel the API key will speak for.
    await ds.query(
      `INSERT INTO sales_channels (id, organization_id, created_by, code, name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'WEB', 'Website', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [CHANNEL_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );

    // One item priced so a single-line order totals exactly 1.000.000.
    const itemRes = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(fixture.headers())
      .send({
        code: 'FUL-ITEM-1',
        name: 'Fulfilment Item',
        unit: 'pcs',
        purchasePrice: 600000,
        sellingPrice: 1000000,
      })
      .expect(201);
    itemId = itemRes.body.id;

    // Role granting exactly partner.order.create, for the partner API key.
    await ensurePermission(ds, 'partner.order.create', 'partner-order');
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Đối tác đặt hàng', 'Partner order role', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [PARTNER_ORDER_ROLE_ID, SEEDED_ORG_ID],
    );
    await grantToRole(ds, PARTNER_ORDER_ROLE_ID, 'partner.order.create');

    // seedBaseData's admin role needs the dispatch + approve + checkout
    // permissions to walk the rest of the chain.
    await ensurePermission(ds, 'pos.sales-order.dispatch', 'pos');
    await ensurePermission(ds, 'pos.sales-order.approve', 'pos');
    await ensurePermission(ds, 'pos.sales-order.read', 'pos');
    await ensurePermission(ds, 'pos.invoice.write', 'pos');
    await ensurePermission(ds, 'pos.session.manage', 'pos');
    await ensurePermission(ds, 'api-key.create', 'api-key');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.dispatch');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.approve');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.read');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.invoice.write');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.session.manage');
    await grantToRole(ds, SEEDED_ROLE_ID, 'api-key.create');
    await app.get(RbacService).invalidateUserPermissions(SEEDED_USER_ID, SEEDED_ORG_ID);

    const orderKeyRes = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', fixture.seed.branchId)
      .send({
        name: 'Fulfilment partner key',
        roles: [PARTNER_ORDER_ROLE_ID],
        ipWhitelist: [WHITELISTED_IP],
        salesChannelId: CHANNEL_ID,
      })
      .expect(201);
    orderKey = orderKeyRes.body.rawKey;

    // A REGISTER cash account on the SECOND branch, so "mở ca" below can open
    // a real session there (the checkout-saga fixture's own cash fund lives on
    // `seed.branchId`, not this one).
    const cashGl = await ds.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = '1111' LIMIT 1`,
      [SEEDED_ORG_ID],
    );
    const cashAccountRes = await request(app.getHttpServer())
      .post('/cash/accounts')
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', SECOND_BRANCH_ID)
      .send({
        name: 'Quỹ chi nhánh phân đơn',
        type: 'REGISTER',
        accountId: cashGl[0].id,
        balance: 0,
      })
      .expect(201);
    cashAccountId = cashAccountRes.body.id;
    // `ActorContext.branchId` là `fromJwt ?? fromHeader` — JWT THẮNG header, nên
    // quỹ vừa tạo rơi vào chi nhánh của token (chi nhánh 1) bất kể `X-Branch-Id`.
    // Đổi chi nhánh trên token thì thu hồi phiên seed và mọi lời gọi sau 401, nên
    // ghim thẳng vào DB — đây là fixture, không phải đường nghiệp vụ.
    await ds.query(`UPDATE cash_accounts SET branch_id = $1::uuid WHERE id = $2::uuid`, [
      SECOND_BRANCH_ID,
      cashAccountId,
    ]);
    // eslint-disable-next-line no-console
    

    // Stock for the fulfilment item at the SECOND branch too — `approve()`
    // itself never checks stock (it only creates a DRAFT invoice), but
    // `/checkout` further down does deduct it.
    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', SECOND_BRANCH_ID)
      .send({ name: 'Fulfilment WH', branchId: SECOND_BRANCH_ID })
      .expect(201);
    const locRes = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', SECOND_BRANCH_ID)
      .send({
        code: 'FUL-LOC',
        type: 'SHELF',
        name: 'Fulfilment Loc',
        storageId: storageRes.body.id,
        branchId: SECOND_BRANCH_ID,
      })
      .expect(201);
    // Kho CHÍNH + vị trí MẶC ĐỊNH: `resolveBranchItemLocations(..., showroomOnly)`
    // chỉ nhìn kho is_main_storage và rơi về vị trí is_default của nó. Cả
    // `createDraftIn` (gán location cho dòng nháp lúc approve) lẫn consumer hoàn
    // tồn lúc huỷ đều đi qua đó — thiếu hai cờ này là dòng nháp không có vị trí và
    // hoàn tồn bị bỏ qua ("no showroom location resolved") dù consumer đã nhận sự kiện.
    // `POST /inventory/storages` từ chối isMainStorage ngoài chi nhánh chính, nhưng
    // mọi chi nhánh seed/provision đều có một "Kho chính" is_main_storage — đặt cờ
    // bằng SQL như provisioning làm.
    await ds.query(`UPDATE storages SET is_main_storage = true WHERE id = $1::uuid`, [storageRes.body.id]);
    await ds.query(`UPDATE locations SET is_default = true WHERE id = $1::uuid`, [locRes.body.id]);
    await ds.query(
      `INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 100, $5, NOW(), NOW())`,
      [SEEDED_ORG_ID, SECOND_BRANCH_ID, itemId, locRes.body.id, SEEDED_USER_ID],
    );
    locationId = locRes.body.id;
  }, 600_000);

  afterAll(async () => {
    await app?.close();
  });

  const postOrder = (body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/v2/partner/orders')
      .set('X-Api-Key', orderKey)
      .set('X-Forwarded-For', WHITELISTED_IP)
      .send(body);

  const dispatch = (orderId: string, branchId: string) =>
    request(app.getHttpServer())
      .post(`/admin/sales-orders/${orderId}/dispatch`)
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .send({ branchId });

  const approve = (orderId: string) =>
    request(app.getHttpServer())
      .post(`/mobile/sales-orders/${orderId}/approve`)
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', SECOND_BRANCH_ID);

  const checkout = (invoiceId: string) =>
    request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/checkout`)
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', SECOND_BRANCH_ID)
      .send({ payments: [] }); // COD: no payment lines → full remainder → debt

  it('AC-19: xử lý (approve) đơn khi chi nhánh CHƯA mở ca → 409 NO_OPEN_SESSION, đơn KHÔNG đổi trạng thái', async () => {
    const created = await postOrder(orderPayload('FUL-NO-SESSION')).expect(201);
    const orderId = created.body.id;

    // Confirm no session is open for SECOND_BRANCH_ID yet — this test MUST run
    // before any "mở ca" happens on this branch in this spec (Done-when).
    const openSessions = await ds.query(
      `SELECT id FROM pos_sessions WHERE branch_id = $1 AND status IN ('OPEN', 'ACTIVE_SALES')`,
      [SECOND_BRANCH_ID],
    );
    expect(openSessions).toHaveLength(0);

    await dispatch(orderId, SECOND_BRANCH_ID).expect(200);

    const res = await approve(orderId).expect(409);
    expect(res.body.details.code).toBe('NO_OPEN_SESSION');

    const [row] = await ds.query(
      `SELECT status, branch_id, invoice_id FROM sales_orders WHERE id = $1`,
      [orderId],
    );
    expect(row.status).toBe('SENT');
    expect(row.branch_id).toBe(SECOND_BRANCH_ID);
    expect(row.invoice_id).toBeNull();
  });

  it('AC-16/AC-17/AC-20: đơn web đi trọn đường tới công nợ COD với đúng số tiền', async () => {
    // Mở ca cho chi nhánh — TỪ ĐÂY về sau đơn mới trong spec này mới xử lý được.
    const sessionRes = await request(app.getHttpServer())
      .post('/pos/sessions/open')
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', SECOND_BRANCH_ID)
      // `branchId` LÀ trường bắt buộc của `OpenSessionDto` (session.dto.ts:15) —
      // bỏ nó đi là 400. Quỹ tiền phải thuộc ĐÚNG chi nhánh này, xem ghi chú ở
      // beforeAll về `fromJwt ?? fromHeader`.
      .send({ branchId: SECOND_BRANCH_ID, cashAccountId, openingCashAmount: 0 })
      .expect(201);
    expect(sessionRes.body.status).toBe('OPEN');

    const created = await postOrder(orderPayload('FUL-HAPPY-PATH')).expect(201);
    const orderId = created.body.id;

    // Pool: branch_id NULL, status SENT.
    const [pooled] = await ds.query('SELECT branch_id, status, salesperson_id FROM sales_orders WHERE id = $1', [
      orderId,
    ]);
    expect(pooled.branch_id).toBeNull();
    expect(pooled.status).toBe('SENT');
    expect(pooled.salesperson_id).toBeNull();

    // Admin phân đơn cho chi nhánh — vẫn SENT.
    const dispatchRes = await dispatch(orderId, SECOND_BRANCH_ID).expect(200);
    expect(dispatchRes.body.status).toBe('SENT');

    const events = await ds.query(
      `SELECT to_branch_id FROM sales_order_dispatch_events WHERE sales_order_id = $1`,
      [orderId],
    );
    expect(events).toHaveLength(1);
    expect(events[0].to_branch_id).toBe(SECOND_BRANCH_ID);

    // Chi nhánh xử lý — tạo hoá đơn nháp, chép sales_channel + shipping_fee sang.
    const approveRes = await approve(orderId).expect(200);
    expect(approveRes.body.status).toBe('PROCESSED');

    const [afterApprove] = await ds.query(
      `SELECT invoice_id FROM sales_orders WHERE id = $1`,
      [orderId],
    );
    const invoiceId = afterApprove.invoice_id;
    expect(invoiceId).toBeTruthy();

    const [draftInvoice] = await ds.query(
      `SELECT status, shipping_fee_amount, sales_channel, sales_order_id, customer_id
       FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    expect(draftInvoice.status).toBe('draft'); // invoice_status_enum là CHỮ THƯỜNG
    expect(Number(draftInvoice.shipping_fee_amount)).toBe(30000);
    expect(draftInvoice.sales_channel).toBe('Website');
    expect(draftInvoice.sales_order_id).toBe(orderId);
    expect(draftInvoice.customer_id).toBeTruthy();

    // Hoàn tất (checkout) COD — không thanh toán gì, toàn bộ amount_due thành công nợ.
    // approve() → createDraftIn tự resolve vị trí từ kho chính của chi nhánh (kho
    // fixture ở beforeAll) — assert thay vì gán tay.
    const [draftLine] = await ds.query(
      `SELECT location_id FROM invoice_items WHERE invoice_id = $1::uuid`,
      [invoiceId],
    );
    expect(draftLine.location_id).toBe(locationId);

    const checkoutRaw = await checkout(invoiceId);
    if (checkoutRaw.status !== 201) {
      throw new Error(
        `checkout ${checkoutRaw.status}: ${JSON.stringify(checkoutRaw.body)}`,
      );
    }
    const checkoutRes = checkoutRaw;
    expect(checkoutRes.body.status).toBe('debt'); // COD: không trả đồng nào → toàn bộ amount_due thành công nợ

    const [completedInvoice] = await ds.query(
      `SELECT amount_due, shipping_fee_amount, sales_channel, points_earned, customer_id
       FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    // subtotal 1.000.000 + shipping fee 30.000 = amount_due 1.030.000.
    expect(Number(completedInvoice.amount_due)).toBe(1030000);
    expect(Number(completedInvoice.shipping_fee_amount)).toBe(30000);
    expect(completedInvoice.sales_channel).toBe('Website');
    // Điểm tích luỹ chỉ trên phần HÀNG (A-24): floor(1.000.000 / rate), không
    // phải floor(1.030.000 / rate).
    const { POINT_EARN_VND_PER_POINT } = await import(
      '../../src/modules/customer/loyalty.constants'
    );
    const expectedPoints = Math.floor(1000000 / POINT_EARN_VND_PER_POINT);
    expect(completedInvoice.points_earned).toBe(expectedPoints);

    const [debt] = await ds.query(
      `SELECT original_amount, remaining_amount, customer_id FROM invoice_debts WHERE invoice_id = $1`,
      [invoiceId],
    );
    // Công nợ COD = amount_due đã gồm phí ship — không phải 1.000.000 (thiếu
    // phí) và không phải 1.060.000 (cộng phí hai lần).
    expect(Number(debt.original_amount)).toBe(1030000);
    expect(Number(debt.remaining_amount)).toBe(1030000);
    expect(debt.customer_id).toBe(completedInvoice.customer_id);
  });

  it('AC-16 phủ định: đơn pool KHÔNG hiện trên GET /mobile/sales-orders của chi nhánh khác (X-Branch-Id khác)', async () => {
    const created = await postOrder(orderPayload('FUL-INVISIBLE-ELSEWHERE')).expect(201);
    const orderId = created.body.id;

    const otherBranchList = await request(app.getHttpServer())
      .get('/mobile/sales-orders')
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', fixture.seed.branchId)
      .expect(200);
    const ids = (otherBranchList.body.data as Array<{ id: string }>).map((row) => row.id);
    expect(ids).not.toContain(orderId);
  });
});
