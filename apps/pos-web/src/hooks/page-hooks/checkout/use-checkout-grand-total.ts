import {
  selectGrandTotal,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

/**
 * Net grand total cho session đang active.
 * Số dương = khách trả tiền; Số âm = cửa hàng hoàn lại (refund flow).
 */
export function useCheckoutGrandTotal(): number {
  return usePosCheckoutSessionStore(selectGrandTotal);
}
