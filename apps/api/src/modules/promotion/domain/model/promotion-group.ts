import { PromotionLine } from './promotion-line';
import { PromotionTier } from './promotion-tier';

/**
 * A row of `promotion_groups`. Only TIERED_DISCOUNT has more than one group
 * (numbered tabs "Group 1", "Group 2"...); every other promotion type has
 * exactly one implicit group at `ordinal = 0` that all of its lines attach to.
 */
export interface PromotionGroup {
  readonly id: string;
  readonly ordinal: number;
  readonly name?: string;
  readonly lines: PromotionLine[];
  readonly tiers: PromotionTier[];
}
