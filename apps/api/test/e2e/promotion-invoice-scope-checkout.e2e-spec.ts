import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { buildCheckoutSagaFixture, CheckoutSagaFixture } from './setup/checkout-saga-fixture';
import { invoiceDiscountBody, itemDiscountBody, seedPromotionFixtures } from './setup/promotion-seed';

/**
 * T-02-06 / AC-18 — BR-002 through a real checkout, not just `evaluate`.
 *
 * `evaluate` is a quote; the invoice row is what the customer actually pays, and
 * the two are computed by different code paths (`evaluate-promotion.step` →
 * `compute-totals.step` → `persist-invoice.step`). A scope bug could be fixed in
 * one and not the other, so this asserts the number that was written to
 * `invoices`, not the one returned over HTTP.
 *
 * Cart: 685,000 + 100,000 = 785,000.
 *   ITEM_DISCOUNT 10% on the 685,000 line ⇒ 68,500, and claims that line.
 *   INVOICE_DISCOUNT 10% NON_PROMO_ONLY ⇒ 10% of the remaining 100,000 = 10,000.
 *   Total discount 78,500 ⇒ payable 706,500 (not 638,000, which is what stacking
 *   on the full 785,000 would give).
 */
describe('Checkout — invoice-discount scope / BR-002 (e2e, T-02-06)', () => {
  let fx: CheckoutSagaFixture;
  let ds: DataSource;

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();
    ds = fx.ds;
    await seedPromotionFixtures(fx.app, {
      organizationId: fx.seed.organizationId,
      userId: fx.seed.userId,
    });
  }, 300_000);

  afterAll(async () => {
    await fx.app?.close();
  }, 120_000);

  const clearPrograms = async () => {
    await ds.query('DELETE FROM promotion_lines');
    await ds.query('DELETE FROM promotion_tiers');
    await ds.query('DELETE FROM promotion_conditions');
    await ds.query('DELETE FROM promotion_branches');
    await ds.query('DELETE FROM promotion_customer_groups');
    await ds.query('DELETE FROM promotion_groups');
    await ds.query('DELETE FROM promotion_programs');
  };
  beforeEach(clearPrograms);

  const createProgram = (body: unknown) =>
    request(fx.app.getHttpServer()).post('/v2/promotions').set(fx.headers()).send(body as object).expect(201);

  const createDraft = async (lines: Array<{ itemId: string; unitPrice: number }>) => {
    const res = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(fx.headers())
      .send({
        sessionId: randomUUID(),
        customerId: fx.customerId,
        items: lines.map((l) => ({
          itemId: l.itemId,
          locationId: fx.locationId,
          itemCode: 'ITEM',
          itemName: 'Item',
          unit: 'PCS',
          quantity: 1,
          unitPrice: l.unitPrice,
        })),
      })
      .expect(201);
    return res.body.id as string;
  };

  /** 10%, not the fixture's default 30% — the AC is stated in tens. */
  const itemDiscountTenPercent = (targetId: string) =>
    itemDiscountBody(targetId, {
      name: 'CTKM-A hàng hóa 10%',
      groups: [
        {
          ordinal: 0,
          lines: [
            {
              role: 'REWARD',
              targetType: 'ITEM',
              targetId,
              discountMode: 'PERCENT',
              discountValue: 10,
              sortOrder: 0,
            },
          ],
        },
      ],
    });

  it('AC-18: the invoice row carries 78,500 off and 706,500 payable, computed by the server', async () => {
    await createProgram(itemDiscountTenPercent(fx.itemId3));
    await createProgram(
      invoiceDiscountBody({ name: 'CTKM-B hóa đơn 10%', invoiceScope: 'NON_PROMO_ONLY', priority: 200 }),
    );

    const invoiceId = await createDraft([
      { itemId: fx.itemId3, unitPrice: 685_000 },
      { itemId: fx.itemId, unitPrice: 100_000 },
    ]);

    const res = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount: 706_500 }] })
      .expect(201);
    expect(res.body.committed).toBe(true);

    const [invoice] = await ds.query(
      `SELECT subtotal, discount_amount, amount_due, status FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    expect(Number(invoice.subtotal)).toBe(785_000);
    // The whole point: 78,500, not 147,000.
    expect(Number(invoice.discount_amount)).toBe(78_500);
    expect(Number(invoice.amount_due)).toBe(706_500);
    expect(invoice.status).toBe('paid');

    // Both programmes are snapshotted, and the invoice-level one shows it only
    // billed the untouched line.
    const snapshots = await ds.query(
      `SELECT type, discount_amount FROM invoice_checkout_promotions WHERE invoice_id = $1 ORDER BY type`,
      [invoiceId],
    );
    expect(snapshots).toHaveLength(2);
    const byType = Object.fromEntries(
      snapshots.map((s: { type: string; discount_amount: string }) => [s.type, Number(s.discount_amount)]),
    );
    expect(byType.ITEM_DISCOUNT).toBe(68_500);
    expect(byType.INVOICE_DISCOUNT).toBe(10_000);
  });

  it('AC-18: a client-supplied discount has no field to arrive in — the whitelist rejects it', async () => {
    await createProgram(itemDiscountTenPercent(fx.itemId3));
    const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 685_000 }]);

    // CheckoutV2Dto never declares `discountAmount`; the global ValidationPipe
    // runs `forbidNonWhitelisted`, so the request dies before the saga starts.
    const res = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount: 616_500 }], discountAmount: 1 });
    expect(res.status).toBe(400);
  });
});
