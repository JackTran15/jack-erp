import { useEffect, useRef } from "react";

import { createPaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import { resetCheckoutDraftState } from "@erp/pos/lib/page-libs/checkout/resetCheckoutDraftState";
import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutPaymentStore } from "@erp/pos/stores/page-stores/checkout/checkout-payment.store";

/**
 * Khi `activeSessionId` đổi: reset toàn bộ draft UI (payment / customer / dialogs / cartError /
 * appliedPromotion) qua `resetCheckoutDraftState()`, sau đó nạp lại `pendingDraftPaymentLines`
 * nếu session mới mở từ một bản lưu tạm.
 *
 * Thay thế useEffect activeSessionId-watcher (~38 dòng) đặt inline trong `CheckoutPage`.
 */
export function useCheckoutActiveSessionWatcher(): void {
  const activeSessionId = usePosCheckoutSessionStore((s) => s.activeSessionId);
  const lastRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastRef.current === null) {
      lastRef.current = activeSessionId;
      return;
    }
    if (lastRef.current === activeSessionId) return;
    lastRef.current = activeSessionId;

    resetCheckoutDraftState();

    const pendingDraftPayments =
      usePosCheckoutSessionStore.getState().pendingDraftPaymentLines;
    usePosCheckoutSessionStore.getState().setPendingDraftPaymentLines(null);
    if (pendingDraftPayments && pendingDraftPayments.length > 0) {
      usePosCheckoutPaymentStore.getState().setPaymentLines(
        pendingDraftPayments.map((row) =>
          createPaymentLine(row.method, row.amount),
        ),
      );
    }
  }, [activeSessionId]);
}
