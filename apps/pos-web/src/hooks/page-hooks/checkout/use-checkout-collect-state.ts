import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import {
  selectHasAnyCartLines,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutCustomerStore } from "@erp/pos/stores/page-stores/checkout/checkout-customer.store";

export interface UseCheckoutCollectStateResult {
  hasAnyCartLines: boolean;
  collectDisabled: boolean;
}

/**
 * Tính `collectDisabled` cho nút "Thu tiền" (F12) cross-store:
 * - true khi giỏ trống, hoặc thiếu tiền trong khi không forgive/debt.
 */
export function useCheckoutCollectState(): UseCheckoutCollectStateResult {
  const hasAnyCartLines = usePosCheckoutSessionStore(selectHasAnyCartLines);
  const selectedCustomer = usePosCheckoutCustomerStore(
    (s) => s.selectedCustomer,
  );
  const payment = useCheckoutPayment();

  const blockedByShortPayment = (() => {
    if (payment.settlementGrandTotal <= 0) return false;
    const net = payment.changeAmount - payment.shortageAmount;
    if (net >= 0) return false;
    if (payment.keepChange) return false;
    if (payment.debt && selectedCustomer) return false;
    return true;
  })();

  return {
    hasAnyCartLines,
    collectDisabled: !hasAnyCartLines || blockedByShortPayment,
  };
}
