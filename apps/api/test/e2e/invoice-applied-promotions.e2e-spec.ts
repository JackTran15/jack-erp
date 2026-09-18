import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { buildCheckoutSagaFixture, CheckoutSagaFixture } from './setup/checkout-saga-fixture';
import { invoiceDiscountBody, itemDiscountBody, seedPromotionFixtures } from './setup/promotion-seed';

/**
 * pos-line-promotion-breakdown T-03-01 / AC-14 — `GET /invoices/:id` returns
 * enough of the `invoice_checkout_promotions` snapshot for the POS to label
 * each line with the programme that discounted it, on reprint and in the
 * invoice detail, without re-running the engine.
 *
 * Cart: 685,000 + 100,000. ITEM_DISCOUNT 10% claims the 685,000 line (68,500);
 * INVOICE_DISCOUNT 10% NON_PROMO_ONLY bills only the 100,000 line (10,000).
 * `lineDiscounts[].lineId` must be the `invoice_items.id` of that line —
 * that is what the reprint joins on.
 */
describe('GET /invoices/:id — appliedPromotions carries name + per-line allocation (e2e, T-03-01)', () => {
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

  const checkout = (invoiceId: string, amount: number) =>
    request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount }] })
      .expect(201);

  const itemDiscountTenPercent = (targetId: string) =>
    itemDiscountBody(targetId, {
      name: 'CTKM-A hàng hóa 10%',
      groups: [
        {
          ordinal: 0,
          lines: [
            { role: 'REWARD', targetType: 'ITEM', targetId, discountMode: 'PERCENT', discountValue: 10, sortOrder: 0 },
          ],
        },
      ],
    });

  it('AC-14: each snapshot row comes back with programId/code/name/type/priority/discountAmount/lineDiscounts, lineId = invoice_items.id', async () => {
    const a = await createProgram(itemDiscountTenPercent(fx.itemId3));
    const b = await createProgram(
      invoiceDiscountBody({ name: 'CTKM-B hóa đơn 10%', invoiceScope: 'NON_PROMO_ONLY', priority: 200 }),
    );

    const invoiceId = await createDraft([
      { itemId: fx.itemId3, unitPrice: 685_000 },
      { itemId: fx.itemId, unitPrice: 100_000 },
    ]);
    await checkout(invoiceId, 706_500);

    const res = await request(fx.app.getHttpServer())
      .get(`/invoices/${invoiceId}`)
      .set(fx.headers())
      .expect(200);

    const items: Array<{ id: string; itemId: string }> = res.body.items;
    const line685 = items.find((i) => i.itemId === fx.itemId3)!;
    const line100 = items.find((i) => i.itemId === fx.itemId)!;
    expect(line685).toBeDefined();
    expect(line100).toBeDefined();

    const applied: Array<{
      programId: string;
      code: string;
      name: string;
      type: string;
      priority: number;
      discountAmount: number;
      lineDiscounts: Array<{ lineId: string; discountAmount: number; unitPriceAfter: number }>;
    }> = res.body.appliedPromotions;
    expect(applied).toHaveLength(2);

    const byId = Object.fromEntries(applied.map((p) => [p.programId, p]));
    const itemProg = byId[a.body.id];
    const invoiceProg = byId[b.body.id];
    expect(itemProg).toMatchObject({
      code: a.body.code,
      name: 'CTKM-A hàng hóa 10%',
      type: 'ITEM_DISCOUNT',
      discountAmount: 68_500,
    });
    expect(itemProg.lineDiscounts).toEqual([
      { lineId: line685.id, discountAmount: 68_500, unitPriceAfter: 616_500 },
    ]);
    expect(invoiceProg).toMatchObject({
      code: b.body.code,
      name: 'CTKM-B hóa đơn 10%',
      type: 'INVOICE_DISCOUNT',
      priority: 200,
      discountAmount: 10_000,
    });
    // The whole point of NON_PROMO_ONLY seen per line: only the untouched line.
    expect(invoiceProg.lineDiscounts).toEqual([
      { lineId: line100.id, discountAmount: 10_000, unitPriceAfter: 90_000 },
    ]);
    // Engine order: lower priority first.
    expect(applied.map((p) => p.programId)).toEqual([a.body.id, b.body.id]);
  });

  it('AC-14: an invoice with no promotion snapshot returns appliedPromotions = []', async () => {
    const invoiceId = await createDraft([{ itemId: fx.itemId, unitPrice: 100_000 }]);
    await checkout(invoiceId, 100_000);

    const res = await request(fx.app.getHttpServer())
      .get(`/invoices/${invoiceId}`)
      .set(fx.headers())
      .expect(200);
    expect(res.body.appliedPromotions).toEqual([]);
  });
});
