import { useCallback } from "react";

import { resetCheckoutDraftState } from "@erp/pos/lib/page-libs/checkout/resetCheckoutDraftState";
import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface UseCheckoutCancelFlowResult {
  requestCancelInvoice: () => void;
  confirmCancelInvoice: () => void;
}

/**
 * Cancel-invoice flow: mở dialog xác nhận → on confirm, remove session
 * (nếu có >1) hoặc reset session active + draft UI; phát announce.
 */
export function useCheckoutCancelFlow(): UseCheckoutCancelFlowResult {
  const requestCancelInvoice = useCallback(() => {
    usePosCheckoutUiStore.getState().openCancelInvoice();
  }, []);

  const confirmCancelInvoice = useCallback(() => {
    const ui = usePosCheckoutUiStore.getState();
    const session = usePosCheckoutSessionStore.getState();
    ui.closeCancelInvoice();
    if (session.sessions.length > 1) {
      session.removeSession(session.activeSessionId);
    } else {
      session.resetActiveSessionAfterCheckout();
      resetCheckoutDraftState();
    }
    ui.setAnnouncement("Đã hủy hóa đơn.");
  }, []);

  return { requestCancelInvoice, confirmCancelInvoice };
}
