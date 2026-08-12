import { PromotionProgramType, PromotionDiscountMode, PromotionLineRole, PromotionTargetType } from '@erp/shared-interfaces';
import { EvaluateCartHandler } from './evaluate-cart.handler';
import { EvaluateCartQuery } from './evaluate-cart.query';
import { EvaluateCartDto } from '../dto/evaluate-cart.dto';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { PromotionResolver } from '../../domain/engine/promotion-resolver';
import { aProgram, aGroup, aLine, aCatalogItem } from '../../domain/engine/__fixtures__/promotion-fixture';

const actor: ActorContext = { userId: 'user-1', organizationId: 'org-1', branchId: 'branch-1', roles: [] };

function baseDto(overrides: Partial<EvaluateCartDto> = {}): EvaluateCartDto {
  return {
    lines: [{ lineId: 'l1', itemId: 'sku-1', quantity: 1, unitPrice: 100_000 }],
    ...overrides,
  };
}

describe('EvaluateCartHandler', () => {
  let promotionRepo: { findActive: jest.Mock };
  let catalogReader: { loadItems: jest.Mock };
  let customerReader: { load: jest.Mock };
  let handler: EvaluateCartHandler;

  beforeEach(() => {
    promotionRepo = { findActive: jest.fn().mockResolvedValue([]) };
    catalogReader = { loadItems: jest.fn().mockResolvedValue(new Map([['sku-1', aCatalogItem({ itemId: 'sku-1', sellingPrice: 100_000 })]])) };
    customerReader = { load: jest.fn() };
    handler = new EvaluateCartHandler(promotionRepo as any, catalogReader as any, customerReader as any, new PromotionResolver());
  });

  it('throws UNKNOWN_ITEM (400) when a cart itemId is not in the catalog, without applying anything', async () => {
    catalogReader.loadItems.mockResolvedValue(new Map());

    await expect(handler.execute(new EvaluateCartQuery(baseDto(), actor))).rejects.toMatchObject({
      response: { code: 'UNKNOWN_ITEM', itemIds: ['sku-1'] },
    });
  });

  it('throws UNKNOWN_CUSTOMER (400) when customerId does not resolve', async () => {
    customerReader.load.mockResolvedValue(null);

    await expect(
      handler.execute(new EvaluateCartQuery(baseDto({ customerId: 'ghost-customer' }), actor)),
    ).rejects.toMatchObject({ response: { code: 'UNKNOWN_CUSTOMER' } });
  });

  it('defaults `at` to the server current time when omitted', async () => {
    const before = Date.now();
    await handler.execute(new EvaluateCartQuery(baseDto(), actor));
    const after = Date.now();

    const usedAt = promotionRepo.findActive.mock.calls[0][2] as Date;
    expect(usedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(usedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('uses the exact `at` value when supplied', async () => {
    await handler.execute(new EvaluateCartQuery(baseDto({ at: '2026-07-22T14:30:00.000Z' }), actor));

    const usedAt = promotionRepo.findActive.mock.calls[0][2] as Date;
    expect(usedAt.toISOString()).toBe('2026-07-22T14:30:00.000Z');
  });

  it('passes organizationId/branchId from the actor to findActive', async () => {
    await handler.execute(new EvaluateCartQuery(baseDto(), actor));

    expect(promotionRepo.findActive).toHaveBeenCalledWith('org-1', 'branch-1', expect.any(Date));
  });

  it('expands loadItems to include gift/reward ITEM targets that are not in the cart', async () => {
    const giftProgram = aProgram()
      .ofType(PromotionProgramType.GIFT_ITEM)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetType: PromotionTargetType.ITEM, targetId: 'gift-sku' })] })])
      .build();
    promotionRepo.findActive.mockResolvedValue([giftProgram]);

    await handler.execute(new EvaluateCartQuery(baseDto(), actor));

    const [, requestedItemIds] = catalogReader.loadItems.mock.calls[0];
    expect(requestedItemIds).toEqual(expect.arrayContaining(['sku-1', 'gift-sku']));
  });

  it('coordinates load -> resolve -> map without doing money math itself, and the response invariants hold', async () => {
    const program = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([
        aGroup({
          lines: [
            aLine({
              role: PromotionLineRole.REWARD,
              targetType: PromotionTargetType.ITEM,
              targetId: 'sku-1',
              discountMode: PromotionDiscountMode.PERCENT,
              discountValue: 30,
            }),
          ],
        }),
      ])
      .build();
    promotionRepo.findActive.mockResolvedValue([program]);

    const result = await handler.execute(new EvaluateCartQuery(baseDto(), actor));

    expect(result.appliedPrograms).toHaveLength(1);
    expect(result.appliedPrograms[0].lineDiscounts).toEqual([{ lineId: 'l1', discountAmount: 30_000, unitPriceAfter: 70_000 }]);
    const sumLineDiscounts = result.appliedPrograms[0].lineDiscounts.reduce((s: number, d: { discountAmount: number }) => s + d.discountAmount, 0);
    expect(sumLineDiscounts).toBe(result.appliedPrograms[0].discountAmount);
    expect(result.subtotal - result.promotionDiscount).toBe(result.amountAfterPromotion);
  });

  it('merges the resolved customer with the requested customerId into the cart context', async () => {
    customerReader.load.mockResolvedValue({ groupId: 'group-1', cardTierId: 'tier-1' });

    await handler.execute(new EvaluateCartQuery(baseDto({ customerId: 'customer-1' }), actor));

    expect(customerReader.load).toHaveBeenCalledWith('org-1', 'customer-1');
  });

  // T-09-01 / ADR-07 — excludedProgramIds must reach the resolver, not just
  // pass DTO validation.
  it('forwards excludedProgramIds to the resolver, excluding that program from applied', async () => {
    const program = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([
        aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetType: PromotionTargetType.ITEM, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 30 })] }),
      ])
      .build();
    promotionRepo.findActive.mockResolvedValue([program]);

    const result = await handler.execute(new EvaluateCartQuery(baseDto({ excludedProgramIds: [program.id!] }), actor));

    expect(result.appliedPrograms).toHaveLength(0);
    expect(result.skippedPrograms).toContainEqual({ programId: program.id, name: program.name, reason: 'EXCLUDED_BY_CASHIER' });
  });

  it('defaults excludedProgramIds to [] when omitted, so an eligible program still applies', async () => {
    const program = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([
        aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetType: PromotionTargetType.ITEM, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 30 })] }),
      ])
      .build();
    promotionRepo.findActive.mockResolvedValue([program]);

    const result = await handler.execute(new EvaluateCartQuery(baseDto(), actor));

    expect(result.appliedPrograms).toHaveLength(1);
  });
});
