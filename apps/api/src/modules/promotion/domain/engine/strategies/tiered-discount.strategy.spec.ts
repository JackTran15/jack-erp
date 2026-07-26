import {
  PromotionProgramType,
  PromotionDiscountMode,
  PromotionTierBasis,
  PromotionTierScope,
  PromotionLineRole,
} from '@erp/shared-interfaces';
import { TieredDiscountStrategy } from './tiered-discount.strategy';
import { CartState } from '../cart-state';
import { aProgram, aGroup, aLine, aTier, aCart, aCartLine } from '../__fixtures__/promotion-fixture';

describe('TieredDiscountStrategy', () => {
  const strategy = new TieredDiscountStrategy();

  it('AC-06: quantity tiers [5,9]->10%, [10,null]->20%; buying 7 yields 10%', () => {
    const lines = [aCartLine({ itemId: 'sku-1', quantity: 7, unitPrice: 100_000 })];
    const program = aProgram()
      .ofType(PromotionProgramType.TIERED_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined, tierBasis: PromotionTierBasis.QUANTITY, tierScope: PromotionTierScope.PER_ITEM })
      .withGroups([
        aGroup({
          lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1' })],
          tiers: [
            aTier({ fromValue: 5, toValue: 9, discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 }),
            aTier({ fromValue: 10, toValue: undefined, discountMode: PromotionDiscountMode.PERCENT, discountValue: 20 }),
          ],
        }),
      ])
      .build();
    const cart = aCart({ lines });

    const result = strategy.compute(program, cart, new CartState());
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('unreachable');
    // 10% of (7 * 100,000)
    expect(result.outcome.discountAmount).toBe(70_000);
  });

  it('buying 10 crosses into the higher tier (20%)', () => {
    const lines = [aCartLine({ itemId: 'sku-1', quantity: 10, unitPrice: 100_000 })];
    const program = aProgram()
      .ofType(PromotionProgramType.TIERED_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined, tierBasis: PromotionTierBasis.QUANTITY, tierScope: PromotionTierScope.PER_ITEM })
      .withGroups([
        aGroup({
          lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1' })],
          tiers: [
            aTier({ fromValue: 5, toValue: 9, discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 }),
            aTier({ fromValue: 10, toValue: undefined, discountMode: PromotionDiscountMode.PERCENT, discountValue: 20 }),
          ],
        }),
      ])
      .build();
    const cart = aCart({ lines });

    const result = strategy.compute(program, cart, new CartState());
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('unreachable');
    expect(result.outcome.discountAmount).toBe(200_000); // 20% of (10 * 100,000)
  });

  it('buying below the lowest tier threshold does not apply', () => {
    const lines = [aCartLine({ itemId: 'sku-1', quantity: 2, unitPrice: 100_000 })];
    const program = aProgram()
      .ofType(PromotionProgramType.TIERED_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined, tierBasis: PromotionTierBasis.QUANTITY, tierScope: PromotionTierScope.PER_ITEM })
      .withGroups([
        aGroup({
          lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1' })],
          tiers: [aTier({ fromValue: 5, toValue: 9, discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })],
        }),
      ])
      .build();
    const cart = aCart({ lines });

    expect(strategy.compute(program, cart, new CartState()).status).toBe('not_met');
  });

  it('ALL_ITEMS_IN_GROUP scope discounts the group total and allocates proportionally', () => {
    const lines = [
      aCartLine({ lineId: 'l1', itemId: 'sku-1', quantity: 1, unitPrice: 300_000 }),
      aCartLine({ lineId: 'l2', itemId: 'sku-2', quantity: 1, unitPrice: 700_000 }),
    ];
    const program = aProgram()
      .ofType(PromotionProgramType.TIERED_DISCOUNT)
      .with({
        discountMode: undefined,
        discountValue: undefined,
        tierBasis: PromotionTierBasis.ITEM_VALUE,
        tierScope: PromotionTierScope.ALL_ITEMS_IN_GROUP,
      })
      .withGroups([
        aGroup({
          lines: [
            aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1' }),
            aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-2' }),
          ],
          tiers: [aTier({ fromValue: 500_000, toValue: undefined, discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })],
        }),
      ])
      .build();
    const cart = aCart({ lines });

    const result = strategy.compute(program, cart, new CartState());
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('unreachable');
    expect(result.outcome.discountAmount).toBe(100_000); // 10% of 1,000,000
    const sum = result.outcome.lineDiscounts.reduce((s, ld) => s + ld.discountAmount, 0);
    expect(sum).toBe(100_000);
  });

  describe('INVOICE_VALUE basis', () => {
    it('ignores groups/lines entirely and applies straight to the invoice total, respecting max_discount_amount', () => {
      const lines = [aCartLine({ lineId: 'l1', unitPrice: 1_000_000, quantity: 1 })];
      const program = aProgram()
        .ofType(PromotionProgramType.TIERED_DISCOUNT)
        .with({
          discountMode: undefined,
          discountValue: undefined,
          tierBasis: PromotionTierBasis.INVOICE_VALUE,
          maxDiscountAmount: 50_000,
        })
        .withGroups([
          aGroup({
            lines: [],
            tiers: [aTier({ fromValue: 0, toValue: undefined, discountMode: PromotionDiscountMode.PERCENT, discountValue: 20 })],
          }),
        ])
        .build();
      const cart = aCart({ lines });

      const result = strategy.compute(program, cart, new CartState());
      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('unreachable');
      // 20% of 1,000,000 = 200,000, capped at max_discount_amount = 50,000.
      expect(result.outcome.discountAmount).toBe(50_000);
      expect(result.outcome.claimedLineIds).toEqual(['l1']);
    });
  });
});
