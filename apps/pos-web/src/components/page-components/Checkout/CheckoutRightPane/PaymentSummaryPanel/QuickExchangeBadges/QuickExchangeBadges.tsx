import { useMemo } from "react";

import {
  selectCheckoutVariant,
  selectPurchaseCart,
  selectReturnCart,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { CheckoutVariantEnum } from "@erp/pos/lib/page-libs/checkout/checkout.types";

/**
 * Read-only summary: đổi trả / mua thêm labels + qty badges (wraps naturally,
 * no full-width stretch). Đọc cart + variant từ session store và compute
 * inline; render `null` khi không phải QE / IR.
 */
export function QuickExchangeBadges() {
  const variant = usePosCheckoutSessionStore(selectCheckoutVariant);
  const purchaseCart = usePosCheckoutSessionStore(selectPurchaseCart);
  const returnCart = usePosCheckoutSessionStore(selectReturnCart);

  const badges = useMemo(() => {
    if (variant === CheckoutVariantEnum.QUICK_EXCHANGE) {
      return {
        returnQuantity: returnCart.reduce((s, l) => s + l.qty, 0),
        purchaseQuantity: purchaseCart.reduce((s, l) => s + l.qty, 0),
      };
    }
    if (variant === CheckoutVariantEnum.INVOICE_RETURN) {
      return {
        returnQuantity: purchaseCart
          .filter((l) => l.isReturnCredit)
          .reduce((s, l) => s + l.qty, 0),
        purchaseQuantity: purchaseCart
          .filter((l) => !l.isReturnCredit)
          .reduce((s, l) => s + l.qty, 0),
      };
    }
    return null;
  }, [variant, purchaseCart, returnCart]);

  if (!badges) return null;

  return (
    <div
      role="region"
      aria-label="Đổi trả / Mua thêm"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 bg-white px-3 py-3 text-[14px] font-medium"
    >
      <span className="inline-flex items-center gap-1.5 text-orange-900">
        đổi trả
        <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
          {badges.returnQuantity}
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-emerald-800">
        mua thêm
        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
          {badges.purchaseQuantity}
        </span>
      </span>
    </div>
  );
}
