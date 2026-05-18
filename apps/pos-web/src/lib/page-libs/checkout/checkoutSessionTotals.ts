import { type CartLine, CheckoutVariantEnum } from "./checkout.types";
import { lineTotal } from "./checkoutUtils";

/** Sum of line totals for a list (uses `isReturnCredit` on each line). */
export function sumLineTotals(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + lineTotal(l), 0);
}

/** Positive magnitude: return bucket in quick_exchange (no isReturnCredit on those lines). */
export function sumReturnBucket(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
}

/**
 * Net amount for payment summary: purchase minus return (quick_exchange),
 * else sum of purchase cart (sale / invoice_return with credits in-line).
 */
export function netSessionGrandTotal(
  variant: CheckoutVariantEnum,
  purchaseCart: CartLine[],
  returnCart: CartLine[],
): number {
  if (variant === CheckoutVariantEnum.QUICK_EXCHANGE) {
    return sumLineTotals(purchaseCart) - sumReturnBucket(returnCart);
  }
  return sumLineTotals(purchaseCart);
}
