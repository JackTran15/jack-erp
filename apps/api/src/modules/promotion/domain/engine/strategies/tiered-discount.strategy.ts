import {
  PromotionProgramType,
  PromotionLineRole,
  PromotionTierBasis,
  PromotionTierScope,
} from '@erp/shared-interfaces';
import { PromotionProgram } from '../../model/promotion-program';
import { PromotionTier } from '../../model/promotion-tier';
import { CartContext, CartLine } from '../../model/cart';
import { LineDiscount } from '../../model/evaluation';
import { CartState } from '../cart-state';
import { findMatchingTarget } from '../line-matching';
import { clamp, perUnitDiscount, totalDiscount, sumLines, allocateProportionally, lineTotal } from '../discount-math';
import { roundVnd } from '../../model/value-objects/money';
import { checkGenericEligibility } from './eligibility';
import { EligibilityResult, PromotionStrategy, StrategyComputeResult } from './promotion-strategy';

function findTier(tiers: PromotionTier[], basisValue: number): PromotionTier | undefined {
  return tiers.find((tier) => tier.fromValue <= basisValue && (tier.toValue === undefined || basisValue <= tier.toValue));
}

interface GroupResult {
  discountAmount: number;
  lineDiscounts: LineDiscount[];
  claimedLineIds: string[];
}

export class TieredDiscountStrategy implements PromotionStrategy {
  readonly type = PromotionProgramType.TIERED_DISCOUNT;

  isEligible(program: PromotionProgram, cart: CartContext): EligibilityResult {
    return checkGenericEligibility(program, cart);
  }

  compute(program: PromotionProgram, cart: CartContext, state: CartState): StrategyComputeResult {
    if (program.tierBasis === PromotionTierBasis.INVOICE_VALUE) {
      return this.computeInvoiceValue(program, cart);
    }
    return this.computePerGroup(program, cart, state);
  }

  /** `INVOICE_VALUE` ignores groups/lines entirely — one bracket table, applied to the whole cart. */
  private computeInvoiceValue(program: PromotionProgram, cart: CartContext): StrategyComputeResult {
    const group = program.groups[0];
    const basisValue = sumLines(cart.lines);
    const tier = findTier(group.tiers, basisValue);
    if (!tier || basisValue <= 0) {
      return { status: 'not_met' };
    }

    let discountAmount = totalDiscount(basisValue, tier.discountMode, tier.discountValue);
    if (program.maxDiscountAmount !== undefined) {
      discountAmount = Math.min(discountAmount, program.maxDiscountAmount);
    }
    discountAmount = roundVnd(clamp(discountAmount, 0, basisValue));
    if (discountAmount <= 0) {
      return { status: 'not_met' };
    }

    return {
      status: 'applied',
      outcome: {
        discountAmount,
        lineDiscounts: allocateProportionally(cart.lines, discountAmount),
        gifts: [],
        // The whole invoice was the basis for this tier — every line is considered spent by it.
        claimedLineIds: cart.lines.map((line) => line.lineId),
      },
    };
  }

  private computePerGroup(program: PromotionProgram, cart: CartContext, state: CartState): StrategyComputeResult {
    let anyMatch = false;
    let anyUnclaimedMatch = false;
    let firstClaimedLineId: string | undefined;
    const groupResults: GroupResult[] = [];

    for (const group of program.groups) {
      const rewardLines = group.lines.filter((line) => line.role === PromotionLineRole.REWARD);
      const matches = cart.lines
        .map((line) => ({ line, reward: findMatchingTarget(line, cart, rewardLines) }))
        .filter((m): m is { line: CartLine; reward: NonNullable<typeof m.reward> } => !!m.reward);

      if (matches.length === 0) continue;
      anyMatch = true;

      const unclaimed = matches.filter((m) => !state.isLineClaimed(m.line.lineId));
      if (unclaimed.length === 0) {
        firstClaimedLineId ??= matches[0].line.lineId;
        continue;
      }
      anyUnclaimedMatch = true;

      const unclaimedLines = unclaimed.map((m) => m.line);
      const basisValue =
        program.tierBasis === PromotionTierBasis.QUANTITY
          ? unclaimedLines.reduce((sum, line) => sum + line.quantity, 0)
          : sumLines(unclaimedLines);

      const tier = findTier(group.tiers, basisValue);
      if (!tier) continue;

      groupResults.push(this.computeGroupDiscount(program, unclaimed, tier));
    }

    if (!anyMatch) {
      return { status: 'not_met' };
    }
    if (!anyUnclaimedMatch) {
      return { status: 'resource_taken', takenByLineId: firstClaimedLineId! };
    }
    if (groupResults.length === 0) {
      // Matching lines exist but none reached even the first tier's threshold.
      return { status: 'not_met' };
    }

    return {
      status: 'applied',
      outcome: {
        discountAmount: roundVnd(groupResults.reduce((sum, r) => sum + r.discountAmount, 0)),
        lineDiscounts: groupResults.flatMap((r) => r.lineDiscounts),
        gifts: [],
        claimedLineIds: groupResults.flatMap((r) => r.claimedLineIds),
      },
    };
  }

  private computeGroupDiscount(
    program: PromotionProgram,
    matches: { line: CartLine }[],
    tier: PromotionTier,
  ): GroupResult {
    const lines = matches.map((m) => m.line);

    if (program.tierScope === PromotionTierScope.ALL_ITEMS_IN_GROUP) {
      const groupTotal = sumLines(lines);
      const discountAmount = roundVnd(clamp(totalDiscount(groupTotal, tier.discountMode, tier.discountValue), 0, groupTotal));
      return {
        discountAmount,
        lineDiscounts: allocateProportionally(lines, discountAmount),
        claimedLineIds: lines.map((line) => line.lineId),
      };
    }

    // PER_ITEM (default)
    const lineDiscounts: LineDiscount[] = [];
    let total = 0;
    for (const line of lines) {
      const maxDiscount = lineTotal(line);
      const perUnit = perUnitDiscount(line.unitPrice, tier.discountMode, tier.discountValue);
      const discountAmount = roundVnd(clamp(perUnit * line.quantity, 0, maxDiscount));
      lineDiscounts.push({
        lineId: line.lineId,
        discountAmount,
        unitPriceAfter: Math.max(0, roundVnd(line.unitPrice - perUnit)),
      });
      total += discountAmount;
    }

    return { discountAmount: roundVnd(total), lineDiscounts, claimedLineIds: lines.map((line) => line.lineId) };
  }
}
