import { PromotionProgramType, PromotionDiscountMode, PromotionInvoiceScope } from '@erp/shared-interfaces';
import { InvoiceDiscountStrategy } from './invoice-discount.strategy';
import { CartState } from '../cart-state';
import { aProgram, aCart, aCartLine } from '../__fixtures__/promotion-fixture';

describe('InvoiceDiscountStrategy', () => {
  const strategy = new InvoiceDiscountStrategy();

  it('applies a flat percentage across the whole invoice', () => {
    const lines = [
      aCartLine({ lineId: 'l1', unitPrice: 100_000, quantity: 1 }),
      aCartLine({ lineId: 'l2', unitPrice: 200_000, quantity: 1 }),
    ];
    const program = aProgram()
      .ofType(PromotionProgramType.INVOICE_DISCOUNT)
      .with({ invoiceScope: PromotionInvoiceScope.ALL_ITEMS, discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })
      .build();
    const cart = aCart({ lines });

    const result = strategy.compute(program, cart, new CartState());
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('unreachable');
    expect(result.outcome.discountAmount).toBe(30_000);
    // Rounding remainder goes to the last line so the sum matches exactly.
    const sum = result.outcome.lineDiscounts.reduce((s, ld) => s + ld.discountAmount, 0);
    expect(sum).toBe(result.outcome.discountAmount);
  });

  it('NON_PROMO_ONLY scope only discounts lines not already claimed by an earlier program', () => {
    const claimedLine = aCartLine({ lineId: 'l1', unitPrice: 100_000, quantity: 1 });
    const freeLine = aCartLine({ lineId: 'l2', unitPrice: 200_000, quantity: 1 });
    const program = aProgram()
      .ofType(PromotionProgramType.INVOICE_DISCOUNT)
      .withPriority(20)
      .with({ invoiceScope: PromotionInvoiceScope.NON_PROMO_ONLY, discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })
      .build();
    const cart = aCart({ lines: [claimedLine, freeLine] });
    const state = new CartState();
    state.claimLines([claimedLine.lineId], 'earlier-program');

    const result = strategy.compute(program, cart, state);
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('unreachable');
    expect(result.outcome.discountAmount).toBe(20_000); // 10% of 200,000 only
    expect(result.outcome.lineDiscounts).toEqual([{ lineId: 'l2', discountAmount: 20_000, unitPriceAfter: 180_000 }]);
  });

  it('AMOUNT mode clamps the discount to the base total', () => {
    const line = aCartLine({ lineId: 'l1', unitPrice: 50_000, quantity: 1 });
    const program = aProgram()
      .ofType(PromotionProgramType.INVOICE_DISCOUNT)
      .with({ invoiceScope: PromotionInvoiceScope.ALL_ITEMS, discountMode: PromotionDiscountMode.AMOUNT, discountValue: 100_000 })
      .build();
    const cart = aCart({ lines: [line] });

    const result = strategy.compute(program, cart, new CartState());
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('unreachable');
    expect(result.outcome.discountAmount).toBe(50_000);
  });

  it('returns not_met when NON_PROMO_ONLY leaves no unclaimed lines', () => {
    const line = aCartLine({ lineId: 'l1' });
    const program = aProgram()
      .ofType(PromotionProgramType.INVOICE_DISCOUNT)
      .with({ invoiceScope: PromotionInvoiceScope.NON_PROMO_ONLY, discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })
      .build();
    const cart = aCart({ lines: [line] });
    const state = new CartState();
    state.claimLines([line.lineId], 'earlier-program');

    expect(strategy.compute(program, cart, state).status).toBe('not_met');
  });
  /**
   * QA #8. `groups: []` is blocked at save time now (GROUPS_EMPTY), but rows
   * saved before that rule existed are still in the database, so the engine has
   * to survive them.
   *
   * Reproduced before fixing: `groups[0]` was undefined and
   * `TypeError: Cannot read properties of undefined (reading 'lines')` escaped
   * EvaluateCartHandler (which has no try/catch) as a 500 on EVERY price
   * calculation — the till was down until someone deleted the promotion.
   */
  it('treats a program with no group as not applicable instead of throwing (QA #8)', () => {
    const emptyGroupsProgram = aProgram().ofType(PromotionProgramType.INVOICE_DISCOUNT)
      .with({ invoiceScope: PromotionInvoiceScope.ALL_ITEMS, discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })
      .build();
    // The domain object freezes its fields, so shadow `groups` on a descendant
    // instead of mutating it — the same shape the engine sees when such a row
    // is hydrated out of the database.
    const malformed: typeof emptyGroupsProgram = Object.create(emptyGroupsProgram);
    Object.defineProperty(malformed, 'groups', { value: [], enumerable: true });
    const emptyGroupsCart = aCart({ lines: [aCartLine({ lineId: 'l1', unitPrice: 100_000, quantity: 1 })] });

    expect(() => strategy.compute(malformed, emptyGroupsCart, new CartState())).not.toThrow();
    expect(strategy.compute(malformed, emptyGroupsCart, new CartState()).status).toBe('not_met');
  });
});
