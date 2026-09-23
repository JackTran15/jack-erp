import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { buildCheckoutSagaFixture, CheckoutSagaFixture } from './setup/checkout-saga-fixture';
import { itemDiscountBody, seedPromotionFixtures } from './setup/promotion-seed';

/**
 * 2026092102 / T-02-01 — `GET /invoices/:id/eligible-returns` names, per line,
 * the programmes the original checkout allocated to it (AC-05), and `[]` when
 * the sale carried no snapshot (AC-06). `refundableUnitPrice` is untouched by
 * the addition.
 *
 * Posts real SALEs through checkout-saga v2 so the `invoice_checkout_promotions`
 * rows come from `persist-invoice.step.ts`, not from a hand-inserted fixture —
 * the whole point is that the two ends of the snapshot agree.
 */
describe('GET /invoices/:id/eligible-returns — promotions per line (E2E, T-02-01)', () => {
  let fx: CheckoutSagaFixture;
  let ds: DataSource;

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();
    ds = fx.ds;
    await seedPromotionFixtures(fx.app, {
      organizationId: fx.seed.organizationId,
      userId: fx.seed.userId,
    });
  }, 180_000);

  afterAll(async () => {
    await fx.app.close();
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

  const createDraft = async (lines: Array<{ itemId: string; unitPrice: number; quantity?: number }>) => {
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
          quantity: l.quantity ?? 1,
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
      .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount } ] })
      .expect(201);

  const eligibleReturns = (invoiceId: string) =>
    request(fx.app.getHttpServer())
      .get(`/invoices/${invoiceId}/eligible-returns`)
      .set(fx.headers())
      .expect(200);

  it('AC-05: a line the snapshot discounted lists the programme with its per-unit share, refundableUnitPrice unchanged', async () => {
    const program = await createProgram(itemDiscountBody(fx.itemId3));
    const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 685_000, quantity: 2 }]);
    // 2 × 685.000 − 30% = 959.000
    await checkout(invoiceId, 959_000);

    const [snapshot] = await ds.query(
      `SELECT line_discounts FROM invoice_checkout_promotions WHERE invoice_id = $1`,
      [invoiceId],
    );
    const [item] = await ds.query(
      `SELECT id, promotion_discount FROM invoice_items WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(Number(item.promotion_discount)).toBe(411_000);
    expect(snapshot.line_discounts[0].lineId).toBe(item.id);

    const res = await eligibleReturns(invoiceId);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].originalInvoiceItemId).toBe(item.id);
    expect(res.body[0].promotions).toEqual([
      {
        programId: program.body.id,
        code: program.body.code,
        name: 'Giảm giá hàng hóa 30%',
        type: 'ITEM_DISCOUNT',
        unitDiscount: 205_500,
      },
    ]);
    expect(res.body[0].refundableUnitPrice).toBe(479_500);
    expect(res.body[0].unitPrice).toBe(685_000);
  });

  it('AC-06: a sale with no promotion lists promotions: [] on every line', async () => {
    const invoiceId = await createDraft([
      { itemId: fx.itemId3, unitPrice: 685_000 },
      { itemId: fx.itemId, unitPrice: 100_000 },
    ]);
    await checkout(invoiceId, 785_000);

    const [{ count }] = await ds.query(
      `SELECT COUNT(*)::int AS count FROM invoice_checkout_promotions WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(count).toBe(0);

    const res = await eligibleReturns(invoiceId);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((l: { promotions: unknown[] }) => l.promotions)).toEqual([[], []]);
    expect(res.body.map((l: { refundableUnitPrice: number }) => l.refundableUnitPrice)).toEqual([685_000, 100_000]);
  });

  it('AC-06: an older invoice whose snapshot row has line_discounts NULL still answers [] and the same price', async () => {
    const program = await createProgram(itemDiscountBody(fx.itemId3));
    const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 685_000 }]);
    await checkout(invoiceId, 479_500);

    const before = await eligibleReturns(invoiceId);
    expect(before.body[0].promotions).toHaveLength(1);
    expect(before.body[0].promotions[0].programId).toBe(program.body.id);

    // Pre-snapshot shape: the row exists but carries no per-line allocation.
    await ds.query(`UPDATE invoice_checkout_promotions SET line_discounts = NULL WHERE invoice_id = $1`, [invoiceId]);

    const after = await eligibleReturns(invoiceId);
    expect(after.body[0].promotions).toEqual([]);
    expect(after.body[0].refundableUnitPrice).toBe(before.body[0].refundableUnitPrice);
    expect(after.body[0].refundableUnitPrice).toBe(479_500);
  });
});
