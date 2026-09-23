import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { upsertGeoDataset, GeoDataset } from '../../src/modules/geo/geo-dataset.loader';
import { authHeader, request } from './setup/test-app';
import { buildCheckoutSagaFixture, CheckoutSagaFixture } from './setup/checkout-saga-fixture';

/**
 * Bằng chứng T-07-03 / ADR-06: một đơn web đi trọn đường tới công nợ COD, rồi
 * bị HUỶ — và số liệu trước/sau phải khớp bằng số đọc được, không phải hằng số
 * viết tay. Ca thứ hai chứng minh điều ngược lại: một hoá đơn đã có phiếu đổi
 * trả tất toán thì KHÔNG được huỷ, và không có gì bị đảo.
 *
 * verifies: AC-24.
 *
 * Chạy với `OUTBOX_RELAY_DISABLED=1` — xem ghi chú ở
 * `online-order-fulfilment.e2e-spec.ts`.
 *
 * Constraint: giống `admin-dispatch.e2e-spec.ts` và
 * `online-order-fulfilment.e2e-spec.ts`, suite này KHÔNG cần dựng lại một ràng
 * buộc DB nào (CHECK / partial unique index) chỉ sống trong migration —
 * `synchronize(true)` của schema e2e không mang theo các ràng buộc đó, nhưng
 * mọi khẳng định ở đây là về SỐ HỌC đảo chiều (tồn kho, công nợ, điểm), được
 * chặn bởi application logic (`CancelInvoiceService`, `assertNoSettledReturns`)
 * chứ không phải bởi constraint tầng DB, nên không có gì để dựng lại ở đây.
 *
 * Cả hai chiều — trừ tồn khi bán (`deduct-stock.step.ts`) và đảo tồn khi huỷ
 * (`InvoiceCancelledPublisher` → `stock-return.consumer.ts`) — chạy QUA Kafka
 * thật trong e2e này (đo được: stock KHÔNG đổi ngay sau response 201 checkout).
 * Vì vậy mọi lần đọc tồn sau một thao tác bán/huỷ phải `waitFor` (poll), giống
 * `deposit-fund.e2e-spec.ts`, không được đọc ngay lập tức.
 *
 * Điểm tích luỹ: khách mới tạo từ đơn partner KHÔNG có `membership_cards` (không
 * ai tự tạo thẻ khi tạo khách), nên `getPointBalanceForUpdate` trả về null và
 * không có số dư điểm nào để so sánh trước/sau. Theo đúng gợi ý của ticket,
 * test so sánh `invoices.points_earned` với `invoices.points_reversed` (phải
 * bằng nhau sau khi huỷ) thay cho số dư thẻ — ghi rõ ở đây và trong báo cáo.
 *
 * MÔI TRƯỜNG (đọc trước khi chạy trên máy dev): `EventConsumerManager` join
 * consumer group Kafka bằng `KAFKA_CONSUMER_GROUP_PREFIX` (mặc định `erp-api`
 * — CÙNG group với bất kỳ `node dist/main` nào đang chạy trên máy, kể cả
 * `make dev-api`). Nếu có một app khác đang sống và chia cùng group, nó có
 * thể "cướp" đúng partition mang sự kiện của app e2e này và ghi kết quả vào
 * DB CỦA NÓ (không phải `erp_test`) — `stock_deduction` consumer sẽ treo tới
 * hết `waitFor` mà tồn không bao giờ đổi trong `erp_test`. Chạy suite này với
 * `KAFKA_CONSUMER_GROUP_PREFIX=<gì-đó-duy-nhất>` để cô lập group.
 *
 * Ngay cả vậy, `stock-return.consumer.ts` (đảo kho khi HUỶ hoá đơn) và
 * `loyalty-points-reverse.consumer.ts` HARD-CODE groupId của chúng
 * (`'erp-api.invoice.cancelled.stock-return'`, …) thay vì đọc
 * `KAFKA_CONSUMER_GROUP_PREFIX` như `stock-deduction.consumer.ts` làm — biến
 * môi trường trên KHÔNG cô lập được hai consumer này. Đây là một phát hiện
 * (finding), không phải lỗi test: production code không bị đổi ở đây theo
 * đúng luật của nhiệm vụ này — xem báo cáo cuối cùng.
 */

const SEEDED_ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const SEEDED_USER_ID = 'c0000000-0000-4000-8000-000000000001';
const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';

const PARTNER_ORDER_ROLE_ID = 'd0000000-0000-4000-8000-000000000095';
const CHANNEL_ID = 'e8000000-0000-4000-8000-000000000003';

const SECOND_BRANCH_ID = 'b0000000-0000-4000-8000-000000000004';

const WHITELISTED_IP = '203.0.113.10';

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

