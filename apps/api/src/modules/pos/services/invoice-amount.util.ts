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
