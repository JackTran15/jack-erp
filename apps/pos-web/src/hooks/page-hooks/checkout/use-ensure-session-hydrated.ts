import { useEffect } from "react";

import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";

/**
 * Đảm bảo session store có ít nhất 1 invoice session sau khi hydrate từ
 * localStorage. Gọi 1 lần mount ở CheckoutPage.
 */
export function useEnsureSessionHydrated(): void {
  const ensureHydratedShape = usePosCheckoutSessionStore(
    (s) => s.ensureHydratedShape,
  );
  useEffect(() => {
    ensureHydratedShape();
  }, [ensureHydratedShape]);
}
