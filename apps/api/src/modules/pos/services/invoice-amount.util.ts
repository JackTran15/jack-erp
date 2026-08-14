import { InvoiceType } from '../entities/invoice.entity';

/**
 * Canonical amount-due formula for an invoice. Every recompute site (draft
 * create/update, promotion apply/remove, point redemption, checkout) must use
 * this helper so promotion discounts, loyalty point-redemption discounts and
 * deposits all reduce the amount consistently. Clamped to a non-negative value
 * and rounded to 2 decimals.
 */
export function computeAmountDue(invoice: {
  subtotal: number | string;
  discountAmount?: number | string | null;
  pointsDiscountAmount?: number | string | null;
  depositAmount?: number | string | null;
}): number {
  const subtotal = Number(invoice.subtotal ?? 0);
  const discount = Number(invoice.discountAmount ?? 0);
  const pointsDiscount = Number(invoice.pointsDiscountAmount ?? 0);
  const deposit = Number(invoice.depositAmount ?? 0);
  const due = subtotal - discount - pointsDiscount - deposit;
  return Math.max(0, Math.round(due * 100) / 100);
}

/**
 * SQL twin of the frontend's `getInvoiceSignedTotal`
 * (`apps/pos-web/src/lib/common/invoiceAmount.ts`): the "Tổng thanh toán" the
 * three POS invoice grids display, where a refund direction carries a negative
 * sign.
 *
 * Returns / exchanges use `net_amount` because `computeAmountDue` above clamps
 * `amount_due` to zero, so a refund would otherwise read as 0 and a naive
 * `SUM(amount_due)` would quietly over-report. On the current dev data that is
 * the difference between 26.337.000 (right) and 28.927.000 (wrong-but-plausible).
 *
 * One expression, two uses — it feeds both `FilterBuilder.applyCompare` and the
 * footer's `SUM(...)`, which is what keeps a filtered grid and its total from
 * disagreeing. Nothing forces this to stay in step with the TypeScript version;
 * if you change one, change the other.
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
