import { useEffect, useRef } from "react";

import { createPaymentLine } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import { resetCheckoutDraftState } from "@erp/pos/lib/page-libs/checkout/resetCheckoutDraftState";
import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";
import { usePosCheckoutPaymentStore } from "@erp/pos/stores/page-stores/checkout/checkout-payment.store";

/**
 * Page bootstrap (gọi 1 lần ở CheckoutPage). Gồm 2 effect độc lập:
 *
 *  1. **Hydrate** — đảm bảo session store có ít nhất 1 invoice session sau khi
 *     hydrate từ localStorage.
 *  2. **Active-session watcher** — khi `activeSessionId` đổi: reset toàn bộ
 *     draft UI (payment / customer / dialogs / cartError / appliedPromotion) qua
 *     `resetCheckoutDraftState()`, sau đó nạp lại `pendingDraftPaymentLines` nếu
 *     session mới mở từ một bản lưu tạm.
 *
 * (Catalog tự fetch qua React Query trong `useCheckoutCatalog`, không cần loader.)
 */
export function useCheckoutBootstrap(): void {
  const ensureHydratedShape = usePosCheckoutSessionStore(
    (s) => s.ensureHydratedShape,
  );
  const activeSessionId = usePosCheckoutSessionStore((s) => s.activeSessionId);
  const lastRef = useRef<string | null>(null);

  useEffect(() => {
    ensureHydratedShape();
  }, [ensureHydratedShape]);

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
