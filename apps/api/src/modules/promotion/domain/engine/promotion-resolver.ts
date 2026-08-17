import { PromotionProgramType } from '@erp/shared-interfaces';
import { PromotionProgram } from '../model/promotion-program';
import { CartContext } from '../model/cart';
import { AppliedProgram, AvailableProgram, PromotionEvaluation, SkippedProgram } from '../model/evaluation';
import { roundVnd } from '../model/value-objects/money';
import { CartState } from './cart-state';
import { sumLines } from './discount-math';
import { PromotionStrategy, StrategyComputeResult } from './strategies/promotion-strategy';
import { InvoiceDiscountStrategy } from './strategies/invoice-discount.strategy';
import { ItemDiscountStrategy } from './strategies/item-discount.strategy';
import { TieredDiscountStrategy } from './strategies/tiered-discount.strategy';
import { GiftItemStrategy } from './strategies/gift-item.strategy';
import { BuyMGetNStrategy } from './strategies/buy-m-get-n.strategy';

const LINE_CLAIMING_TYPES = new Set<PromotionProgramType>([
  PromotionProgramType.ITEM_DISCOUNT,
  PromotionProgramType.TIERED_DISCOUNT,
]);
const GIFT_TYPES = new Set<PromotionProgramType>([
  PromotionProgramType.GIFT_ITEM,
  PromotionProgramType.BUY_M_GET_N,
]);
// The remaining type, PromotionProgramType.INVOICE_DISCOUNT, is phase 3 (invoice-level).

/** Pure — no I/O, no `Date.now()` (the clock always comes from `cart.at`). Same input always yields the same output. */
export class PromotionResolver {
  private readonly strategies: Record<PromotionProgramType, PromotionStrategy> = {
    [PromotionProgramType.INVOICE_DISCOUNT]: new InvoiceDiscountStrategy(),
    [PromotionProgramType.ITEM_DISCOUNT]: new ItemDiscountStrategy(),
    [PromotionProgramType.TIERED_DISCOUNT]: new TieredDiscountStrategy(),
    [PromotionProgramType.GIFT_ITEM]: new GiftItemStrategy(),
    [PromotionProgramType.BUY_M_GET_N]: new BuyMGetNStrategy(),
  };

