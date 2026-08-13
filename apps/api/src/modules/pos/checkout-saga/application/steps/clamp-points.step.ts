import { Injectable, Logger } from '@nestjs/common';
import { POINT_REDEMPTION_VALUE_VND } from '../../../../customer/loyalty.constants';
import { CheckoutContext, CheckoutStep } from '../checkout-step';

/**
 * Caps the points a checkout actually spends at the number that still buys
 * something, once the promotion engine has had its say.
 *
 * The redemption ceiling is set much earlier, by a separate HTTP call
 * (`PointsRedemptionService.applyRedemption`) against the draft — where
 * `discountAmount` holds only the cashier's manual discount, because the
 * promotion engine has not run yet. So a cart of 580,000 with a 116,000
 * promotion accepted 1,000 points (worth 500,000) against a remaining 464,000,
 * `computeAmountDue` clamped the negative result to 0, and the extra 36,000
 * worth of points was taken off the card and quietly thrown away.
 *
 * Placed after `resolve-funds` and immediately before `compute-totals`: that is
 * the first point where BOTH reductions are known — the engine's discount (from
 * `evaluate-promotion`) and the voucher, which `resolve-funds` folds into
 * `invoice.discountAmount`. Clamping any earlier would miss the voucher and
 * still over-redeem on a voucher sale.
 *
 * Writes the clamped value back onto `ctx.invoice` so every later step —
 * compute-totals, persist-invoice and redeem-points — reads the same number.
 * Floor, not ceil: rounding down leaves the remainder on the customer's card,
 * rounding up would discount more than the points cover.
 */
@Injectable()
export class ClampPointsStep implements CheckoutStep {
  readonly name = 'clamp-points';
  readonly phase = 'preflight' as const;

  private readonly logger = new Logger(ClampPointsStep.name);

  async execute(ctx: CheckoutContext): Promise<void> {
    const invoice = ctx.invoice;
    const items = ctx.items;
    if (!invoice || !items) {
      throw new Error('clamp-points ran before load-draft populated the context');
    }

    const requested = Number(invoice.pointsRedeemed ?? 0);
    if (requested <= 0 || !invoice.customerId) return;

    const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
    const manualDiscountAmount = Number(invoice.discountAmount ?? 0);
    const promotionDiscount = ctx.promotion?.promotionDiscount ?? 0;
    const depositAmount = Number(invoice.depositAmount ?? 0);

    const payableByPoints =
      subtotal - manualDiscountAmount - promotionDiscount - depositAmount;
    const maxPointsUsable = Math.max(
      0,
      Math.floor(payableByPoints / POINT_REDEMPTION_VALUE_VND),
    );
    const effectivePoints = Math.min(requested, maxPointsUsable);
    if (effectivePoints === requested) return;

    // A gap here is money: the customer asked to spend points the invoice
    // cannot absorb. Leave a trace rather than silently changing the number.
    this.logger.log(
      `Clamped point redemption on invoice ${invoice.id}: requested ${requested}, usable ${effectivePoints}`,
    );
    invoice.pointsRedeemed = effectivePoints;
    invoice.pointsDiscountAmount = effectivePoints * POINT_REDEMPTION_VALUE_VND;
  }
}
