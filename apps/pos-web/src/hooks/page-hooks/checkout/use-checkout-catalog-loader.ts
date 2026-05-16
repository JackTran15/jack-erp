import { useEffect } from "react";

import { usePosCheckoutCatalogStore } from "@erp/pos/stores/page-stores/checkout/checkout-catalog.store";

/**
 * Trigger `loadCatalog(branchId)` ngay khi mount Checkout và mỗi khi branchId
 * đổi. Component khác (catalog grid, search) chỉ đọc state — không trigger
 * fetch.
 */
export function useCheckoutCatalogLoader(branchId: string): void {
  const loadCatalog = usePosCheckoutCatalogStore((s) => s.loadCatalog);
  useEffect(() => {
    void loadCatalog(branchId);
  }, [loadCatalog, branchId]);
}
