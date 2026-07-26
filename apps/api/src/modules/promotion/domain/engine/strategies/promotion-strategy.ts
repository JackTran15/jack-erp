import { PromotionProgramType } from '@erp/shared-interfaces';
import { PromotionProgram } from '../../model/promotion-program';
import { CartContext } from '../../model/cart';
import { LineDiscount, GiftOffer, SkippedProgramReason } from '../../model/evaluation';
import { CartState } from '../cart-state';

export type EligibilityResult = { eligible: true } | { eligible: false; reason: SkippedProgramReason };

export interface StrategyOutcome {
  discountAmount: number;
  lineDiscounts: LineDiscount[];
  gifts: GiftOffer[];
  /** Cart lines this outcome claims as a BR-001 resource — empty for gift/invoice-level strategies. */
  claimedLineIds: string[];
}

/**
 * A refinement of the ticket's `compute(): StrategyOutcome | null` — a bare
 * null can't tell the resolver *why* nothing was computed, and the resolver
 * needs to distinguish "condition never matched" from "matched, but every
 * targeted line is already claimed by an earlier program" (BR-001).
 */
export type StrategyComputeResult =
  | { status: 'applied'; outcome: StrategyOutcome }
  | { status: 'not_met' }
  | { status: 'resource_taken'; takenByLineId: string };

export interface PromotionStrategy {
  readonly type: PromotionProgramType;
  /** Cheap pre-check independent of cart contents (status/date/day/time/branch/customer). */
  isEligible(program: PromotionProgram, cart: CartContext): EligibilityResult;
  /** Compute the outcome against the *remaining* (unclaimed) cart state. */
  compute(program: PromotionProgram, cart: CartContext, state: CartState): StrategyComputeResult;
}