  resolve(programs: PromotionProgram[], cart: CartContext): PromotionEvaluation {
    const eligible: PromotionProgram[] = [];
    const skipped: SkippedProgram[] = [];

    for (const program of programs) {
      const result = this.strategyFor(program.type).isEligible(program, cart);
      if (result.eligible) {
        eligible.push(program);
      } else {
        skipped.push({ programId: program.id!, name: program.name, reason: result.reason });
      }
    }

    // ADR-07: `excludedProgramIds` always means "keep this program out of the
    // race entirely" — unlike `selectedProgramIds` below (ADR-03), which only
    // ever adds a program in. Filtered here, before `selectedProgramIds` is
    // even consulted, so an excluded program can never win a resource even if
    // it's `autoApply` or also present in `selectedProgramIds` (exclusion
    // wins on conflict — see ADR-07).
    const excludedIds = new Set(cart.excludedProgramIds);
    const excluded = eligible.filter((p) => excludedIds.has(p.id!));
    const remaining = eligible.filter((p) => !excludedIds.has(p.id!));
    for (const program of excluded) {
      skipped.push({ programId: program.id!, name: program.name, reason: 'EXCLUDED_BY_CASHIER' });
    }

    const runnable = remaining.filter((p) => p.autoApply || cart.selectedProgramIds.includes(p.id!));
    const notSelected = remaining.filter((p) => !p.autoApply && !cart.selectedProgramIds.includes(p.id!));

    // ADR-03: `selectedProgramIds` carries a second meaning here — a program the
    // cashier explicitly picked wins any contested resource ahead of `priority`,
    // not just "is allowed to run" (that's the `runnable` filter above). Same
    // selection-tier ⇒ priority as before; still tied ⇒ programId, so the result
    // never depends on the input array's order (`programs` has no defined order).
    const sorted = [...runnable].sort((a, b) => {
      const aSelected = cart.selectedProgramIds.includes(a.id!);
      const bSelected = cart.selectedProgramIds.includes(b.id!);
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      const createdDelta = (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
      if (createdDelta !== 0) return createdDelta;
      return a.id! < b.id! ? -1 : a.id! > b.id! ? 1 : 0;
    });

    const state = new CartState();
    const applied: AppliedProgram[] = [];

    for (const program of sorted.filter((p) => LINE_CLAIMING_TYPES.has(p.type))) {
      this.runLineClaimingPhase(program, cart, state, applied, skipped);
    }
    for (const program of sorted.filter((p) => GIFT_TYPES.has(p.type))) {
      this.runSingletonPhase(program, cart, state, applied, skipped, 'gift');
    }
    for (const program of sorted.filter((p) => p.type === PromotionProgramType.INVOICE_DISCOUNT)) {
      this.runSingletonPhase(program, cart, state, applied, skipped, 'invoice');
    }

    const availablePrograms: AvailableProgram[] = notSelected.map((program) => ({
      programId: program.id!,
      code: program.code,
      name: program.name,
      type: program.type,
      autoApply: program.autoApply,
      estimatedDiscount: this.estimateDiscount(program, cart),
    }));
    for (const program of notSelected) {
      skipped.push({ programId: program.id!, name: program.name, reason: 'NOT_SELECTED' });
    }

    const subtotal = roundVnd(sumLines(cart.lines));
    const promotionDiscount = roundVnd(applied.reduce((sum, p) => sum + p.discountAmount, 0));

    return {
      subtotal,
      promotionDiscount,
      amountAfterPromotion: subtotal - promotionDiscount,
      appliedPrograms: applied,
      availablePrograms,
      skippedPrograms: skipped,
    };
  }

  private strategyFor(type: PromotionProgramType): PromotionStrategy {
    return this.strategies[type];
  }

  private runLineClaimingPhase(
    program: PromotionProgram,
    cart: CartContext,
    state: CartState,
    applied: AppliedProgram[],
    skipped: SkippedProgram[],
  ): void {
    const result = this.strategyFor(program.type).compute(program, cart, state);

    if (result.status === 'not_met') {
      skipped.push({ programId: program.id!, name: program.name, reason: 'CONDITION_NOT_MET' });
      return;
    }
    if (result.status === 'resource_taken') {
      skipped.push({
        programId: program.id!,
        name: program.name,
        reason: 'RESOURCE_TAKEN',
        takenBy: state.lineOwner(result.takenByLineId),
      });
      return;
    }

    state.claimLines(result.outcome.claimedLineIds, program.id!);
    applied.push(this.toAppliedProgram(program, result));
  }

  private runSingletonPhase(
    program: PromotionProgram,
    cart: CartContext,
    state: CartState,
    applied: AppliedProgram[],
    skipped: SkippedProgram[],
    kind: 'gift' | 'invoice',
  ): void {
    const isTaken = kind === 'gift' ? state.isGiftSlotTaken() : state.isInvoiceDiscountTaken();
    if (isTaken) {
      const owner = kind === 'gift' ? state.giftSlotOwner() : state.invoiceDiscountOwner();
      skipped.push({ programId: program.id!, name: program.name, reason: 'RESOURCE_TAKEN', takenBy: owner });
      return;
    }

    const result = this.strategyFor(program.type).compute(program, cart, state);
    if (result.status !== 'applied') {
      skipped.push({ programId: program.id!, name: program.name, reason: 'CONDITION_NOT_MET' });
      return;
    }

    if (kind === 'gift') state.claimGiftSlot(program.id!);
    else state.claimInvoiceDiscount(program.id!);
    applied.push(this.toAppliedProgram(program, result));
  }

  private estimateDiscount(program: PromotionProgram, cart: CartContext): number {
    const result = this.strategyFor(program.type).compute(program, cart, new CartState());
    return result.status === 'applied' ? result.outcome.discountAmount : 0;
  }

  private toAppliedProgram(
    program: PromotionProgram,
    result: Extract<StrategyComputeResult, { status: 'applied' }>,
  ): AppliedProgram {
    return {
      programId: program.id!,
      code: program.code,
      name: program.name,
      type: program.type,
      priority: program.priority,
      discountAmount: result.outcome.discountAmount,
      lineDiscounts: result.outcome.lineDiscounts,
      gifts: result.outcome.gifts,
      // Only INVOICE_DISCOUNT has one mode/value at program level — see the
      // docblock on AppliedProgram.discountMode. Others stay undefined.
      ...(program.type === PromotionProgramType.INVOICE_DISCOUNT
        ? { discountMode: program.discountMode, discountValue: program.discountValue }
        : {}),
    };
  }
}
