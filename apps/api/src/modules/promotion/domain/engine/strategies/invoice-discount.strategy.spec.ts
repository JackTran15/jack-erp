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

  /**
   * T-02-01 / A-02 — "already discounted" now includes a discount the cashier
   * typed in by hand, not just one a line-level program claimed. Before this,
   * a hand-discounted line sat in the NON_PROMO_ONLY base and got discounted
   * a second time on the invoice total.
   */
  describe('NON_PROMO_ONLY also excludes hand-discounted lines (AC-13, AC-14)', () => {
    const tenPercentNonPromo = () =>
      aProgram()
        .ofType(PromotionProgramType.INVOICE_DISCOUNT)
        .with({
          invoiceScope: PromotionInvoiceScope.NON_PROMO_ONLY,
          discountMode: PromotionDiscountMode.PERCENT,
          discountValue: 10,
        })
        .build();

    it('AC-13: a line the cashier discounted by hand is out of the base', () => {
      // 685,000 marked down by 85,000 at the till, plus an untouched 100,000.
      const handDiscounted = aCartLine({ lineId: 'l1', unitPrice: 685_000, quantity: 1, manualLineDiscount: 85_000 });
      const untouched = aCartLine({ lineId: 'l2', unitPrice: 100_000, quantity: 1 });
      const cart = aCart({ lines: [handDiscounted, untouched] });

      const result = strategy.compute(tenPercentNonPromo(), cart, new CartState());

      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('unreachable');
      // 10% of 100,000 only — not 10% of (600,000 + 100,000) = 70,000.
      expect(result.outcome.discountAmount).toBe(10_000);
      expect(result.outcome.lineDiscounts).toEqual([
        { lineId: 'l2', discountAmount: 10_000, unitPriceAfter: 90_000 },
      ]);
    });

    it('AC-14: a line that is both claimed and hand-discounted drops out once, taking nothing with it', () => {
      const both = aCartLine({ lineId: 'l1', unitPrice: 685_000, quantity: 1, manualLineDiscount: 85_000 });
      const untouched = aCartLine({ lineId: 'l2', unitPrice: 100_000, quantity: 1 });
      const cart = aCart({ lines: [both, untouched] });
      const state = new CartState();
      state.claimLines([both.lineId], 'item-discount-program');

      const result = strategy.compute(tenPercentNonPromo(), cart, state);

      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('unreachable');
      expect(result.outcome.discountAmount).toBe(10_000);
      // `l2` must survive — a double exclusion would drop it too and yield not_met.
      expect(result.outcome.lineDiscounts.map((ld) => ld.lineId)).toEqual(['l2']);
    });

    it('returns not_met when every line is either claimed or hand-discounted', () => {
      const claimedLine = aCartLine({ lineId: 'l1', unitPrice: 100_000 });
      const handDiscounted = aCartLine({ lineId: 'l2', unitPrice: 200_000, manualLineDiscount: 50_000 });
      const cart = aCart({ lines: [claimedLine, handDiscounted] });
      const state = new CartState();
      state.claimLines([claimedLine.lineId], 'item-discount-program');

      expect(strategy.compute(tenPercentNonPromo(), cart, state).status).toBe('not_met');
    });
  });

  it('AC-20: an AMOUNT discount splits across the base with no rounding drift', () => {
    const lines = [
      aCartLine({ lineId: 'l1', unitPrice: 100_000, quantity: 1 }),
      aCartLine({ lineId: 'l2', unitPrice: 200_000, quantity: 1 }),
      aCartLine({ lineId: 'l3', unitPrice: 300_000, quantity: 1 }),
    ];
    const program = aProgram()
      .ofType(PromotionProgramType.INVOICE_DISCOUNT)
      .with({
        invoiceScope: PromotionInvoiceScope.NON_PROMO_ONLY,
        discountMode: PromotionDiscountMode.AMOUNT,
        discountValue: 100_000,
      })
      .build();
    const cart = aCart({ lines });

    const result = strategy.compute(program, cart, new CartState());

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('unreachable');
    // 1/6, 2/6, 3/6 of 100,000 — largest-remainder puts the stray dong on l1.
    expect(result.outcome.lineDiscounts.map((ld) => ld.discountAmount)).toEqual([16_667, 33_333, 50_000]);
    const sum = result.outcome.lineDiscounts.reduce((acc, ld) => acc + ld.discountAmount, 0);
    expect(sum).toBe(result.outcome.discountAmount);
    expect(sum).toBe(100_000);
    // No share may exceed its own line.
    result.outcome.lineDiscounts.forEach((ld, i) => {
      expect(ld.discountAmount).toBeLessThanOrEqual(lines[i].unitPrice * lines[i].quantity);
    });
  });
});
