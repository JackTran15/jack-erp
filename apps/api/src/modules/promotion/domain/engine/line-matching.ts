import { PromotionTargetType } from '@erp/shared-interfaces';
import { PromotionLine } from '../model/promotion-line';
import { CartContext, CartLine } from '../model/cart';

/**
 * Finds the first (by `sortOrder`) target line a cart line matches — CATEGORY
 * targets match via `categoryPathIds` (so a promotion on a parent group also
 * catches its children); a target whose own `targetId` no longer resolves to
 * anything in the catalog simply never matches (silently ignored, not thrown).
 */
export function findMatchingTarget(
  cartLine: CartLine,
  cart: CartContext,
  targets: PromotionLine[],
): PromotionLine | undefined {
  const catalogItem = cart.catalog.get(cartLine.itemId);
  if (!catalogItem) return undefined;

  const sorted = [...targets].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.find((target) => {
    switch (target.targetType) {
      case PromotionTargetType.ITEM:
        return target.targetId === cartLine.itemId;
      case PromotionTargetType.PRODUCT:
        return !!catalogItem.productId && target.targetId === catalogItem.productId;
      case PromotionTargetType.CATEGORY:
        return catalogItem.categoryPathIds.includes(target.targetId);
      default:
        return false;
    }
  });
}
