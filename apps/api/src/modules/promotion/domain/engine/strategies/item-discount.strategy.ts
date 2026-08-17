import { PromotionProgramType, PromotionLineRole } from '@erp/shared-interfaces';
import { PromotionProgram } from '../../model/promotion-program';
import { CartContext, CartLine } from '../../model/cart';
import { LineDiscount } from '../../model/evaluation';
import { CartState } from '../cart-state';
import { evaluateCondition } from '../condition-evaluator';
import { findMatchingTarget } from '../line-matching';
import { clamp, perUnitDiscount, lineTotal } from '../discount-math';
import { roundVnd } from '../../model/value-objects/money';
import { checkGenericEligibility } from './eligibility';
import { EligibilityResult, PromotionStrategy, StrategyComputeResult } from './promotion-strategy';

export class ItemDiscountStrategy implements PromotionStrategy {
  readonly type = PromotionProgramType.ITEM_DISCOUNT;

  isEligible(program: PromotionProgram, cart: CartContext): EligibilityResult {
    return checkGenericEligibility(program, cart);
  }

  compute(program: PromotionProgram, cart: CartContext, state: CartState): StrategyComputeResult {
    // A programme saved with no group at all is malformed data, not a cart
    // mismatch — before this guard `groups[0]` was undefined and the TypeError
    // escaped as a 500 from every price calculation, jamming the whole till
    // until someone deleted the promotion (QA #8). Treat it as "does not
    // apply" so one bad row cannot stop the counter selling.
    const group = program.groups[0];
    if (!group) return { status: 'not_met' };
    const rewardLines = group.lines.filter((line) => line.role === PromotionLineRole.REWARD);
    const conditionLines = group.lines.filter((line) => line.role === PromotionLineRole.CONDITION);

    const condition = evaluateCondition(program.condition, conditionLines, cart, state);
    if (!condition.met) {
      return { status: 'not_met' };
    }

    const matches = cart.lines
      .map((line) => ({ line, reward: findMatchingTarget(line, cart, rewardLines) }))
      .filter((m): m is { line: CartLine; reward: NonNullable<typeof m.reward> } => !!m.reward);

    if (matches.length === 0) {
      return { status: 'not_met' };
    }

    const unclaimed = matches.filter((m) => !state.isLineClaimed(m.line.lineId));
    if (unclaimed.length === 0) {
      return { status: 'resource_taken', takenByLineId: matches[0].line.lineId };
    }

    const lineDiscounts: LineDiscount[] = [];
    const claimedLineIds: string[] = [];
    let total = 0;

    for (const { line, reward } of unclaimed) {
      const maxDiscount = lineTotal(line);
      const perUnit = perUnitDiscount(line.unitPrice, reward.discountMode, reward.discountValue);
      const discountAmount = roundVnd(clamp(perUnit * line.quantity, 0, maxDiscount));
      const unitPriceAfter = Math.max(0, roundVnd(line.unitPrice - perUnit));

      lineDiscounts.push({ lineId: line.lineId, discountAmount, unitPriceAfter });
      claimedLineIds.push(line.lineId);
      total += discountAmount;
    }

    return {
      status: 'applied',
      outcome: { discountAmount: roundVnd(total), lineDiscounts, gifts: [], claimedLineIds },
    };
  }
}
