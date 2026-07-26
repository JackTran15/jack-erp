import { PromotionDiscountMode } from '@erp/shared-interfaces';

/** A row of `promotion_tiers` — one step of a TIERED_DISCOUNT ladder. `toValue` undefined = unbounded (infinity). */
export interface PromotionTier {
  readonly id: string;
  readonly fromValue: number;
  readonly toValue?: number;
  readonly discountMode: PromotionDiscountMode;
  readonly discountValue: number;
  readonly sortOrder: number;
}
