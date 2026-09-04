import { useEffect } from "react";

import { useCatalogQuery } from "@erp/pos/hooks/react-query/use-query-catalog";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosCheckoutSessionStore } from "@erp/pos/stores/common/checkout-session.store";

/**
 * Đồng bộ snapshot tồn (`maxQty`) của các dòng bán trong giỏ theo catalog mới
 * nhất — mỗi khi catalog refetch (sau checkout, hết staleTime...), icon cảnh
 * báo vượt tồn / dialog bán khống phản ánh đúng tồn kho hiện tại, nhất quán
 * với dialog chọn biến thể. Mount đúng 1 lần ở CheckoutPage.
 */
export function useSyncCartOnHand(): void {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  const catalogQuery = useCatalogQuery(branchId);
  const syncPurchaseCartOnHand = usePosCheckoutSessionStore(
    (s) => s.syncPurchaseCartOnHand,
  );

  const data = catalogQuery.data;
  useEffect(() => {
    if (data && data.length > 0) syncPurchaseCartOnHand(data);
  }, [data, syncPurchaseCartOnHand]);
}
