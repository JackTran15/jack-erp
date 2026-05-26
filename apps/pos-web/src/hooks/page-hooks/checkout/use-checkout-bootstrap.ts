import { useEffect } from "react";

import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";

/**
 * Page bootstrap (gọi 1 lần ở CheckoutPage): đảm bảo session store có ít nhất 1
 * invoice session sau khi hydrate từ localStorage.
 *
 * Draft per-tab (khách / thanh toán / KM / nhãn / meta / catalog) nằm trong từng
 * `InvoiceSession.draft`, nên KHÔNG cần reset khi đổi tab — trạng thái tự đi theo
 * session đang active (trước đây có watcher `activeSessionId` gọi
 * `resetCheckoutDraftState`, nay đã bỏ).
 *
 * (Catalog tự fetch qua React Query trong `useCheckoutCatalog`, không cần loader.)
 */
export function useCheckoutBootstrap(): void {
  const ensureHydratedShape = usePosCheckoutSessionStore(
    (s) => s.ensureHydratedShape,
  );

  useEffect(() => {
    ensureHydratedShape();
  }, [ensureHydratedShape]);
}
