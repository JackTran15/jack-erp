import { useMemo } from "react";

import { useCheckoutGrandTotal } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-grand-total";
import { deriveSettlement } from "@erp/pos/lib/page-libs/checkout/checkoutSettlement";
import {
  selectCustomerDraft,
  selectHasAnyCartLines,
  selectPaymentDraft,
  selectPointsDiscountAmount,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

export interface UseCheckoutCollectStateResult {
  hasAnyCartLines: boolean;
  collectDisabled: boolean;
}

/**
 * Tính `collectDisabled` cho nút "Thu tiền" (F12) cross-store:
 * - true khi giỏ trống, hoặc thiếu tiền trong khi không forgive/debt.
 *
 * Đọc đúng các field cần thiết qua selector + `deriveSettlement` (thay vì
 * phụ thuộc cả `useCheckoutPayment`) để thu hẹp subscription + cắt phụ thuộc hook.
 */
export function useCheckoutCollectState(): UseCheckoutCollectStateResult {
  const hasAnyCartLines = usePosCheckoutSessionStore(selectHasAnyCartLines);
  const selectedCustomer = usePosCheckoutSessionStore(
    (s) => selectCustomerDraft(s).selectedCustomer,
  );

  const grandTotal = useCheckoutGrandTotal();
  const pointsDiscountAmount = usePosCheckoutSessionStore(
    selectPointsDiscountAmount,
  );
  const { deposit, returnFee, paymentLines, keepChange, debt } =
    usePosCheckoutSessionStore(selectPaymentDraft);

  const { settlementGrandTotal, changeAmount, shortageAmount } = useMemo(
    () =>
      deriveSettlement({
        grandTotal,
        deposit,
        returnFee,
        pointsDiscountAmount,
        paymentLines,
        keepChange,
        debt,
      }),
    [
      grandTotal,
      deposit,
      returnFee,
      pointsDiscountAmount,
      paymentLines,
      keepChange,
      debt,
    ],
  );

  const blockedByShortPayment = (() => {
    if (settlementGrandTotal <= 0) return false;
    const net = changeAmount - shortageAmount;
    if (net >= 0) return false;
    if (keepChange) return false;
    if (debt && selectedCustomer) return false;
    return true;
  })();

  return {
    hasAnyCartLines,
    collectDisabled: !hasAnyCartLines || blockedByShortPayment,
  };
}
