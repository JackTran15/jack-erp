import { usePosCheckoutCustomerStore } from "@erp/pos/stores/page-stores/checkout/checkout-customer.store";
import { usePosCheckoutLabelsStore } from "@erp/pos/stores/page-stores/checkout/checkout-labels.store";
import { usePosCheckoutPaymentStore } from "@erp/pos/stores/page-stores/checkout/checkout-payment.store";
import { usePosCheckoutPromotionStore } from "@erp/pos/stores/page-stores/checkout/checkout-promotion.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

/**
 * Reset toàn bộ UI draft khi switch session hoặc hủy hóa đơn.
 * Giữ nguyên: catalog filter, printInvoice/preorder, selectedSalesperson/PriceBook
 * (xem plan và useEffect activeSessionId-watcher).
 */
export function resetCheckoutDraftState(): void {
  usePosCheckoutPaymentStore.getState().resetPaymentDraft();
  usePosCheckoutCustomerStore.getState().resetCustomerDraft();
  usePosCheckoutUiStore.getState().resetCheckoutUiDraft();
  usePosCheckoutLabelsStore.getState().resetLabelsDraft();
  usePosCheckoutPromotionStore.getState().resetPromotionDraft();
}
