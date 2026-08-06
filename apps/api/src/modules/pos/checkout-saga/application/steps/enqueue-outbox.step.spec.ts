import { EnqueueOutboxStep } from './enqueue-outbox.step';
import { InvoiceStatus } from '../../../entities/invoice.entity';
import { CheckoutContext } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [{ paymentMethod: 'cash' as any, amount: 200 }] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    invoice: { id: 'inv-1', branchId: 'b1', customerId: undefined, issuedAt: new Date('2026-08-05T00:00:00Z') } as any,
    documentNumber: 'INV-202608-00001',
    items: [
      { itemId: 'item-1', quantity: 2 } as any,
      { itemId: 'item-2', quantity: 1 } as any,
      { itemId: 'item-1', quantity: 3 } as any, // repeats item-1 — must aggregate
    ],
    totals: {
      subtotal: 200,
      manualDiscountAmount: 0,
      promotionDiscount: 0,
      pointsDiscountAmount: 0,
      depositAmount: 0,
      amountDue: 200,
      totalPaid: 200,
      remainder: 0,
      pointsEarned: 0,
      newStatus: InvoiceStatus.PAID,
    },
    ...overrides,
  };
}

function withManager() {
  const enqueue = jest.fn().mockResolvedValue({});
  const outbox = { enqueue };
  const manager = { __fake: 'manager' } as any;
  return { manager, outbox, enqueue };
}

describe('EnqueueOutboxStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    const { outbox } = withManager();
    await expect(new EnqueueOutboxStep(outbox as any).execute(ctx())).rejects.toThrow(
      'enqueue-outbox ran outside a transaction',
    );
  });

  it('throws a plain Error when invoice/items/totals are missing', async () => {
    const { manager, outbox } = withManager();
    await expect(
      new EnqueueOutboxStep(outbox as any).execute(ctx({ manager, items: undefined })),
    ).rejects.toThrow('enqueue-outbox ran before its prerequisite steps populated the context');
  });

  it('is a no-op on a replayed run — no outbox rows, no WS notification', async () => {
    const { manager, outbox, enqueue } = withManager();
    const c = ctx({ replayed: true, manager });
    await new EnqueueOutboxStep(outbox as any).execute(c);
    expect(enqueue).not.toHaveBeenCalled();
    expect(c.wsNotification).toBeUndefined();
  });

  it('enqueues SALE_POSTED and TEMP_WAREHOUSE_INVOICE_FULFILL, but not LOYALTY_POINTS_AWARD, for a customer-less sale', async () => {
    const { manager, outbox, enqueue } = withManager();
    const c = ctx({ manager }); // invoice.customerId is undefined

    await new EnqueueOutboxStep(outbox as any).execute(c);

    expect(enqueue).toHaveBeenCalledTimes(2);
    const topics = enqueue.mock.calls.map((call) => call[1]);
    expect(topics).toEqual(
      expect.arrayContaining(['erp.sale.posted', 'erp.temp-warehouse.invoice-fulfill']),
    );
    expect(topics).not.toContain('erp.loyalty.points.award');
  });

  it('also enqueues LOYALTY_POINTS_AWARD when the invoice has a customer', async () => {
    const { manager, outbox, enqueue } = withManager();
    const c = ctx({ manager, invoice: { id: 'inv-1', branchId: 'b1', customerId: 'cust-1' } as any });

    await new EnqueueOutboxStep(outbox as any).execute(c);

    expect(enqueue).toHaveBeenCalledTimes(3);
    const loyaltyCall = enqueue.mock.calls.find((call) => call[1] === 'erp.loyalty.points.award');
    expect(loyaltyCall).toBeDefined();
    expect(loyaltyCall![2].payload).toMatchObject({
      invoiceId: 'inv-1',
      customerId: 'cust-1',
      subtotal: 200,
    });
    expect(loyaltyCall![3]).toBe('cust-1'); // partitionKey
  });

  it('every enqueue call passes the manager and uses invoiceId as the partitionKey (SALE_POSTED / fulfill)', async () => {
    const { manager, outbox, enqueue } = withManager();
    await new EnqueueOutboxStep(outbox as any).execute(ctx({ manager }));

    for (const call of enqueue.mock.calls) {
      expect(call[0]).toBe(manager);
    }
    const saleCall = enqueue.mock.calls.find((call) => call[1] === 'erp.sale.posted');
    expect(saleCall![3]).toBe('inv-1');
  });

  it('aggregates temp-warehouse fulfill quantities by itemId across repeated lines', async () => {
    const { manager, outbox, enqueue } = withManager();
    await new EnqueueOutboxStep(outbox as any).execute(ctx({ manager }));

    const fulfillCall = enqueue.mock.calls.find(
      (call) => call[1] === 'erp.temp-warehouse.invoice-fulfill',
    );
    expect(fulfillCall![2].payload.lines).toEqual(
      expect.arrayContaining([
        { itemId: 'item-1', quantity: 5 }, // 2 + 3, aggregated
        { itemId: 'item-2', quantity: 1 },
      ]),
    );
    expect(fulfillCall![2].payload.lines).toHaveLength(2);
  });

  it('eventId is deterministic per (topic, invoiceId) — same invoice, same call, same id every time', async () => {
    const { manager: m1, outbox: o1, enqueue: e1 } = withManager();
    const { manager: m2, outbox: o2, enqueue: e2 } = withManager();

    await new EnqueueOutboxStep(o1 as any).execute(ctx({ manager: m1 }));
    await new EnqueueOutboxStep(o2 as any).execute(ctx({ manager: m2 })); // same invoiceId, a fresh run

    const idsByTopic = (calls: jest.Mock['mock']['calls']) =>
      Object.fromEntries(calls.map((c) => [c[1], c[2].eventId]));
    expect(idsByTopic(e1.mock.calls)).toEqual(idsByTopic(e2.mock.calls));
  });

  it('eventId differs across topics for the same invoice (no accidental collision)', async () => {
    const { manager, outbox, enqueue } = withManager();
    await new EnqueueOutboxStep(outbox as any).execute(ctx({ manager }));

    const ids = enqueue.mock.calls.map((c) => c[2].eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sets ctx.wsNotification with the acknowledged payload, but does not emit it itself', async () => {
    const { manager, outbox } = withManager();
    const c = ctx({ manager });

    await new EnqueueOutboxStep(outbox as any).execute(c);

    expect(c.wsNotification).toMatchObject({
      eventType: 'POS_CHECKOUT_ACKNOWLEDGED',
      organizationId: 'o1',
      branchId: 'b1',
      correlationId: 'inv-1',
      payload: { invoiceId: 'inv-1', documentNumber: 'INV-202608-00001', totalAmount: 200 },
    });
  });
});
