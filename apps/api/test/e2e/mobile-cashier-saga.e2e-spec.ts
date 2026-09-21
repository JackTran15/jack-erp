import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  buildCheckoutSagaFixture,
  CheckoutSagaFixture,
  countBusinessRows,
  createUserWithPermissions,
  ScopedTestUser,
} from './setup/checkout-saga-fixture';
import { seedPromotionFixtures } from './setup/promotion-seed';

/**
 * T-03-04 (UOW-03) — the mobile cashier checks out through checkout saga v2
 * (T-03-02), end to end over HTTP: a promotion and redeemed points end up on
 * the issued invoice as `appliedPromotions` / `pointsDiscountAmount`, preview
 * writes nothing, and a retried checkout never writes a second payment.
 *
 * Its own file: `mobile.e2e-spec.ts` fails to LOAD on main (a `seed` read at
 * describe time), so nothing added there would ever run.
 *
 * Users carry the keys the app's roles really hold, not the admin key list:
 * the cashier routes are gated by `accounting.cash.create` at class level, and
 * a green run as the all-permission admin would prove nothing about that.
 *
 * World: the shared checkout-saga fixture (COA, cash fund, payment account,
 * 3 stocked items, numbering rules) plus a main "showroom" storage with a
 * default location — mobile draft lines carry no `locationId`, so
 * `InvoiceService.createDraftIn` resolves every line to the showroom's
 * "Mặc định" location, and load-draft rejects a line with none.
 *
 * Cart: 685,000 + 200,000 = 885,000. ITEM_DISCOUNT 30% on both lines =
 * 265,500. 770 points × 500 = 385,000. amountDue = 234,500 → 23 points earned.
 */
