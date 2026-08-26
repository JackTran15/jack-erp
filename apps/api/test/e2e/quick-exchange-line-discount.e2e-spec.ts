import { randomUUID } from 'crypto';
import request from 'supertest';
import {
  buildCheckoutSagaFixture,
  CheckoutSagaFixture,
} from './setup/checkout-saga-fixture';

/**
 * Quick exchange with a per-line discount — the production defect this suite
 * exists for.
 *
 * A cashier rang up a 685.000 pair at 30% off against a 460.000 return. POS
 * displayed 19.500 to collect; the draft stored a 225.000 difference because the
 * discount never left the browser, so `checkout-return` refused the payment with
 * "Ghi phần chênh đổi hàng vào công nợ yêu cầu invoice có customerId" — a
 * walk-in customer has no id to put a debt on.
 *
 * AC-05 is the regression half: an exchange *against an original invoice* still
 * refunds what the customer actually paid, prorated from that invoice, and must
 * not move because the discount plumbing changed.
 */
describe('Quick exchange — per-line discounts (E2E)', () => {
  let fx: CheckoutSagaFixture;

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();
  }, 120_000);

  afterAll(async () => {
    await fx.app.close();
  });

  const returnLine = (over: Record<string, unknown> = {}) => ({
    itemId: fx.itemId,
    itemCode: 'CKO-ITEM-1',
    itemName: 'Item CKO-ITEM-1',
    unit: 'PCS',
    locationId: fx.locationId,
    quantity: 1,
    unitPrice: 460000,
    ...over,
  });

  const newLine = (over: Record<string, unknown> = {}) => ({
    itemId: fx.itemId3,
    locationId: fx.locationId,
    itemCode: 'CKO-ITEM-3',
    itemName: 'Item CKO-ITEM-3',
    unit: 'PCS',
    quantity: 1,
    unitPrice: 685000,
    ...over,
  });

  const createExchange = async (body: Record<string, unknown>) =>
    request(fx.app.getHttpServer())
      .post('/invoices/exchanges')
      .set(fx.headers())
      .send({ sessionId: randomUUID(), reason: 'Đổi trả nhanh', ...body })
      .expect(201);

  const itemRows = async (invoiceId: string) =>
    fx.ds.query(
      `SELECT direction, line_discount, line_discount_type, line_discount_value,
              line_discount_reason, line_total
         FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order`,
      [invoiceId],
    );

  const invoiceRow = async (invoiceId: string) =>
    (
      await fx.ds.query(
        `SELECT status, subtotal, amount_due, total_paid, net_amount, refunded_amount
           FROM invoices WHERE id = $1`,
        [invoiceId],
      )
    )[0];

  it('AC-01: a walk-in exchange with a 30% line discount collects 19.500 and stores it as netAmount', async () => {
    const draft = await createExchange({
      returnLines: [returnLine()],
      newLines: [
        newLine({
          lineDiscountType: 'percent',
          lineDiscountValue: 30,
          lineDiscountReason: 'sale30',
        }),
      ],
    });

    // 685.000 − 205.500 = 479.500 sold, 460.000 returned.
    expect(Number(draft.body.netAmount)).toBe(19500);
    expect(Number(draft.body.amountDue)).toBe(19500);

    await request(fx.app.getHttpServer())
      .post(`/invoices/${draft.body.id}/checkout-return`)
      .set(fx.headers())
      .send({
        refundMethod: 'CASH',
        payments: [{ paymentMethod: 'cash', amount: 19500 }],
      })
      .expect(201);

    const invoice = await invoiceRow(draft.body.id);
    expect(invoice.status).toBe('paid');
    expect(Number(invoice.net_amount)).toBe(19500);
    expect(Number(invoice.total_paid)).toBe(19500);

    const out = (await itemRows(draft.body.id)).find(
      (r: { direction: string }) => r.direction === 'OUT',
    );
    expect(out).toMatchObject({
      line_discount_type: 'percent',
      line_discount_reason: 'sale30',
    });
    expect(Number(out.line_discount)).toBe(205500);
    expect(Number(out.line_discount_value)).toBe(30);
    expect(Number(out.line_total)).toBe(479500);
  });

  it('AC-02: a discount on the returned line lowers what the return is worth', async () => {
    const draft = await createExchange({
      returnLines: [
        returnLine({
          unitPrice: 500000,
          lineDiscountType: 'percent',
          lineDiscountValue: 10,
          lineDiscountReason: 'sale10',
        }),
      ],
      newLines: [newLine({ unitPrice: 600000 })],
    });

    // 600.000 sold − 450.000 returned
    expect(Number(draft.body.netAmount)).toBe(150000);

    const inbound = (await itemRows(draft.body.id)).find(
      (r: { direction: string }) => r.direction === 'IN',
    );
    expect(Number(inbound.line_discount)).toBe(50000);
    expect(Number(inbound.line_total)).toBe(450000);
  });

  it('AC-03: a net refund on discounted values never asks for a customerId', async () => {
    const draft = await createExchange({
      returnLines: [returnLine({ unitPrice: 600000 })],
      newLines: [
        newLine({
          lineDiscountType: 'percent',
          lineDiscountValue: 30,
          lineDiscountReason: 'sale30',
        }),
      ],
    });

    // 479.500 sold − 600.000 returned
    expect(Number(draft.body.netAmount)).toBe(-120500);
    expect(Number(draft.body.refundedAmount)).toBe(120500);

    await request(fx.app.getHttpServer())
      .post(`/invoices/${draft.body.id}/checkout-return`)
      .set(fx.headers())
      .send({ refundMethod: 'CASH' })
      .expect(201);

    const invoice = await invoiceRow(draft.body.id);
    expect(Number(invoice.refunded_amount)).toBe(120500);
    expect(Number(invoice.amount_due)).toBe(0);
  });

  it('AC-04: a pure return carries its line discount into the refund', async () => {
    const draft = await request(fx.app.getHttpServer())
      .post('/invoices/returns')
      .set(fx.headers())
      .send({
        mode: 'quick',
        sessionId: randomUUID(),
        reason: 'Trả hàng',
        lines: [
          returnLine({
            unitPrice: 300000,
            lineDiscountType: 'amount',
            lineDiscountValue: 30000,
            lineDiscountReason: 'hàng lỗi',
          }),
        ],
      })
      .expect(201);

    const inbound = (await itemRows(draft.body.id))[0];
    expect(Number(inbound.line_total)).toBe(270000);

    await request(fx.app.getHttpServer())
      .post(`/invoices/${draft.body.id}/checkout-return`)
      .set(fx.headers())
      .send({ refundMethod: 'CASH' })
      .expect(201);

    const invoice = await invoiceRow(draft.body.id);
    expect(Number(invoice.refunded_amount)).toBe(270000);
  });

  it('AC-05: a return against an original invoice still refunds what the customer paid', async () => {
    // Sell the 685.000 item at 30% off through the ordinary sale path.
    const sale = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(fx.headers())
      .send({
        sessionId: randomUUID(),
        customerId: fx.customerId,
        items: [
          {
            itemId: fx.itemId3,
            locationId: fx.locationId,
            itemCode: 'CKO-ITEM-3',
            itemName: 'Item CKO-ITEM-3',
            unit: 'PCS',
            quantity: 1,
            unitPrice: 685000,
            lineDiscountType: 'percent',
            lineDiscountValue: 30,
            lineDiscountReason: 'sale30',
          },
        ],
      })
      .expect(201);

    await request(fx.app.getHttpServer())
      .post(`/invoices/${sale.body.id}/checkout`)
      .set(fx.headers())
      .send({ payments: [{ paymentMethod: 'cash', amount: 479500 }] })
      .expect(201);

    const [saleLine] = await fx.ds.query(
      `SELECT id, line_total FROM invoice_items WHERE invoice_id = $1`,
      [sale.body.id],
    );
    expect(Number(saleLine.line_total)).toBe(479500);

    const draft = await request(fx.app.getHttpServer())
      .post('/invoices/returns')
      .set(fx.headers())
      .send({
        mode: 'regular',
        originalInvoiceId: sale.body.id,
        customerId: fx.customerId,
        sessionId: randomUUID(),
        reason: 'Đổi ý',
        lines: [
          returnLine({
            originalInvoiceItemId: saleLine.id,
            itemId: fx.itemId3,
            itemCode: 'CKO-ITEM-3',
            itemName: 'Item CKO-ITEM-3',
            // The POS cart posts the list price on a return line; the refund is
            // prorated from the original invoice, not taken from this number.
            unitPrice: 685000,
          }),
        ],
      })
      .expect(201);

    await request(fx.app.getHttpServer())
      .post(`/invoices/${draft.body.id}/checkout-return`)
      .set(fx.headers())
      .send({ refundMethod: 'CASH' })
      .expect(201);

    const invoice = await invoiceRow(draft.body.id);
    // 479.500 — what was actually collected — not the 685.000 list price.
    expect(Number(invoice.refunded_amount)).toBe(479500);
  });
});
