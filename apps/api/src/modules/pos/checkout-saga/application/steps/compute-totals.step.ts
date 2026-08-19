import { BadRequestException, Injectable } from '@nestjs/common';
import type { AppliedProgram, LineDiscount } from '@erp/shared-interfaces';
import { POINT_EARN_VND_PER_POINT } from '../../../../customer/loyalty.constants';
import { computeAmountDue } from '../../../services/invoice-amount.util';
import { InvoicePaymentMethod, InvoiceStatus } from '../../../entities/invoice.entity';
import { CheckoutContext, CheckoutStep } from '../checkout-step';

const round = (v: number): number => Math.round(v * 100) / 100;

/**
 * Computes every amount checkout needs, via the same `computeAmountDue` helper
 * `checkout-invoice.service.ts` uses, so v2 can never drift from v1 on
 * arithmetic — deliberately not a reimplemented formula.
 *
 * `promotionDiscount` comes from whatever `evaluate-promotion` (an earlier
 * step) put on the context; this step does not know or care whether that was
 * the stub (T-01-06, always 0) or the real engine (T-04-03) — it defaults to 0
 * either way, so this file works correctly in isolation of that step.
 *
 * Parity target: checkout-invoice.service.ts:141-172, 215-220.
 */
@Injectable()
export class ComputeTotalsStep implements CheckoutStep {
  readonly name = 'compute-totals';
  readonly phase = 'preflight' as const;

  async execute(ctx: CheckoutContext): Promise<void> {
    const invoice = ctx.invoice;
    const items = ctx.items;
    if (!invoice || !items) {
      // Programming error, not a user-facing failure: some earlier step must
      // populate ctx.invoice/ctx.items before this one runs. Not an
      // HttpException on purpose — the orchestrator maps it to 500
      // CHECKOUT_FAILED rather than inventing a business error code for it.
      throw new Error(
        'compute-totals ran before load-draft populated the context',
      );
    }

    const subtotal = items.reduce(
      (sum, item) => sum + Number(item.lineTotal),
      0,
    );
    const manualDiscountAmount = Number(invoice.discountAmount ?? 0);
    const promotionDiscount = ctx.promotion?.promotionDiscount ?? 0;
    const discountAmount = manualDiscountAmount + promotionDiscount;
    const pointsDiscountAmount = Number(invoice.pointsDiscountAmount ?? 0);
    const depositAmount = Number(invoice.depositAmount ?? 0);

    // The promotion engine already guarantees no line's discount exceeds its
    // own gross amount (AC-29 of the promotion-programs-engine feature), but
    // this is money — a cheap re-check here costs nothing and catches a
    // corrupted/forged response before it reaches computeAmountDue. Combines
    // the same two sources as invoice.discountAmount does for the whole
    // invoice (see persist-invoice.step.ts): the manual per-line discount
    // already on the draft, plus whatever the engine assigned to that line.
    const promotionLineDiscounts = (ctx.promotion?.lineDiscounts ?? []) as LineDiscount[];
    const promotionDiscountByLineId = new Map(
      promotionLineDiscounts.map((ld) => [ld.lineId, ld.discountAmount]),
    );
    for (const item of items) {
      const lineGross = Number(item.quantity) * Number(item.unitPrice);
      const totalLineDiscount =
        Number(item.lineDiscount ?? 0) + (promotionDiscountByLineId.get(item.id) ?? 0);
      if (totalLineDiscount > lineGross) {
        throw new Error(
          `Line ${item.id} total discount (${totalLineDiscount}) exceeds its gross amount (${lineGross})`,
        );
      }
    }

    const amountDue = computeAmountDue({
      subtotal,
      discountAmount,
      pointsDiscountAmount,
      depositAmount,
    });

    const totalPaid = round(
      ctx.input.payments.reduce((sum, p) => sum + p.amount, 0),
    );
    const remainder = round(amountDue - totalPaid);
    const pointsEarned = Math.floor(amountDue / POINT_EARN_VND_PER_POINT);

    // ADR-02: computed exactly once, here — persist-invoice and enqueue-outbox both
    // read ctx.totals.pointsBlocked rather than re-deriving it. Does not need to filter
    // by type === INVOICE_DISCOUNT: T-03-01 already guarantees accruePoints is undefined
    // (never false) on every non-invoice-discount applied program, so this check is
    // naturally correct without an extra type guard.
    const appliedPrograms = (ctx.promotion?.appliedPrograms ?? []) as AppliedProgram[];
    const pointsBlocked = appliedPrograms.some((p) => p.accruePoints === false);

    if (totalPaid > amountDue) {
      throw new BadRequestException({
        code: 'PAYMENT_INVALID',
        message: `Total payments (${totalPaid}) exceed the amount due (${amountDue})`,
      });
    }

    // Kept change is cash tendered above `amountDue` that the customer left
    // behind. It is deliberately not part of `payments` (v1 parity): an invoice
    // can never be settled for more than it is worth, so the surplus is booked
    // as other income instead. Same two guards v1 applies.
    const keptChange = round(Number(ctx.input.keptChangeAmount ?? 0));
    if (keptChange > 0) {
      if (remainder > 0) {
        throw new BadRequestException({
          code: 'PAYMENT_INVALID',
          message: `Kept change (${keptChange}) requires the invoice to be fully settled (remaining ${remainder})`,
        });
      }
      if (
        !ctx.input.payments.some(
          (p) => p.paymentMethod === InvoicePaymentMethod.CASH,
        )
      ) {
        throw new BadRequestException({
          code: 'PAYMENT_INVALID',
          message: 'Kept change requires at least one cash payment line',
        });
      }
    }

    if (remainder > 0 && !invoice.customerId) {
      throw new BadRequestException({
        code: 'PAYMENT_INVALID',
        message:
          'Invoice must have a customer when there is a remaining debt balance',
      });
    }

    // resolve-accounts (an earlier step) always attempts RECEIVABLE and
    // swallows "not configured" into undefined, because it runs before
    // remainder is known. Only now, knowing there is an actual debt, do we
    // enforce that RECEIVABLE must exist — reproducing v1's exact behaviour
    // (an org that never sells on credit is never forced to configure one).
    if (remainder > 0 && !ctx.accounts?.receivableAccountId) {
      throw new BadRequestException({
        code: 'ACCOUNT_NOT_CONFIGURED',
        message: `No default RECEIVABLE account configured for organization ${ctx.actor.organizationId}`,
      });
    }

    const newStatus =
      remainder <= 0
        ? InvoiceStatus.PAID
        : totalPaid > 0
          ? InvoiceStatus.PARTIAL_DEBT
          : InvoiceStatus.DEBT;

    ctx.totals = {
      subtotal,
      manualDiscountAmount,
      promotionDiscount,
      pointsDiscountAmount,
      depositAmount,
      amountDue,
      totalPaid,
      remainder,
      keptChange,
      pointsEarned,
      pointsBlocked,
      newStatus,
    };
  }
}