const waitFor = async <T>(
  fn: () => Promise<T | null | undefined>,
  timeoutMs = 30000,
): Promise<T> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await fn();
    if (r) return r;
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error('timeout waiting for eventual consistency');
};

let fixture!: CheckoutSagaFixture;
let app!: INestApplication;
let ds!: DataSource;
let provinceCode!: string;
let wardCode!: string;
let itemId!: string;
let cashAccountId!: string;
let locationId!: string;
let orderKey!: string;

function orderPayload(externalOrderId: string) {
  return {
    externalOrderId,
    customer: { name: 'Lê Thị C', phone: '0909111222' },
    recipient: { name: 'Lê Thị C', phone: '0909111222' },
    shipping: {
      provinceCode,
      wardCode,
      addressLine: '12 Đường ABC',
      fee: 30000,
    },
    lines: [{ itemCode: 'CNL-ITEM-1', quantity: 1 }],
  };
}

describe('Online order cancel — rollback bằng số (E2E)', () => {
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

    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Cancel Branch', 'ACTIVE', false, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [SECOND_BRANCH_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
       ON CONFLICT DO NOTHING`,
      [SEEDED_USER_ID, SECOND_BRANCH_ID, SEEDED_ORG_ID],
    );
    // `branchIds` nằm trong JWT — relogin để token mang chi nhánh vừa gán.
    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'password123', organizationId: SEEDED_ORG_ID })
      .expect(200);
    fixture.seed.accessToken = relogin.body.accessToken;

    await ds.query(
      `INSERT INTO sales_channels (id, organization_id, created_by, code, name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'WEB', 'Website', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [CHANNEL_ID, SEEDED_ORG_ID, SEEDED_USER_ID],
    );

    const itemRes = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(fixture.headers())
      .send({
        code: 'CNL-ITEM-1',
        name: 'Cancel Item',
        unit: 'pcs',
        purchasePrice: 600000,
        sellingPrice: 1000000,
      })
      .expect(201);
    itemId = itemRes.body.id;

    await ensurePermission(ds, 'partner.order.create', 'partner-order');
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Đối tác đặt hàng (cancel)', 'Partner order role', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [PARTNER_ORDER_ROLE_ID, SEEDED_ORG_ID],
    );
    await grantToRole(ds, PARTNER_ORDER_ROLE_ID, 'partner.order.create');

    await ensurePermission(ds, 'pos.sales-order.dispatch', 'pos');
    await ensurePermission(ds, 'pos.sales-order.approve', 'pos');
    await ensurePermission(ds, 'pos.sales-order.read', 'pos');
    await ensurePermission(ds, 'pos.sales-order.cancel', 'pos');
    await ensurePermission(ds, 'pos.invoice.write', 'pos');
    await ensurePermission(ds, 'pos.session.manage', 'pos');
    await ensurePermission(ds, 'api-key.create', 'api-key');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.dispatch');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.approve');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.read');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.sales-order.cancel');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.invoice.write');
    await grantToRole(ds, SEEDED_ROLE_ID, 'pos.session.manage');
    await grantToRole(ds, SEEDED_ROLE_ID, 'api-key.create');
    await app.get(RbacService).invalidateUserPermissions(SEEDED_USER_ID, SEEDED_ORG_ID);

    const orderKeyRes = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', fixture.seed.branchId)
      .send({
        name: 'Cancel partner key',
        roles: [PARTNER_ORDER_ROLE_ID],
        ipWhitelist: [WHITELISTED_IP],
        salesChannelId: CHANNEL_ID,
      })
      .expect(201);
    orderKey = orderKeyRes.body.rawKey;

    const cashGl = await ds.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = '1111' LIMIT 1`,
      [SEEDED_ORG_ID],
    );
    const cashAccountRes = await request(app.getHttpServer())
      .post('/cash/accounts')
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', SECOND_BRANCH_ID)
      .send({
        name: 'Quỹ chi nhánh huỷ đơn',
        type: 'REGISTER',
        accountId: cashGl[0].id,
        balance: 0,
      })
      .expect(201);
    cashAccountId = cashAccountRes.body.id;
    // `ActorContext.branchId` = `fromJwt ?? fromHeader` — ghim quỹ vào DB thay
    // vì đổi chi nhánh trên token (đổi token thu hồi phiên seed → 401 mọi nơi).
    await ds.query(`UPDATE cash_accounts SET branch_id = $1::uuid WHERE id = $2::uuid`, [
      SECOND_BRANCH_ID,
      cashAccountId,
    ]);

    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', SECOND_BRANCH_ID)
      .send({ name: 'Cancel WH', branchId: SECOND_BRANCH_ID })
      .expect(201);
    const locRes = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', SECOND_BRANCH_ID)
      .send({
        code: 'CNL-LOC',
        type: 'SHELF',
        name: 'Cancel Loc',
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
    locationId = locRes.body.id;
    await ds.query(
      `INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 100, $5, NOW(), NOW())`,
      [SEEDED_ORG_ID, SECOND_BRANCH_ID, itemId, locationId, SEEDED_USER_ID],
    );

    const sessionRes = await request(app.getHttpServer())
      .post('/pos/sessions/open')
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', SECOND_BRANCH_ID)
      .send({ branchId: SECOND_BRANCH_ID, cashAccountId, openingCashAmount: 0 })
      .expect(201);
    expect(sessionRes.body.status).toBe('OPEN');
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
      .send({ payments: [] });

  const cancelOrder = (orderId: string, reason: string) =>
    request(app.getHttpServer())
      .post(`/mobile/sales-orders/${orderId}/cancel`)
      .set('Authorization', authHeader(fixture.seed.accessToken))
      .set('X-Branch-Id', SECOND_BRANCH_ID)
      .send({ reason });

  const readStock = async (): Promise<number> => {
    const [row] = await ds.query(
      `SELECT quantity FROM stock_balances WHERE branch_id = $1 AND item_id = $2 AND location_id = $3`,
      [SECOND_BRANCH_ID, itemId, locationId],
    );
    return Number(row.quantity);
  };

  async function walkOrderToDebt(externalOrderId: string): Promise<{
    orderId: string;
    invoiceId: string;
  }> {
    const created = await postOrder(orderPayload(externalOrderId)).expect(201);
    const orderId = created.body.id;

    await dispatch(orderId, SECOND_BRANCH_ID).expect(200);
    const approveRes = await approve(orderId).expect(200);
    expect(approveRes.body.status).toBe('PROCESSED');

    const [afterApprove] = await ds.query(
      `SELECT invoice_id FROM sales_orders WHERE id = $1`,
      [orderId],
    );
    const invoiceId = afterApprove.invoice_id;
    expect(invoiceId).toBeTruthy();

    // approve() → createDraftIn tự resolve vị trí từ kho chính của chi nhánh (kho
    // fixture ở beforeAll). Assert thay vì gán tay: đây là điều kiện để checkout và
    // hoàn tồn chạy được, và là thứ từng bị chẩn đoán nhầm là "approve() không gán".
    const [draftLine] = await ds.query(
      `SELECT location_id FROM invoice_items WHERE invoice_id = $1::uuid`,
      [invoiceId],
    );
    expect(draftLine.location_id).toBe(locationId);

    const checkoutRaw = await checkout(invoiceId);
    if (checkoutRaw.status !== 201) {
      throw new Error(`checkout ${checkoutRaw.status}: ${JSON.stringify(checkoutRaw.body)}`);
    }
    expect(checkoutRaw.body.status).toBe('debt');

    return { orderId, invoiceId };
  }

  it('AC-24: huỷ đơn đã phát hành đảo đúng tồn kho, công nợ và điểm — bằng số đọc được, không phải hằng số', async () => {
    // ĐỌC TRƯỚC khi bán.
    const stockBefore = await readStock();

    const { orderId, invoiceId } = await walkOrderToDebt('CNL-HAPPY-PATH');

    // Hoá đơn 1.000.000 hàng + 30.000 ship = 1.030.000 công nợ.
    const [debtAfterCheckout] = await ds.query(
      `SELECT original_amount, remaining_amount, status FROM invoice_debts WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(Number(debtAfterCheckout.original_amount)).toBe(1030000);
    expect(debtAfterCheckout.status).toBe('open'); // DebtStatus enum là CHỮ THƯỜNG

    const [invoiceAfterCheckout] = await ds.query(
      `SELECT subtotal, amount_due, shipping_fee_amount, points_earned, status
       FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    expect(invoiceAfterCheckout.status).toBe('debt');
    const subtotalBefore = Number(invoiceAfterCheckout.subtotal);
    const amountDueBefore = Number(invoiceAfterCheckout.amount_due);
    const shippingFeeBefore = Number(invoiceAfterCheckout.shipping_fee_amount);
    const pointsEarned = Number(invoiceAfterCheckout.points_earned);

    const stockAfterCheckout = await waitFor(async () => {
      const q = await readStock();
      return q === stockBefore - 1 ? q : null;
    });
    expect(stockAfterCheckout).toBe(stockBefore - 1);

    // HUỶ ĐƠN.
    const cancelRes = await cancelOrder(orderId, 'Khách đổi ý').expect(200);
    expect(cancelRes.body.status).toBe('CANCELLED');
    expect(cancelRes.body.cancelReason).toBe('Khách đổi ý');

    // Đảo kho chạy QUA Kafka thật (InvoiceCancelledPublisher → stock-return
    // consumer), không đồng bộ trong transaction huỷ — phải poll.
    const stockAfterCancel = await waitFor(async () => {
      const q = await readStock();
      return q === stockBefore ? q : null;
    });
    expect(stockAfterCancel).toBe(stockBefore);

    const ledgerRows = await ds.query(
      `SELECT id, quantity FROM stock_ledger_entries
       WHERE reference_type = 'INVOICE_CANCEL' AND item_id = $1 AND location_id = $2`,
      [itemId, locationId],
    );
    expect(ledgerRows.length).toBeGreaterThanOrEqual(1);

    const [invoiceAfterCancel] = await ds.query(
      `SELECT status, subtotal, amount_due, shipping_fee_amount, points_earned, points_reversed
       FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    expect(invoiceAfterCancel.status).toBe('cancelled');
    expect(Number(invoiceAfterCancel.subtotal)).toBe(subtotalBefore);
    expect(Number(invoiceAfterCancel.amount_due)).toBe(amountDueBefore);
    expect(Number(invoiceAfterCancel.shipping_fee_amount)).toBe(shippingFeeBefore);

    // Điểm: khách mới tạo từ đơn partner KHÔNG có membership_cards (không thẻ
    // nào được tự tạo), nên không có số dư để so trước/sau. Thay vào đó so
    // đúng gợi ý của ticket: points_reversed phải bằng đúng points_earned đã
    // đọc lúc checkout — "đảo hết những gì đã kiếm được".
    const [customerRow] = await ds.query(
      `SELECT customer_id FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    const cardRows = await ds.query(
      `SELECT points FROM membership_cards WHERE customer_id = $1 AND is_active = true`,
      [customerRow.customer_id],
    );
    expect(cardRows).toHaveLength(0); // xác nhận giả định trên, không phải điều test cố chứng minh
    expect(Number(invoiceAfterCancel.points_reversed)).toBe(pointsEarned);

    const [debtAfterCancel] = await ds.query(
      `SELECT status, settled_at FROM invoice_debts WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(debtAfterCancel.status).toBe('paid');
    expect(debtAfterCancel.settled_at).not.toBeNull();

    const [orderRow] = await ds.query(
      `SELECT status, cancel_reason FROM sales_orders WHERE id = $1`,
      [orderId],
    );
    expect(orderRow.status).toBe('CANCELLED');
    expect(orderRow.cancel_reason).toBe('Khách đổi ý');
  }, 60_000);

  it('AC-24 ca bị chặn: hoá đơn đã có phiếu đổi trả tất toán → huỷ đơn bị từ chối, tồn KHÔNG đổi', async () => {
    const stockBefore = await readStock();

    const { orderId, invoiceId } = await walkOrderToDebt('CNL-BLOCKED-SETTLED-RETURN');

    const stockAfterCheckout = await waitFor(async () => {
      const q = await readStock();
      return q === stockBefore - 1 ? q : null;
    });
    expect(stockAfterCheckout).toBe(stockBefore - 1);

    // Dựng một "phiếu đổi trả tất toán" trỏ về hoá đơn gốc — chính điều kiện
    // `assertNoSettledReturns` kiểm: type RETURN, isDraft=false, status khác
    // CANCELLED, originalInvoiceId = hoá đơn gốc.
    const [original] = await ds.query(
      `SELECT organization_id, branch_id, session_id, staff_id, customer_id, code
       FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    const returnCode = `RET-${Date.now()}`;
    await ds.query(
      `INSERT INTO invoices (
         id, organization_id, branch_id, code, status, type, original_invoice_id,
         subtotal, amount_due, is_draft, session_id, staff_id, customer_id,
         created_by, created_at, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, 'paid', 'RETURN', $4,
         0, 0, false, $5, $6, $7,
         $8, NOW(), NOW()
       )`,
      [
        original.organization_id,
        original.branch_id,
        returnCode,
        invoiceId,
        original.session_id,
        original.staff_id,
        original.customer_id,
        SEEDED_USER_ID,
      ],
    );

    const res = await cancelOrder(orderId, 'Muốn huỷ dù đã đổi trả');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.message ?? JSON.stringify(res.body)).toEqual(
      expect.stringContaining('phiếu đổi trả'),
    );

    // Không đảo gì — tồn phải đứng yên. Đây là assert bắt buộc theo Done-when
    // của ticket: thiếu nó, ca này không chứng minh gì.
    const stockAfterRejectedCancel = await readStock();
    expect(stockAfterRejectedCancel).toBe(stockAfterCheckout);

    const [invoiceRow] = await ds.query(`SELECT status FROM invoices WHERE id = $1`, [invoiceId]);
    expect(invoiceRow.status).toBe('debt');

    const [orderRow] = await ds.query(`SELECT status FROM sales_orders WHERE id = $1`, [orderId]);
    expect(orderRow.status).toBe('PROCESSED');
  }, 60_000);
});
