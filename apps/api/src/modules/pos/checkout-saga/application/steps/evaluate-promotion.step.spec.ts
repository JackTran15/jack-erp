import { EvaluatePromotionStep } from './evaluate-promotion.step';
import { EvaluateCartQuery } from '../../../../promotion/application/queries/evaluate-cart.query';
import { CheckoutContext } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    invoice: { id: 'inv-1', customerId: 'cust-1' } as any,
    items: [
      { id: 'line-1', itemId: 'item-1', quantity: 2, unitPrice: 100000, lineDiscount: 0 } as any,
      { id: 'line-2', itemId: 'item-2', quantity: 1, unitPrice: 50000, lineDiscount: 5000 } as any,
    ],
    ...overrides,
  };
}

const emptyEvaluation = {
  subtotal: 0,
  promotionDiscount: 0,
  amountAfterPromotion: 0,
  appliedPrograms: [],
  availablePrograms: [],
  skippedPrograms: [],
};

describe('EvaluatePromotionStep', () => {
  it('throws a plain Error when load-draft has not populated ctx.invoice/ctx.items', async () => {
    const queryBus = { execute: jest.fn() };
    await expect(
      new EvaluatePromotionStep(queryBus as any).execute(ctx({ items: undefined })),
    ).rejects.toThrow('evaluate-promotion ran before load-draft populated the context');
  });

  it('dispatches EvaluateCartQuery on the QueryBus with a DTO built from ctx.items — never from ctx.input', async () => {
    const queryBus = { execute: jest.fn().mockResolvedValue(emptyEvaluation) };
    const c = ctx();

    await new EvaluatePromotionStep(queryBus as any).execute(c);

    expect(queryBus.execute).toHaveBeenCalledTimes(1);
    const query = queryBus.execute.mock.calls[0][0];
    expect(query).toBeInstanceOf(EvaluateCartQuery);
    expect(query.dto.customerId).toBe('cust-1');
    expect(query.dto.lines).toEqual([
      { lineId: 'line-1', itemId: 'item-1', quantity: 2, unitPrice: 100000, manualLineDiscount: undefined },
      { lineId: 'line-2', itemId: 'item-2', quantity: 1, unitPrice: 50000, manualLineDiscount: 5000 },
    ]);
    expect(query.actor).toBe(c.actor); // the same actor reference, passed through
  });

  it("uses invoice_items.id as lineId, not anything the client sent — the request has no per-item id at all", async () => {
    const queryBus = { execute: jest.fn().mockResolvedValue(emptyEvaluation) };
    await new EvaluatePromotionStep(queryBus as any).execute(ctx());
    const query = queryBus.execute.mock.calls[0][0];
    expect(query.dto.lines.map((l: { lineId: string }) => l.lineId)).toEqual(['line-1', 'line-2']);
  });

  it('omits customerId when the invoice has none (walk-in customer)', async () => {
    const queryBus = { execute: jest.fn().mockResolvedValue(emptyEvaluation) };
    await new EvaluatePromotionStep(queryBus as any).execute(
      ctx({ invoice: { id: 'inv-1', customerId: undefined } as any }),
    );
    const query = queryBus.execute.mock.calls[0][0];
    expect(query.dto.customerId).toBeUndefined();
  });

  it('forwards selectedProgramIds from the request, and nothing else client-supplied', async () => {
    const queryBus = { execute: jest.fn().mockResolvedValue(emptyEvaluation) };
    await new EvaluatePromotionStep(queryBus as any).execute(
      ctx({ input: { invoiceId: 'inv-1', payments: [], selectedProgramIds: ['prog-1'] } }),
    );
    const query = queryBus.execute.mock.calls[0][0];
    expect(query.dto.selectedProgramIds).toEqual(['prog-1']);
  });

  // T-09-02 / ADR-07 — excludedProgramIds must reach the same evaluate call
  // checkout uses to commit, not just the preview endpoint (ADR-02 parity).
  it('forwards excludedProgramIds from the request', async () => {
    const queryBus = { execute: jest.fn().mockResolvedValue(emptyEvaluation) };
    await new EvaluatePromotionStep(queryBus as any).execute(
      ctx({ input: { invoiceId: 'inv-1', payments: [], excludedProgramIds: ['prog-2'] } }),
    );
    const query = queryBus.execute.mock.calls[0][0];
    expect(query.dto.excludedProgramIds).toEqual(['prog-2']);
  });

  it('a forged discountAmount in the request body has nowhere to go — CheckoutInput does not even declare the field', async () => {
    const queryBus = { execute: jest.fn().mockResolvedValue(emptyEvaluation) };
    const c = ctx({ input: { invoiceId: 'inv-1', payments: [], discountAmount: 999999 } as any });
    await new EvaluatePromotionStep(queryBus as any).execute(c);
    const query = queryBus.execute.mock.calls[0][0];
    expect(query.dto).not.toHaveProperty('discountAmount');
    expect(c.promotion?.promotionDiscount).toBe(0); // took the engine's real (empty) result, not the forged number
  });

  it('sets ctx.promotion from the real engine result — promotionDiscount, appliedPrograms, and a flattened lineDiscounts', async () => {
    const evaluation = {
      subtotal: 250000,
      promotionDiscount: 75000,
      amountAfterPromotion: 175000,
      appliedPrograms: [
        {
          programId: 'prog-1',
          code: 'SALE30',
          name: 'Giảm 30%',
          type: 'PERCENT_ORDER',
          priority: 1,
          discountAmount: 75000,
          lineDiscounts: [
            { lineId: 'line-1', discountAmount: 60000, unitPriceAfter: 70000 },
            { lineId: 'line-2', discountAmount: 15000, unitPriceAfter: 35000 },
          ],
          gifts: [],
        },
      ],
      availablePrograms: [],
      skippedPrograms: [],
    };
    const queryBus = { execute: jest.fn().mockResolvedValue(evaluation) };
    const c = ctx();

    await new EvaluatePromotionStep(queryBus as any).execute(c);

    expect(c.promotion).toEqual({
      promotionDiscount: 75000,
      appliedPrograms: evaluation.appliedPrograms,
      lineDiscounts: [
        { lineId: 'line-1', discountAmount: 60000, unitPriceAfter: 70000 },
        { lineId: 'line-2', discountAmount: 15000, unitPriceAfter: 35000 },
      ],
    });
  });

  it('propagates a handler error (e.g. UNKNOWN_ITEM/UNKNOWN_CUSTOMER) unchanged', async () => {
    const boom = new Error('UNKNOWN_CUSTOMER');
    const queryBus = { execute: jest.fn().mockRejectedValue(boom) };
    await expect(new EvaluatePromotionStep(queryBus as any).execute(ctx())).rejects.toBe(boom);
  });
});
