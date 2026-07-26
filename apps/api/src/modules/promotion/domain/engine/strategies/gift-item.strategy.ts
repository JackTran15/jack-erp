import { PromotionProgramType, PromotionLineRole, PromotionTargetType, PromotionGiftMode } from '@erp/shared-interfaces';
import { PromotionProgram } from '../../model/promotion-program';
import { CartContext } from '../../model/cart';
import { GiftOffer } from '../../model/evaluation';
import { CartState } from '../cart-state';
import { evaluateCondition } from '../condition-evaluator';
import { checkGenericEligibility } from './eligibility';
import { EligibilityResult, PromotionStrategy, StrategyComputeResult } from './promotion-strategy';

export class GiftItemStrategy implements PromotionStrategy {
  readonly type = PromotionProgramType.GIFT_ITEM;

  isEligible(program: PromotionProgram, cart: CartContext): EligibilityResult {
    return checkGenericEligibility(program, cart);
  }

  compute(program: PromotionProgram, cart: CartContext, state: CartState): StrategyComputeResult {
    const group = program.groups[0];
    const rewardLines = group.lines.filter((line) => line.role === PromotionLineRole.REWARD);
    const conditionLines = group.lines.filter((line) => line.role === PromotionLineRole.CONDITION);

    const condition = evaluateCondition(program.condition, conditionLines, cart, state);
    if (!condition.met || rewardLines.length === 0) {
      return { status: 'not_met' };
    }

    // FR-041: floor(invoice total / min_amount) portions, minimum 1, only when multiply_gift is on.
    const multiplier =
      program.condition?.multiplyGift && program.condition.minAmount
        ? Math.max(1, Math.floor(condition.basisAmount / program.condition.minAmount))
        : 1;

    const gifts: GiftOffer[] = [];
    for (const reward of rewardLines) {
      if (reward.targetType !== PromotionTargetType.ITEM) continue;
      const catalogItem = cart.catalog.get(reward.targetId);
      if (!catalogItem) continue; // gift target no longer resolves — skip silently, don't throw

      gifts.push({
        itemId: catalogItem.itemId,
        itemCode: catalogItem.code,
        itemName: catalogItem.name,
        unit: catalogItem.unit,
        quantity: (reward.quantity ?? 1) * multiplier,
        unitPrice: catalogItem.sellingPrice,
        mode: program.giftMode ?? PromotionGiftMode.ONE_OF,
      });
    }

    if (gifts.length === 0) {
      return { status: 'not_met' };
    }

    return {
      status: 'applied',
      outcome: { discountAmount: 0, lineDiscounts: [], gifts, claimedLineIds: [] },
    };
  }
}
