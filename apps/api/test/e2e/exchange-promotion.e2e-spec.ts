import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { buildCheckoutSagaFixture, CheckoutSagaFixture } from './setup/checkout-saga-fixture';
import { itemDiscountBody, seedPromotionFixtures } from './setup/promotion-seed';
import { POINT_EARN_VND_PER_POINT } from '../../src/modules/customer/loyalty.constants';

/**
 * 2026092102 / T-03-04 — the money contract of an exchange whose "Mua thêm"
 * lines carry a promotion (AC-10..AC-19) and of its dry-run (AC-28). One `it`
 * per AC; every expected number is copied from 02-requirements.md, not
 * derived here. Assertions go to the rows (`invoice_items`,
 * `invoice_checkout_promotions`, `invoices`), not only to the HTTP body.
 *
 * Items: the shared checkout-saga fixture's CKO-ITEM-3 (685.000) and
 * CKO-ITEM-1 (100.000) stand in for the requirements' SKU-685 / SKU-100 —
 * same prices, and stocked at `fx.locationId`, which an exchange's OUT line
 * needs and the promotion-seed catalogue is not.
 */
describe('Exchange checkout — promotions on the bought lines (E2E, T-03-04)', () => {
  let fx: CheckoutSagaFixture;
  let ds: DataSource;
  /** 685.000 and 100.000 — see the file docblock. */
  let SKU685: string;
  let SKU100: string;

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();
    ds = fx.ds;
    await seedPromotionFixtures(fx.app, {
      organizationId: fx.seed.organizationId,
      userId: fx.seed.userId,
    });
    SKU685 = fx.itemId3;
    SKU100 = fx.itemId;
  }, 180_000);

  afterAll(async () => {
    await fx.app.close();
  }, 120_000);

  /** Each case owns its programmes — wiped between them, same as the other promotion suites. */
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

  const createProgram = async (body: unknown): Promise<{ id: string; code: string }> => {
    const res = await request(fx.app.getHttpServer())
      .post('/v2/promotions')
      .set(fx.headers())
      .send(body as object)
      .expect(201);
    return res.body;
  };

  const line = (itemId: string, unitPrice: number, quantity = 1, over: Record<string, unknown> = {}) => ({
    itemId,
    locationId: fx.locationId,
    itemCode: itemId === SKU685 ? 'SKU-685' : 'SKU-100',
    itemName: itemId === SKU685 ? 'Giày nữ 685' : 'Phụ kiện 100',
    unit: 'PCS',
    quantity,
    unitPrice,
    ...over,
  });

  /** A paid SALE through checkout-saga v2 (so a running promotion is snapshotted on it). */
  const postSale = async (items: ReturnType<typeof line>[], amount: number) => {
    const draft = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(fx.headers())
      .send({ sessionId: randomUUID(), customerId: fx.customerId, items })
      .expect(201);
    await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId: draft.body.id, payments: [{ paymentMethod: 'cash', amount }] })
      .expect(201);
    const rows: Array<{ id: string; item_id: string }> = await ds.query(
      `SELECT id, item_id FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order`,
      [draft.body.id],
    );
    return { id: draft.body.id as string, lineIdOf: (itemId: string) => rows.find((r) => r.item_id === itemId)!.id };
  };

  const createExchange = async (body: Record<string, unknown>) => {
    const res = await request(fx.app.getHttpServer())
      .post('/invoices/exchanges')
      .set(fx.headers())
      .send({ sessionId: randomUUID(), reason: 'Đổi hàng', customerId: fx.customerId, ...body })
      .expect(201);
    return res.body.id as string;
  };

  const checkoutReturn = (id: string, body: Record<string, unknown>) =>
    request(fx.app.getHttpServer())
      .post(`/invoices/${id}/checkout-return`)
      .set(fx.headers())
      .send({ refundMethod: 'CASH', ...body });

  const preview = (id: string, body: Record<string, unknown>) =>
    request(fx.app.getHttpServer())
      .post(`/invoices/${id}/checkout-return/preview`)
      .set(fx.headers())
      .send(body);

  const itemRows = (invoiceId: string) =>
    ds.query(
      `SELECT id, direction, item_id, line_total, promotion_discount
         FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order`,
      [invoiceId],
    );
  const outRow = async (invoiceId: string) =>
    (await itemRows(invoiceId)).find((r: { direction: string }) => r.direction === 'OUT');
  const inRow = async (invoiceId: string) =>
    (await itemRows(invoiceId)).find((r: { direction: string }) => r.direction === 'IN');
  const snapshotRows = (invoiceId: string) =>
    ds.query(
      `SELECT program_id, code, name, type, discount_amount, line_discounts
         FROM invoice_checkout_promotions WHERE invoice_id = $1 ORDER BY priority, created_at`,
      [invoiceId],
    );
  const invoiceRow = async (invoiceId: string) =>
    (
      await ds.query(
        `SELECT is_draft, status, net_amount, refunded_amount, discount_amount, total_paid, points_earned
           FROM invoices WHERE id = $1`,
        [invoiceId],
      )
    )[0];

  /** AC-10's document: S = 1 × SKU-685 with no promotion; E returns it and buys 2 × SKU-100 under a 30% on SKU-100. */
  const stageAc10 = async () => {
    const S = await postSale([line(SKU685, 685_000)], 685_000);
    const P = await createProgram(itemDiscountBody(SKU100));
    const E = await createExchange({
      originalInvoiceId: S.id,
      returnLines: [line(SKU685, 685_000, 1, { originalInvoiceItemId: S.lineIdOf(SKU685) })],
      newLines: [line(SKU100, 100_000, 2)],
    });
    return { S, P, E };
  };

  it('AC-10: invoice-backed exchange — the autoApply programme lands on the OUT line, the net on newNet', async () => {
    const { P, E } = await stageAc10();

    const res = await checkoutReturn(E, {}).expect(201);
    expect(res.body.netAmount).toBe(-545_000);
    expect(res.body.refundedAmount).toBe(545_000);

    const out = await outRow(E);
    expect(Number(out.promotion_discount)).toBe(60_000);
    expect(Number(out.line_total)).toBe(200_000);

    const snaps = await snapshotRows(E);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ program_id: P.id, name: 'Giảm giá hàng hóa 30%', type: 'ITEM_DISCOUNT' });
    expect(Number(snaps[0].discount_amount)).toBe(60_000);
    expect(snaps[0].line_discounts[0].lineId).toBe(out.id);

    expect(Number((await invoiceRow(E)).net_amount)).toBe(-545_000);
  });

  it('AC-11: quick exchange (no original invoice) applies the programme too', async () => {
    await createProgram(itemDiscountBody(SKU685));
    const Q = await createExchange({
      returnLines: [line(SKU100, 100_000)],
      newLines: [line(SKU685, 685_000)],
    });

    const res = await checkoutReturn(Q, { payments: [{ paymentMethod: 'cash', amount: 379_500 }] }).expect(201);
    expect(res.body.netAmount).toBe(379_500);
    expect(Number(res.body.totalPaid)).toBe(379_500);

    expect(Number((await outRow(Q)).promotion_discount)).toBe(205_500);
    expect(await snapshotRows(Q)).toHaveLength(1);
  });

  it('AC-12: excludedProgramIds keeps the programme out of the exchange', async () => {
    const P = await createProgram(itemDiscountBody(SKU685));
    const Q = await createExchange({
      returnLines: [line(SKU100, 100_000)],
      newLines: [line(SKU685, 685_000)],
    });

    const res = await checkoutReturn(Q, {
      excludedProgramIds: [P.id],
      payments: [{ paymentMethod: 'cash', amount: 585_000 }],
    }).expect(201);
    expect(res.body.netAmount).toBe(585_000);

    expect(Number((await outRow(Q)).promotion_discount)).toBe(0);
    expect(await snapshotRows(Q)).toHaveLength(0);
  });

  it('AC-13: selectedProgramIds switches an autoApply=false programme on', async () => {
    const P = await createProgram(itemDiscountBody(SKU685, { autoApply: false }));
    const newQuick = () =>
      createExchange({ returnLines: [line(SKU100, 100_000)], newLines: [line(SKU685, 685_000)] });

    const Q1 = await newQuick();
    const r1 = await checkoutReturn(Q1, { payments: [{ paymentMethod: 'cash', amount: 585_000 }] }).expect(201);
    expect(r1.body.netAmount).toBe(585_000);
    expect(await snapshotRows(Q1)).toHaveLength(0);

    const Q2 = await newQuick();
    const r2 = await checkoutReturn(Q2, {
      selectedProgramIds: [P.id],
      payments: [{ paymentMethod: 'cash', amount: 379_500 }],
    }).expect(201);
    expect(r2.body.netAmount).toBe(379_500);
    const snaps = await snapshotRows(Q2);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].program_id).toBe(P.id);
  });

  it('AC-14: the returned (IN) line never goes through the engine', async () => {
    const S = await postSale([line(SKU685, 685_000)], 685_000);
    await createProgram(itemDiscountBody(SKU685)); // running now, targets what is being RETURNED
    const E = await createExchange({
      originalInvoiceId: S.id,
      returnLines: [line(SKU685, 685_000, 1, { originalInvoiceItemId: S.lineIdOf(SKU685) })],
      newLines: [line(SKU100, 100_000)],
    });

    const res = await checkoutReturn(E, {}).expect(201);

    expect(Number((await inRow(E)).promotion_discount)).toBe(0);
    expect(await snapshotRows(E)).toHaveLength(0);
    expect(res.body.netAmount).toBe(-585_000);
  });

  it('AC-15: points are earned on the bought value after the promotion', async () => {
    await createProgram(itemDiscountBody(SKU100));
    const Q = await createExchange({
      customerId: fx.customerId,
      returnLines: [line(SKU100, 100_000)],
      newLines: [line(SKU100, 100_000, 2)],
    });

    // newNet 140.000 − returned 100.000
    await checkoutReturn(Q, { payments: [{ paymentMethod: 'cash', amount: 40_000 }] }).expect(201);

    const row = await invoiceRow(Q);
    expect(Number(row.points_earned)).toBe(Math.floor(140_000 / POINT_EARN_VND_PER_POINT));
    expect(Number(row.points_earned)).not.toBe(Math.floor(200_000 / POINT_EARN_VND_PER_POINT));
  });

  it('AC-16: the header discount_amount is the sum of the OUT lines\' promotion; 0 without one', async () => {
    const { E } = await stageAc10();
    await checkoutReturn(E, {}).expect(201);
    expect(Number((await invoiceRow(E)).discount_amount)).toBe(60_000);

    await clearPrograms();
    const plain = await createExchange({
      returnLines: [line(SKU100, 100_000)],
      newLines: [line(SKU100, 100_000, 2)],
    });
    await checkoutReturn(plain, { payments: [{ paymentMethod: 'cash', amount: 100_000 }] }).expect(201);
    expect(Number((await invoiceRow(plain)).discount_amount)).toBe(0);
  });

  it('AC-17: returning the bought line later refunds what was actually paid for it', async () => {
    await createProgram(itemDiscountBody(SKU685));
    const Q = await createExchange({
      returnLines: [line(SKU100, 100_000)],
      newLines: [line(SKU685, 685_000)],
    });
    await checkoutReturn(Q, { payments: [{ paymentMethod: 'cash', amount: 379_500 }] }).expect(201);

    const res = await request(fx.app.getHttpServer())
      .get(`/invoices/${Q}/eligible-returns`)
      .set(fx.headers())
      .expect(200);
    const sold = res.body.find((l: { itemId: string }) => l.itemId === SKU685);
    expect(sold.refundableUnitPrice).toBe(479_500);
    expect(sold.promotions[0].unitDiscount).toBe(205_500);
  });

  it('AC-18: GET /invoices/:id on the exchange returns its appliedPromotions', async () => {
    await createProgram(itemDiscountBody(SKU685));
    const Q = await createExchange({
      returnLines: [line(SKU100, 100_000)],
      newLines: [line(SKU685, 685_000)],
    });
    await checkoutReturn(Q, { payments: [{ paymentMethod: 'cash', amount: 379_500 }] }).expect(201);
    const out = await outRow(Q);

    const res = await request(fx.app.getHttpServer())
      .get(`/invoices/${Q}`)
      .set(fx.headers())
      .expect(200);
    expect(res.body.appliedPromotions).toHaveLength(1);
    expect(res.body.appliedPromotions[0]).toMatchObject({
      name: 'Giảm giá hàng hóa 30%',
      type: 'ITEM_DISCOUNT',
      discountAmount: 205_500,
      lineDiscounts: [{ lineId: out.id, discountAmount: 205_500 }],
    });
  });

  it('AC-19: the money direction uses the net of BOTH sides', async () => {
    // S sold SKU-685 under a 30% (refundable 479.500); the exchange buys SKU-100 under its own 30%.
    await createProgram(itemDiscountBody(SKU685));
    const S = await postSale([line(SKU685, 685_000)], 479_500);
    await clearPrograms();
    await createProgram(itemDiscountBody(SKU100));
    const E = await createExchange({
      originalInvoiceId: S.id,
      returnLines: [line(SKU685, 685_000, 1, { originalInvoiceItemId: S.lineIdOf(SKU685) })],
      newLines: [line(SKU100, 100_000)],
    });

    // Paying into a refund is refused — checked first, while E is still a draft.
    const refused = await checkoutReturn(E, { payments: [{ paymentMethod: 'cash', amount: 100_000 }] }).expect(400);
    expect(JSON.stringify(refused.body)).toContain('payments không được cung cấp khi netAmount');

    const res = await checkoutReturn(E, {}).expect(201);
    expect(res.body.netAmount).toBe(-409_500);
    expect(res.body.refundedAmount).toBe(409_500);
  });

  it('AC-28: checkout-return/preview returns the numbers the post will settle on, and writes nothing', async () => {
    const { P, E } = await stageAc10();

    const first = await preview(E, {}).expect(200);
    expect(first.body).toEqual({
      returnSubtotal: 685_000,
      newSubtotal: 200_000,
      newPromotionDiscount: 60_000,
      newNet: 140_000,
      returnedNet: 685_000,
      netAmount: -545_000,
      refundedAmount: 545_000,
    });
    const untouched = await invoiceRow(E);
    expect(untouched.is_draft).toBe(true);
    expect(untouched.status).toBe('draft');
    expect(await snapshotRows(E)).toHaveLength(0);
    expect(Number((await outRow(E)).promotion_discount)).toBe(0);

    const excluded = await preview(E, { excludedProgramIds: [P.id] }).expect(200);
    expect(excluded.body.newPromotionDiscount).toBe(0);
    expect(excluded.body.netAmount).toBe(-485_000);

    await checkoutReturn(E, { excludedProgramIds: [P.id] }).expect(201);
    expect(Number((await invoiceRow(E)).net_amount)).toBe(-485_000);
  });
});
