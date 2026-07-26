import { PromotionProgramType, PromotionBuyGetPolicy, PromotionLineRole, PromotionGiftMode } from '@erp/shared-interfaces';
import { BuyMGetNStrategy } from './buy-m-get-n.strategy';
import { CartState } from '../cart-state';
import { CartLine } from '../../model/cart';
import { CatalogItemView } from '../../ports/catalog-reader.port';
import { aProgram, aGroup, aLine, aCart, aCartLine, aCatalogItem } from '../__fixtures__/promotion-fixture';

function withGiftCatalog(lines: CartLine[], ...giftItems: CatalogItemView[]): Map<string, CatalogItemView> {
  const catalog = new Map(lines.map((line) => [line.itemId, aCatalogItem({ itemId: line.itemId, sellingPrice: line.unitPrice })]));
  for (const giftItem of giftItems) catalog.set(giftItem.itemId, giftItem);
  return catalog;
}

describe('BuyMGetNStrategy', () => {
  const strategy = new BuyMGetNStrategy();

  describe('CHEAPEST policy', () => {
    it('AC-09: buy 3 get 1 free; a 100k/200k/300k cart discounts exactly the 100k item', () => {
      const lines = [
        aCartLine({ lineId: 'l1', itemId: 'sku-condition', unitPrice: 100_000, quantity: 1 }),
        aCartLine({ lineId: 'l2', itemId: 'sku-condition', unitPrice: 200_000, quantity: 1 }),
        aCartLine({ lineId: 'l3', itemId: 'sku-condition', unitPrice: 300_000, quantity: 1 }),
      ];
      const program = aProgram()
        .ofType(PromotionProgramType.BUY_M_GET_N)
        .with({ discountMode: undefined, discountValue: undefined, buyGetPolicy: PromotionBuyGetPolicy.CHEAPEST, buyQuantity: 3, giftQuantity: 1 })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.CONDITION, targetId: 'sku-condition' })] })])
        .build();
      const cart = aCart({ lines });

      const result = strategy.compute(program, cart, new CartState());
      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('unreachable');
      expect(result.outcome.discountAmount).toBe(100_000);
      expect(result.outcome.lineDiscounts).toEqual([{ lineId: 'l1', discountAmount: 100_000, unitPriceAfter: 0 }]);
      expect(result.outcome.gifts).toEqual([]);
    });

    it('expands a single line with quantity > 1 into individual units for ranking', () => {
      // One line of 3 units @ 100,000 each = same shape as AC-09's 3 separate lines at equal price.
      const lines = [aCartLine({ lineId: 'l1', itemId: 'sku-condition', unitPrice: 100_000, quantity: 3 })];
      const program = aProgram()
        .ofType(PromotionProgramType.BUY_M_GET_N)
        .with({ discountMode: undefined, discountValue: undefined, buyGetPolicy: PromotionBuyGetPolicy.CHEAPEST, buyQuantity: 3, giftQuantity: 1 })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.CONDITION, targetId: 'sku-condition' })] })])
        .build();
      const cart = aCart({ lines });

      const result = strategy.compute(program, cart, new CartState());
      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('unreachable');
      expect(result.outcome.discountAmount).toBe(100_000); // 1 of the 3 units is free
    });

    it('does not apply when fewer than buyQuantity units are in the cart', () => {
      const lines = [aCartLine({ itemId: 'sku-condition', unitPrice: 100_000, quantity: 2 })];
      const program = aProgram()
        .ofType(PromotionProgramType.BUY_M_GET_N)
        .with({ discountMode: undefined, discountValue: undefined, buyGetPolicy: PromotionBuyGetPolicy.CHEAPEST, buyQuantity: 3, giftQuantity: 1 })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.CONDITION, targetId: 'sku-condition' })] })])
        .build();
      const cart = aCart({ lines });

      expect(strategy.compute(program, cart, new CartState()).status).toBe('not_met');
    });
  });

  describe('SPECIFIC policy', () => {
    it('gifts a separate reward item floor(purchasedQty / buyQuantity) times', () => {
      const lines = [aCartLine({ itemId: 'sku-condition', unitPrice: 50_000, quantity: 6 })];
      const cart = aCart({
        lines,
        catalog: withGiftCatalog(lines, aCatalogItem({ itemId: 'gift-item', code: 'GIFT', name: 'Qua tang', sellingPrice: 10_000 })),
      });
      const program = aProgram()
        .ofType(PromotionProgramType.BUY_M_GET_N)
        .with({ discountMode: undefined, discountValue: undefined, buyGetPolicy: PromotionBuyGetPolicy.SPECIFIC, buyQuantity: 3, giftQuantity: 1 })
        .withGroups([
          aGroup({
            lines: [
              aLine({ role: PromotionLineRole.CONDITION, targetId: 'sku-condition' }),
              aLine({ role: PromotionLineRole.REWARD, targetId: 'gift-item' }),
            ],
          }),
        ])
        .build();

      const result = strategy.compute(program, cart, new CartState());
      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('unreachable');
      // floor(6 / 3) = 2 times -> giftQuantity 1 each = 2 units gifted.
      expect(result.outcome.gifts).toEqual([
        { itemId: 'gift-item', itemCode: 'GIFT', itemName: 'Qua tang', unit: 'cai', quantity: 2, unitPrice: 10_000, mode: PromotionGiftMode.ONE_OF },
      ]);
      expect(result.outcome.discountAmount).toBe(0);
    });

    it('does not apply when the purchased quantity falls short of buyQuantity', () => {
      const lines = [aCartLine({ itemId: 'sku-condition', unitPrice: 50_000, quantity: 2 })];
      const cart = aCart({
        lines,
        catalog: withGiftCatalog(lines, aCatalogItem({ itemId: 'gift-item', sellingPrice: 10_000 })),
      });
      const program = aProgram()
        .ofType(PromotionProgramType.BUY_M_GET_N)
        .with({ discountMode: undefined, discountValue: undefined, buyGetPolicy: PromotionBuyGetPolicy.SPECIFIC, buyQuantity: 3, giftQuantity: 1 })
        .withGroups([
          aGroup({
            lines: [
              aLine({ role: PromotionLineRole.CONDITION, targetId: 'sku-condition' }),
              aLine({ role: PromotionLineRole.REWARD, targetId: 'gift-item' }),
            ],
          }),
        ])
        .build();

      expect(strategy.compute(program, cart, new CartState()).status).toBe('not_met');
    });
  });
});
