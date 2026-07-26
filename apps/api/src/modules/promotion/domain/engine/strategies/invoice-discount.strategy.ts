import { PromotionProgramType, PromotionLineRole, PromotionInvoiceScope } from '@erp/shared-interfaces';
import { PromotionProgram } from '../../model/promotion-program';
import { CartContext } from '../../model/cart';
import { CartState } from '../cart-state';
import { evaluateCondition } from '../condition-evaluator';
import { clamp, totalDiscount, sumLines, allocateProportionally } from '../discount-math';
import { roundVnd } from '../../model/value-objects/money';
import { checkGenericEligibility } from './eligibility';
import { EligibilityResult, PromotionStrategy, StrategyComputeResult } from './promotion-strategy';

export class InvoiceDiscountStrategy implements PromotionStrategy {
  readonly type = PromotionProgramType.INVOICE_DISCOUNT;

  isEligible(program: PromotionProgram, cart: CartContext): EligibilityResult {
    return checkGenericEligibility(program, cart);
  }

  /**
   * The resolver only calls this once it has already confirmed the single
   * invoice-discount slot is free (BR-001), so this never needs to report
   * 'resource_taken' itself — it claims no individual lines, only the slot.
   */
  compute(program: PromotionProgram, cart: CartContext, state: CartState): StrategyComputeResult {
    const group = program.groups[0];
    const conditionLines = group.lines.filter((line) => line.role === PromotionLineRole.CONDITION);
    const condition = evaluateCondition(program.condition, conditionLines, cart, state);
    if (!condition.met) {
      return { status: 'not_met' };
    }

    const base =
      program.invoiceScope === PromotionInvoiceScope.NON_PROMO_ONLY ? state.unclaimedLines(cart) : cart.lines;
    const baseTotal = sumLines(base);
    if (base.length === 0 || baseTotal <= 0) {
      return { status: 'not_met' };
    }

    const discountAmount = roundVnd(
      clamp(totalDiscount(baseTotal, program.discountMode, program.discountValue), 0, baseTotal),
    );
    if (discountAmount <= 0) {
      return { status: 'not_met' };
    }

    return {
      status: 'applied',
      outcome: {
        discountAmount,
        lineDiscounts: allocateProportionally(base, discountAmount),
        gifts: [],
        claimedLineIds: [],
      },
    };
  }
}
