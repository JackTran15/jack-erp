import { InvoiceType } from '../entities/invoice.entity';

/**
 * Canonical amount-due formula for an invoice. Every recompute site (draft
 * create/update, promotion apply/remove, point redemption, checkout) must use
 * this helper so promotion discounts, loyalty point-redemption discounts,
 * deposits and the delivery fee all land on the amount consistently.
 *
 * Shape of the formula (ADR-04 / A-22):
 *
 *   goods = max(0, subtotal - discount - pointsDiscount - deposit)
 *   due   = round2(goods + shippingFeeAmount)
 *
 * The clamp wraps the GOODS part only, never the whole expression. A discount
 * or a point redemption bigger than the goods subtotal leaves the goods part at
 * 0 and the customer still owes the delivery fee in full — the fee is money the
 * shipper hands over, not something a promotion may eat. Equally, the goods
 * part may not go negative and then be rescued by the fee, which is why the
 * clamp happens before the fee is added rather than after.
 *
 * Rounding happens once, at the end. Do not round the goods part separately.
 *
 * The field is named `shippingFeeAmount` to match `InvoiceEntity`, so the
 * callers that pass an invoice entity straight in pick the fee up on their own;
 * a caller that builds an object literal and forgets the fee gets a silent 0,
 * which is correct for a normal counter sale and wrong for a web order — check
 * that with a fee != 0 case, not by reading the call site.
 *
 * Every numeric column here comes back from TypeORM as a STRING despite being
 * declared `number`, hence `Number(...)` on each input.
 */
export function computeAmountDue(invoice: {
  subtotal: number | string;
  discountAmount?: number | string | null;
  pointsDiscountAmount?: number | string | null;
  depositAmount?: number | string | null;
  shippingFeeAmount?: number | string | null;
}): number {
  const subtotal = Number(invoice.subtotal ?? 0);
  const discount = Number(invoice.discountAmount ?? 0);
  const pointsDiscount = Number(invoice.pointsDiscountAmount ?? 0);
  const deposit = Number(invoice.depositAmount ?? 0);
  const shippingFee = Number(invoice.shippingFeeAmount ?? 0);
  const goods = Math.max(0, subtotal - discount - pointsDiscount - deposit);
  return Math.round((goods + shippingFee) * 100) / 100;
}

/**
 * SQL twin of the frontend's `getInvoiceSignedTotal`
 * (`apps/pos-web/src/lib/common/invoiceAmount.ts`): the "Tổng thanh toán" the
 * three POS invoice grids display, where a refund direction carries a negative
 * sign.
 *
 * Returns / exchanges use `net_amount` because the refund path never goes
 * through `computeAmountDue` at all: `checkout-return.service.ts` writes
 * `amountDue = max(netAmount, 0)` directly, so a refund stores `amount_due = 0`
 * and a naive `SUM(amount_due)` would quietly over-report. On the current dev
 * data that is the difference between 26.337.000 (right) and 28.927.000
 * (wrong-but-plausible). (That sentence used to blame the clamp inside
 * `computeAmountDue`; after T-04-02 that clamp wraps the GOODS part only and
 * never the whole `amountDue`, so the reason is stated properly here.)
 *
 * One expression, two uses — it feeds both `FilterBuilder.applyCompare` and the
 * footer's `SUM(...)`, which is what keeps a filtered grid and its total from
 * disagreeing. Nothing forces this to stay in step with the TypeScript version;
 * if you change one, change the other.
 *
 * Verified 2026-09-21 (T-04-03), after the delivery fee landed in
 * `computeAmountDue`: this expression needs NO change. It reads the STORED
 * `amount_due`, it does not re-derive `subtotal - discount`, so the fee rides
 * along for free. An invoice of 1.000.000 - 100.000 - 50.000 + 30.000 fee
 * stores 880.000; the grid column reads 880.000; `SUM(...)` over it and a
 * second fee-bearing invoice of 30.000 gives 910.000; a money range of
 * [880.000, 880.000] matches it while [879.999] and [880.001] do not, and so
 * does not the pre-fee 850.000. A RETURN of that invoice takes the `netAmount`
 * branch and reads -850.000: `computeTotals`/`refundableFactor` are built from
 * line totals and header discounts only — `RefundableInvoiceHeader` has no
 * `shippingFeeAmount` field — so a collected fee is never refunded (A-23).
 *
 * Property names (`netAmount`) rather than column names: TypeORM rewrites them
 * to real columns, including inside `addSelect`.
 */
export function invoiceSignedTotalSql(alias = 'inv'): string {
  const refundTypes = [InvoiceType.RETURN, InvoiceType.EXCHANGE]
    .map((t) => `'${t}'`)
    .join(', ');
  return `CASE WHEN ${alias}.type IN (${refundTypes}) THEN ${alias}.netAmount ELSE ${alias}.amountDue END`;
}
