import {
  PromotionProgramType,
  PromotionDiscountMode,
  PromotionLineRole,
  PromotionTargetType,
} from '@erp/shared-interfaces';
import { ItemDiscountStrategy } from './item-discount.strategy';
import { CartState } from '../cart-state';
import { aProgram, aGroup, aLine, aCart, aCartLine } from '../__fixtures__/promotion-fixture';

describe('ItemDiscountStrategy', () => {
  const strategy = new ItemDiscountStrategy();

  it('AC-01: 30% off a 685,000 SKU discounts 205,500, unit price after is 479,500', () => {
    const cartLine = aCartLine({ itemId: 'sku-1', quantity: 1, unitPrice: 685_000 });
    const program = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([
        aGroup({
          lines: [
            aLine({
              role: PromotionLineRole.REWARD,
              targetId: 'sku-1',
              discountMode: PromotionDiscountMode.PERCENT,
              discountValue: 30,
            }),
          ],
        }),
      ])
      .build();
    const cart = aCart({ lines: [cartLine] });

    const result = strategy.compute(program, cart, new CartState());

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('unreachable');
    expect(result.outcome.discountAmount).toBe(205_500);
    expect(result.outcome.lineDiscounts).toEqual([
      { lineId: cartLine.lineId, discountAmount: 205_500, unitPriceAfter: 479_500 },
    ]);
  });

  it('scales the discount by quantity', () => {
    const cartLine = aCartLine({ itemId: 'sku-1', quantity: 3, unitPrice: 100_000 });
    const program = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([
        aGroup({
          lines: [aLine({ targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })],
        }),
      ])
      .build();
    const cart = aCart({ lines: [cartLine] });

    const result = strategy.compute(program, cart, new CartState());
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('unreachable');
    expect(result.outcome.discountAmount).toBe(30_000); // 10% of 100,000 * 3
  });

  it('clamps the discount to the line total (manual discount already applied)', () => {
    const cartLine = aCartLine({ itemId: 'sku-1', quantity: 1, unitPrice: 100_000, manualLineDiscount: 95_000 });
    const program = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([
        aGroup({
          lines: [aLine({ targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 50 })],
        }),
      ])
      .build();
    const cart = aCart({ lines: [cartLine] });

    const result = strategy.compute(program, cart, new CartState());
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('unreachable');
    // 50% of 100,000 = 50,000, but the line only has 5,000 left after the manual discount.
    expect(result.outcome.discountAmount).toBe(5_000);
  });

  it('returns not_met when no cart line matches any reward target', () => {
    const program = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([aGroup({ lines: [aLine({ targetId: 'sku-does-not-exist' })] })])
      .build();
    const cart = aCart({ lines: [aCartLine({ itemId: 'sku-1' })] });

    expect(strategy.compute(program, cart, new CartState()).status).toBe('not_met');
  });

  it('returns resource_taken when the only matching line is already claimed', () => {
    const cartLine = aCartLine({ itemId: 'sku-1' });
    const program = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([aGroup({ lines: [aLine({ targetId: 'sku-1' })] })])
      .build();
    const cart = aCart({ lines: [cartLine] });
    const state = new CartState();
    state.claimLines([cartLine.lineId], 'other-program');

    const result = strategy.compute(program, cart, state);
    expect(result).toEqual({ status: 'resource_taken', takenByLineId: cartLine.lineId });
  });

  it('a CATEGORY target matches items via categoryPathIds, including parent groups', () => {
    const cartLine = aCartLine({ itemId: 'sku-1' });
    const cart = aCart({
      lines: [cartLine],
      catalog: new Map([
        [
          'sku-1',
          {
            itemId: 'sku-1',
            code: 'SKU-1',
            name: 'Item 1',
            unit: 'cai',
            sellingPrice: 100_000,
            categoryPathIds: ['child-category', 'parent-category'],
          },
        ],
      ]),
    });
    const program = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([
        aGroup({
          lines: [
            aLine({
              targetType: PromotionTargetType.CATEGORY,
              targetId: 'parent-category',
              discountMode: PromotionDiscountMode.PERCENT,
              discountValue: 10,
            }),
          ],
        }),
      ])
      .build();

    const result = strategy.compute(program, cart, new CartState());
    expect(result.status).toBe('applied');
  });
});
