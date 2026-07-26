import {
  PromotionLineRole,
  PromotionTargetType,
  PromotionDiscountMode,
} from '@erp/shared-interfaces';

/**
 * A row of `promotion_lines` — either a condition (what the customer must buy)
 * or a reward (what gets discounted/gifted), depending on `role`.
 */
export interface PromotionLine {
  readonly id: string;
  readonly role: PromotionLineRole;
  readonly targetType: PromotionTargetType;
  /** Polymorphic across items/products/inventory_item_categories — not validated here. */
  readonly targetId: string;
  readonly quantity?: number;
  readonly discountMode?: PromotionDiscountMode;
  readonly discountValue?: number;
  /** "Selling price <=" filter column on the gift-item grid (FR-033). */
  readonly maxUnitPrice?: number;
  readonly sortOrder: number;
}
