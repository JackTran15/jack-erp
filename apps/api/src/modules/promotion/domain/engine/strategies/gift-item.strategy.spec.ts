import { PromotionProgramType, PromotionLineRole, PromotionConditionType, PromotionGiftMode } from '@erp/shared-interfaces';
import { GiftItemStrategy } from './gift-item.strategy';
import { CartState } from '../cart-state';
import { CartLine } from '../../model/cart';
import { CatalogItemView } from '../../ports/catalog-reader.port';
import { aProgram, aGroup, aLine, aCondition, aCart, aCartLine, aCatalogItem } from '../__fixtures__/promotion-fixture';

/** Cart lines get an auto-derived catalog entry; gift targets (not in the cart) need their own. */
function withGiftCatalog(lines: CartLine[], ...giftItems: CatalogItemView[]): Map<string, CatalogItemView> {
  const catalog = new Map(lines.map((line) => [line.itemId, aCatalogItem({ itemId: line.itemId, sellingPrice: line.unitPrice })]));
  for (const giftItem of giftItems) catalog.set(giftItem.itemId, giftItem);
  return catalog;
}

describe('GiftItemStrategy', () => {
  const strategy = new GiftItemStrategy();

  it('AC-07: multiply_gift with a 200,000 threshold gifts 3 portions on a 650,000 invoice', () => {
    const lines = [aCartLine({ unitPrice: 650_000, quantity: 1 })];
    const cart = aCart({
      lines,
      catalog: withGiftCatalog(lines, aCatalogItem({ itemId: 'gift-item', code: 'GIFT', name: 'Doi tat', sellingPrice: 20_000 })),
    });
    const program = aProgram()
      .ofType(PromotionProgramType.GIFT_ITEM)
      .with({ discountMode: undefined, discountValue: undefined })
      .withCondition(aCondition({ type: PromotionConditionType.MIN_INVOICE_AMOUNT, minAmount: 200_000, multiplyGift: true }))
      .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'gift-item' })] })])
      .build();

    const result = strategy.compute(program, cart, new CartState());
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('unreachable');
    expect(result.outcome.gifts).toEqual([
      {
        itemId: 'gift-item',
        itemCode: 'GIFT',
        itemName: 'Doi tat',
        unit: 'cai',
        quantity: 3,
        unitPrice: 20_000,
        mode: PromotionGiftMode.ONE_OF,
      },
    ]);
    // GIFT_ITEM never discounts money — the free item is a separate gift, not a price cut.
    expect(result.outcome.discountAmount).toBe(0);
  });

  it('without multiply_gift, always gifts exactly 1 portion once the condition is met', () => {
    const lines = [aCartLine({ unitPrice: 650_000, quantity: 1 })];
    const cart = aCart({
      lines,
      catalog: withGiftCatalog(lines, aCatalogItem({ itemId: 'gift-item', sellingPrice: 20_000 })),
    });
    const program = aProgram()
      .ofType(PromotionProgramType.GIFT_ITEM)
      .with({ discountMode: undefined, discountValue: undefined })
      .withCondition(aCondition({ type: PromotionConditionType.MIN_INVOICE_AMOUNT, minAmount: 200_000, multiplyGift: false }))
      .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'gift-item' })] })])
      .build();

    const result = strategy.compute(program, cart, new CartState());
    expect(result.status).toBe('applied');
    if (result.status !== 'applied') throw new Error('unreachable');
    expect(result.outcome.gifts[0].quantity).toBe(1);
  });

  it('does not apply when the invoice threshold is not met', () => {
    const lines = [aCartLine({ unitPrice: 100_000, quantity: 1 })];
    const cart = aCart({ lines });
    const program = aProgram()
      .ofType(PromotionProgramType.GIFT_ITEM)
      .with({ discountMode: undefined, discountValue: undefined })
      .withCondition(aCondition({ type: PromotionConditionType.MIN_INVOICE_AMOUNT, minAmount: 200_000, multiplyGift: true }))
      .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'gift-item' })] })])
      .build();

    expect(strategy.compute(program, cart, new CartState()).status).toBe('not_met');
  });

  it('silently skips a gift target that no longer resolves in the catalog', () => {
    const lines = [aCartLine({ unitPrice: 650_000, quantity: 1 })];
    const cart = aCart({ lines }); // catalog has no entry for 'gift-item'
    const program = aProgram()
      .ofType(PromotionProgramType.GIFT_ITEM)
      .with({ discountMode: undefined, discountValue: undefined })
      .withCondition(aCondition({ type: PromotionConditionType.MIN_INVOICE_AMOUNT, minAmount: 200_000, multiplyGift: false }))
      .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'gift-item' })] })])
      .build();

    expect(strategy.compute(program, cart, new CartState()).status).toBe('not_met');
  });
  // QA #8 — see invoice-discount.strategy.spec.ts for the full story. A row with
  // no group predates the GROUPS_EMPTY rule and still hydrates out of the DB.
  it('treats a program with no group as not applicable instead of throwing (QA #8)', () => {
    const emptyGroupsProgram = aProgram().ofType(PromotionProgramType.GIFT_ITEM)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([aGroup({ lines: [aLine()] })])
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