describe('Mobile cashier checkout through checkout saga v2 (E2E, T-03-04)', () => {
  let fx: CheckoutSagaFixture;
  let ds: DataSource;
  let cashier: ScopedTestUser;
  let consultant: ScopedTestUser;
  let programId: string;
  let customerId: string;
  let cardId: string;

  const SUBTOTAL = 685_000 + 200_000;
  const PROMO = Math.round(SUBTOTAL * 0.3); // 265,500
  const POINTS = 770;
  const POINTS_VALUE = POINTS * 500; // POINT_REDEMPTION_VALUE_VND
  const AMOUNT_DUE = SUBTOTAL - PROMO - POINTS_VALUE; // 234,500

  const http = () => request(fx.app.getHttpServer());

  const cardPoints = async (): Promise<number> => {
    const [row] = await ds.query(`SELECT points FROM membership_cards WHERE id = $1`, [cardId]);
    return Number(row.points);
  };

  const line = (itemId: string, code: string, unitPrice: number) => ({
    itemId,
    itemCode: code,
    itemName: `Item ${code}`,
    unit: 'PCS',
    quantity: 1,
    unitPrice,
    lineDiscount: 0,
  });

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();
    ds = fx.ds;
    await seedPromotionFixtures(fx.app, { organizationId: fx.seed.organizationId, userId: fx.seed.userId });

    // Showroom: main storage + its default location, stocked for both items.
    const showroom = await http()
      .post('/inventory/storages')
      .set(fx.headers())
      .send({ name: 'Showroom Mobile E2E', branchId: fx.seed.branchId, isMainStorage: true })
      .expect(201);
    const defaultLoc = await http()
      .post('/inventory/locations')
      .set(fx.headers())
      .send({ code: 'MOB-SHOWROOM', name: 'Mặc định', storageId: showroom.body.id, branchId: fx.seed.branchId })
      .expect(201);
    // No API exposes `isDefault` (same workaround as checkout-saga-promotion.e2e-spec.ts).
    await ds.query(`UPDATE locations SET is_default = true WHERE id = $1`, [defaultLoc.body.id]);
    for (const itemId of [fx.itemId2, fx.itemId3]) {
      await ds.query(
        `INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 100, $5, NOW(), NOW())`,
        [fx.seed.organizationId, fx.seed.branchId, itemId, defaultLoc.body.id, fx.seed.userId],
      );
    }

    // seedBaseData predates sales orders — no SALES_ORDER numbering rule.
    await ds.query(
      `INSERT INTO document_number_rules
         (id, organization_id, document_type, prefix, include_date, date_format,
          sequence_length, reset_policy, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'SALES_ORDER', 'DT', false, 'YYYYMMDD', 6, 'NEVER', true, $2::uuid, NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [fx.seed.organizationId, fx.seed.userId],
    );

    // Promotion: ITEM_DISCOUNT 30% on both cart items, auto-applied.
    const program = await http()
      .post('/v2/promotions')
      .set(fx.headers())
      .send({
        type: 'ITEM_DISCOUNT',
        name: 'Giảm 30% mobile',
        applyTo: 'ALL_CUSTOMERS',
        autoApply: true,
        priority: 100,
        groups: [
          {
            ordinal: 0,
            lines: [fx.itemId3, fx.itemId2].map((targetId, sortOrder) => ({
              role: 'REWARD',
              targetType: 'ITEM',
              targetId,
              discountMode: 'PERCENT',
              discountValue: 30,
              sortOrder,
            })),
          },
        ],
      })
      .expect(201);
    programId = program.body.id;

    // Customer + auto-issued card, topped up to 1,000 points.
    const cust = await http().post('/customers').set(fx.headers()).send({ name: 'Khách mobile saga' }).expect(201);
    customerId = cust.body.id;
    const card = await http().get(`/customers/${customerId}/membership-card`).set(fx.headers()).expect(200);
    cardId = card.body.id;
    await http()
      .post(`/customers/membership-cards/${cardId}/points`)
      .set(fx.headers())
      .send({ type: 'adjust', delta: 1000 })
      .expect(201);

    // Nhân viên thu ngân: the keys the cashier role uses on these routes.
    cashier = await createUserWithPermissions(fx.app, fx.seed, [
      'accounting.cash.create',
      'accounting.cash.read',
      'pos.session.manage',
      'pos.invoice.read',
      'pos.invoice.write',
      'pos.sales-order.read',
      'pos.sales-order.approve',
    ]);
    // Nhân viên bán hàng: can send orders, holds no cashier key.
    consultant = await createUserWithPermissions(fx.app, fx.seed, [
      'pos.sales-order.read',
      'pos.sales-order.create',
      'pos.invoice.read',
    ]);
    // Sending an order needs an employee profile (SalesOrderService.salespersonOf).
    await ds.query(
      `INSERT INTO employee_profiles (id, organization_id, user_id, code, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'NV-MOB-E2E', $3, NOW(), NOW())`,
      [fx.seed.organizationId, consultant.userId, fx.seed.userId],
    );

    // Open a shift (open + start-sales) on the fixture's register.
    const [till] = await ds.query(
      `SELECT id FROM cash_accounts WHERE organization_id = $1 AND name = 'Quỹ E2E Checkout' LIMIT 1`,
      [fx.seed.organizationId],
    );
    await http()
      .post('/mobile/cashier/session/open')
      .set(cashier.headers())
      .send({ cashAccountId: till.id, openingCashAmount: 0 })
      .expect(201);
  }, 300_000);

  afterAll(async () => {
    await fx.app?.close();
  }, 120_000);

  describe('cashier cart with a promotion and points', () => {
    let draft: { invoiceId: string; lines: Array<{ id: string; itemId: string }> };
    let preview: Record<string, any>;
    const idemKey = randomUUID();

    it('builds a draft with manual-only line discounts and redeems 770 points onto it', async () => {
      const created = await http()
        .post('/mobile/cashier/drafts')
        .set(cashier.headers())
        .send({
          customerId,
          lines: [line(fx.itemId3, 'CKO-ITEM-3', 685_000), line(fx.itemId2, 'CKO-ITEM-2', 200_000)],
        })
        .expect(201);
      draft = created.body;
      expect(draft.lines).toHaveLength(2);
      expect(draft.lines.every((l) => typeof l.id === 'string' && l.id.length > 0)).toBe(true);
      expect(created.body).toMatchObject({ subtotal: SUBTOTAL, selectedProgramIds: [], excludedProgramIds: [] });

      const redeemed = await http()
        .post(`/mobile/cashier/drafts/${draft.invoiceId}/points`)
        .set(cashier.headers())
        .send({ points: POINTS })
        .expect(201);
      expect(Number(redeemed.body.pointsRedeemed)).toBe(POINTS);
      expect(Number(redeemed.body.pointsDiscountAmount)).toBe(POINTS_VALUE);
    });

    it('preview prices promotion + points exactly, keys line discounts by draft line id, and writes nothing', async () => {
      const before = await countBusinessRows(ds);
      const pointsBefore = await cardPoints();

      const res = await http()
        .post(`/mobile/cashier/drafts/${draft.invoiceId}/checkout/preview`)
        .set(cashier.headers())
        .send({})
        .expect(201);
      preview = res.body;

      expect(preview).toMatchObject({
        subtotal: SUBTOTAL,
        manualDiscountAmount: 0,
        promotionDiscount: PROMO,
        pointsRedeemed: POINTS,
        pointsDiscountAmount: POINTS_VALUE,
        depositAmount: 0,
        amountDue: AMOUNT_DUE,
        pointsEarned: Math.floor(AMOUNT_DUE / 10_000),
      });
      expect(preview.appliedPrograms).toHaveLength(1);
      expect(preview.appliedPrograms[0]).toMatchObject({ programId, type: 'ITEM_DISCOUNT', discountAmount: PROMO });
      const lineIds = preview.appliedPrograms[0].lineDiscounts.map((ld: { lineId: string }) => ld.lineId).sort();
      expect(lineIds).toEqual(draft.lines.map((l) => l.id).sort());

      // Nothing written: no saga row, no number minted, still a draft, card untouched.
      expect(await countBusinessRows(ds)).toEqual(before);
      const [inv] = await ds.query(`SELECT is_draft, status, code FROM invoices WHERE id = $1`, [draft.invoiceId]);
      expect(inv).toMatchObject({ is_draft: true, status: 'draft', code: expect.stringMatching(/^DRAFT/i) });
      expect(await cardPoints()).toBe(pointsBefore);
    });

    it('checkout with cash = preview amountDue issues a paid invoice', async () => {
      const res = await http()
        .post(`/mobile/cashier/drafts/${draft.invoiceId}/checkout`)
        .set(cashier.headers())
        .set('x-idempotency-key', idemKey)
        .send({ payments: [{ method: 'cash', amount: preview.amountDue }] })
        .expect(201);

      expect(res.body).toEqual({
        invoiceId: draft.invoiceId,
        invoiceCode: expect.any(String),
        status: 'paid',
        amountDue: AMOUNT_DUE,
        totalPaid: AMOUNT_DUE,
        remainder: 0,
        salesOrderId: null,
      });
      expect(res.body.invoiceCode).not.toMatch(/^DRAFT/i);
    });

    it('the issued invoice carries appliedPromotions, per-line promotion discounts and the points', async () => {
      const res = await http().get(`/mobile/invoices/${draft.invoiceId}`).set(cashier.headers()).expect(200);
      const inv = res.body;

      expect(inv.appliedPromotions.length).toBeGreaterThanOrEqual(1);
      expect(inv.appliedPromotions.map((p: { programId: string }) => p.programId)).toContain(programId);
      expect(inv.items).toHaveLength(2);
      for (const item of inv.items) expect(item.promotionDiscount).toBeGreaterThan(0);
      expect(inv.pointsDiscountAmount).toBe(POINTS_VALUE);
      expect(Number(inv.pointsRedeemed)).toBe(POINTS);
      expect(inv.pointsBalanceAfter).not.toBeNull();
      expect(inv.pointsEarned).toBe(Math.floor(AMOUNT_DUE / 10_000));
      // The card is debited the redeemed points exactly once (1,000 → 230);
      // the earn is posted asynchronously via the outbox, so not asserted here.
      expect(await cardPoints()).toBeLessThanOrEqual(1000 - POINTS + Math.floor(AMOUNT_DUE / 10_000));
    });

    it('retrying the checkout with the same x-idempotency-key replays the first response and writes nothing', async () => {
      const count = async () => {
        const [p] = await ds.query(`SELECT count(*)::int AS c FROM invoice_payments WHERE invoice_id = $1`, [draft.invoiceId]);
        const [s] = await ds.query(`SELECT count(*)::int AS c FROM checkout_saga`);
        return { payments: p.c, sagas: s.c };
      };
      const before = await count();
      expect(before.payments).toBe(1);

      const first = await http().get(`/mobile/invoices/${draft.invoiceId}`).set(cashier.headers()).expect(200);

      // Same key + same body: the GLOBAL IdempotencyInterceptor (Redis) answers
      // before the controller runs — 201 with the stored body and
      // `X-Idempotency-Status: REPLAYED`. Neither the mobile "đã thu tiền rồi"
      // guard nor the saga's own replay is ever reached on this path.
      const retry = await http()
        .post(`/mobile/cashier/drafts/${draft.invoiceId}/checkout`)
        .set(cashier.headers())
        .set('x-idempotency-key', idemKey)
        .send({ payments: [{ method: 'cash', amount: preview.amountDue }] })
        .expect(201);
      expect(retry.headers['x-idempotency-status']).toBe('REPLAYED');
      expect(retry.body).toMatchObject({ invoiceId: draft.invoiceId, invoiceCode: first.body.code, status: 'paid', remainder: 0 });
      expect(await count()).toEqual(before);

      // A resubmission under a DIFFERENT key gets past the interceptor and hits
      // the mobile draft guard instead: 400, still nothing written.
      const other = await http()
        .post(`/mobile/cashier/drafts/${draft.invoiceId}/checkout`)
        .set(cashier.headers())
        .set('x-idempotency-key', randomUUID())
        .send({ payments: [{ method: 'cash', amount: preview.amountDue }] })
        .expect(400);
      expect(JSON.stringify(other.body)).toContain('đã thu tiền rồi');
      expect(await count()).toEqual(before);
    });
  });

  describe('consultant order excluding the auto promotion', () => {
    let orderId: string;
    let invoiceId: string;

    it('consultant sends an order with a programme selection; the order stores it', async () => {
      const res = await http()
        .post('/mobile/sales-orders')
        .set(consultant.headers())
        .send({
          excludedProgramIds: [programId],
          selectedProgramIds: [],
          lines: [
            { itemId: fx.itemId3, itemCode: 'CKO-ITEM-3', itemName: 'Item CKO-ITEM-3', unit: 'PCS', quantity: 1, unitPrice: 685_000 },
          ],
        })
        .expect(201);
      orderId = res.body.id;
      expect(res.body).toMatchObject({ excludedProgramIds: [programId], selectedProgramIds: [] });
    });

    it('cashier approves (Nhận xử lý); the draft view carries the selection and a manual-only discount', async () => {
      const approved = await http().post(`/mobile/sales-orders/${orderId}/approve`).set(cashier.headers()).expect(200);
      invoiceId = approved.body.invoiceId;
      expect(invoiceId).toEqual(expect.any(String));

      const view = await http().get(`/mobile/cashier/drafts/${invoiceId}`).set(cashier.headers()).expect(200);
      expect(view.body).toMatchObject({
        salesOrderId: orderId,
        selectedProgramIds: [],
        excludedProgramIds: [programId],
        amountDue: 685_000,
      });
      expect(view.body.lines[0]).toMatchObject({ lineDiscount: 0, id: expect.any(String) });
    });

    it('checkout with that selection applies no promotion from the excluded programme', async () => {
      const preview = await http()
        .post(`/mobile/cashier/drafts/${invoiceId}/checkout/preview`)
        .set(cashier.headers())
        .send({ excludedProgramIds: [programId] })
        .expect(201);
      expect(preview.body).toMatchObject({ promotionDiscount: 0, amountDue: 685_000, appliedPrograms: [] });

      const res = await http()
        .post(`/mobile/cashier/drafts/${invoiceId}/checkout`)
        .set(cashier.headers())
        .send({ payments: [{ method: 'cash', amount: 685_000 }], excludedProgramIds: [programId] })
        .expect(201);
      expect(res.body).toMatchObject({ status: 'paid', amountDue: 685_000, salesOrderId: orderId });

      const inv = await http().get(`/mobile/invoices/${invoiceId}`).set(cashier.headers()).expect(200);
      expect(inv.body.appliedPromotions.filter((p: { programId: string }) => p.programId === programId)).toEqual([]);
      expect(inv.body.items[0].promotionDiscount).toBe(0);
    });
  });
});
