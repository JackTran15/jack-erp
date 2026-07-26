import {
  PromotionProgramType,
  PromotionLineRole,
  PromotionTargetType,
  PromotionBuyGetPolicy,
  PromotionGiftMode,
} from '@erp/shared-interfaces';
import { PromotionProgram } from '../../model/promotion-program';
import { PromotionGroup } from '../../model/promotion-group';
import { CartContext, CartLine } from '../../model/cart';
import { GiftOffer, LineDiscount } from '../../model/evaluation';
import { CartState } from '../cart-state';
import { findMatchingTarget } from '../line-matching';
import { clamp, lineTotal } from '../discount-math';
import { roundVnd } from '../../model/value-objects/money';
import { checkGenericEligibility } from './eligibility';
import { EligibilityResult, PromotionStrategy, StrategyComputeResult } from './promotion-strategy';

interface CartUnit {
  lineId: string;
  /** Per-unit price after the cashier's manual line discount — "cheapest" is ranked on this, not the catalog price. */
  unitPrice: number;
}

export class BuyMGetNStrategy implements PromotionStrategy {
  readonly type = PromotionProgramType.BUY_M_GET_N;

  isEligible(program: PromotionProgram, cart: CartContext): EligibilityResult {
    return checkGenericEligibility(program, cart);
  }

  /** No singleton pre-check needed here — the resolver already confirmed the gift slot is free before calling this. */
  compute(program: PromotionProgram, cart: CartContext, state: CartState): StrategyComputeResult {
    const group = program.groups[0];
    const conditionLines = group.lines.filter((line) => line.role === PromotionLineRole.CONDITION);
    const matches = cart.lines.filter((line) => !!findMatchingTarget(line, cart, conditionLines));

    if (matches.length === 0 || !program.buyQuantity || program.buyQuantity <= 0) {
      return { status: 'not_met' };
    }

    return program.buyGetPolicy === PromotionBuyGetPolicy.CHEAPEST
      ? this.computeCheapest(program, matches)
      : this.computeSpecific(program, group, matches, cart);
  }

  /** "Gift the cheapest item" mode (CHEAPEST) — the free units come out of the purchase itself; this is a discount, not a separate gift. */
  private computeCheapest(program: PromotionProgram, matches: CartLine[]): StrategyComputeResult {
    const units: CartUnit[] = matches.flatMap((line) => {
      const perUnitEffectivePrice = lineTotal(line) / line.quantity;
      return Array.from({ length: line.quantity }, () => ({ lineId: line.lineId, unitPrice: perUnitEffectivePrice }));
    });

    const giftQuantity = program.giftQuantity ?? 1;
    const freeCount = Math.floor(units.length / program.buyQuantity!) * giftQuantity;
    if (freeCount <= 0) {
      return { status: 'not_met' };
    }

    const cheapestFirst = [...units].sort((a, b) => a.unitPrice - b.unitPrice);
    const freeUnits = cheapestFirst.slice(0, freeCount);

    const discountByLine = new Map<string, number>();
    for (const unit of freeUnits) {
      discountByLine.set(unit.lineId, (discountByLine.get(unit.lineId) ?? 0) + unit.unitPrice);
    }

    const lineDiscounts: LineDiscount[] = [];
    let total = 0;
    for (const line of matches) {
      const rawDiscount = discountByLine.get(line.lineId);
      if (!rawDiscount) continue;

      const maxDiscount = lineTotal(line);
      const discountAmount = roundVnd(clamp(rawDiscount, 0, maxDiscount));
      const unitPriceAfter = Math.max(0, roundVnd(line.unitPrice - discountAmount / line.quantity));

      lineDiscounts.push({ lineId: line.lineId, discountAmount, unitPriceAfter });
      total += discountAmount;
    }

    return {
      status: 'applied',
      outcome: { discountAmount: roundVnd(total), lineDiscounts, gifts: [], claimedLineIds: [] },
    };
  }

  /** "Gift a specific item" mode (SPECIFIC) — a genuinely separate reward grid, gifted `floor(purchasedQty / buyQuantity)` times. */
  private computeSpecific(
    program: PromotionProgram,
    group: PromotionGroup,
    matches: CartLine[],
    cart: CartContext,
  ): StrategyComputeResult {
    const rewardLines = group.lines.filter((line) => line.role === PromotionLineRole.REWARD);
    if (rewardLines.length === 0) {
      return { status: 'not_met' };
    }

    const totalQuantity = matches.reduce((sum, line) => sum + line.quantity, 0);
    const times = Math.floor(totalQuantity / program.buyQuantity!);
    if (times <= 0) {
      return { status: 'not_met' };
    }

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
        quantity: (reward.quantity ?? 1) * times,
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
