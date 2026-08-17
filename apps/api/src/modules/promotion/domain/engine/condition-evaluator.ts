import {
  PromotionConditionType,
  PromotionCalcBasis,
  PromotionGroupMatchMode,
  PromotionTargetType,
} from '@erp/shared-interfaces';
import { PromotionCondition } from '../model/promotion-condition';
import { PromotionLine } from '../model/promotion-line';
import { CartContext, CartLine } from '../model/cart';
import { CartState } from './cart-state';
import { sumLines } from './discount-math';

export interface ConditionEvaluationResult {
  met: boolean;
  basisAmount: number;
}

function lineInCategories(line: CartLine, cart: CartContext, categoryIds: string[]): boolean {
  const catalogItem = cart.catalog.get(line.itemId);
  if (!catalogItem) return false;
  return categoryIds.some((categoryId) => catalogItem.categoryPathIds.includes(categoryId));
}

/** { lines matching the basis, whether every required category group is represented in the cart }. */
function resolveBasisLines(
  condition: PromotionCondition,
  conditionLines: PromotionLine[],
  cart: CartContext,
  state: CartState,
): { lines: CartLine[]; groupsMet: boolean } {
  if (condition.calcBasis === PromotionCalcBasis.NON_PROMO_ITEMS) {
    return { lines: state.unclaimedLines(cart), groupsMet: true };
  }

  if (condition.calcBasis === PromotionCalcBasis.ITEM_CATEGORIES) {
    const categoryIds = conditionLines
      .filter((line) => line.targetType === PromotionTargetType.CATEGORY)
      .map((line) => line.targetId);

    const matchingLines = cart.lines.filter((line) => lineInCategories(line, cart, categoryIds));
    const groupsMet =
      condition.groupMatchMode === PromotionGroupMatchMode.ALL
        ? categoryIds.every((categoryId) => cart.lines.some((line) => lineInCategories(line, cart, [categoryId])))
        : matchingLines.length > 0;

    return { lines: matchingLines, groupsMet };
  }

  // ALL_ITEMS (default)
  return { lines: cart.lines, groupsMet: true };
}

/**
 * Evaluates the "apply conditions" tab (FR-040), shared by INVOICE_DISCOUNT,
 * ITEM_DISCOUNT, and GIFT_ITEM. `conditionLines` are this program's
 * `role=CONDITION` lines (only relevant for SPECIFIC_QUANTITY and
 * `calcBasis=ITEM_CATEGORIES`).
 */
export function evaluateCondition(
  condition: PromotionCondition | undefined,
  conditionLines: PromotionLine[],
  cart: CartContext,
  state: CartState,
): ConditionEvaluationResult {
  if (!condition || condition.type === PromotionConditionType.NONE) {
    return { met: true, basisAmount: sumLines(cart.lines) };
  }

  if (condition.type === PromotionConditionType.SPECIFIC_QUANTITY) {
    const requirements = conditionLines.filter((line) => line.targetType === PromotionTargetType.ITEM);
    const met = requirements.every((requirement) => {
      const totalQuantity = cart.lines
        .filter((line) => line.itemId === requirement.targetId)
        .reduce((sum, line) => sum + line.quantity, 0);
      return totalQuantity >= (requirement.quantity ?? 0);
    });
    return { met, basisAmount: sumLines(cart.lines) };
  }

  // MIN_INVOICE_AMOUNT
  const { lines, groupsMet } = resolveBasisLines(condition, conditionLines, cart, state);
  const basisAmount = sumLines(lines);
  return { met: groupsMet && basisAmount >= (condition.minAmount ?? 0), basisAmount };
}
