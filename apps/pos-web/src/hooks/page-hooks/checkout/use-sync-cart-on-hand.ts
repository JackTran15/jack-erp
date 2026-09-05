import { useEffect } from "react";

import { useCatalogQuery } from "@erp/pos/hooks/react-query/use-query-catalog";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import {
  selectUnknownOnHandLineCount,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

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

  // Giỏ hàng đổi KHÔNG làm React Query fetch lại, nên `data` giữ nguyên reference
  // suốt `staleTime` (30s) và lâu hơn nữa. Dòng thêm vào sau lần fetch cuối — dòng
  // khôi phục từ hóa đơn lưu tạm là ca hay gặp nhất — sẽ không bao giờ được điền
  // tồn nếu effect chỉ nghe `data`, và `lineExceedsOnHandSnapshot` coi
  // `onHandUnknown` là vượt tồn nên thu ngân ăn cảnh báo oan mỗi lần thanh toán.
  // Đếm số dòng đang chờ là tín hiệu đủ: sync điền tồn xong thì số về 0 và vòng
  // lặp dừng; hàng thật sự không có bản ghi tồn thì số đứng yên, cũng dừng.
  const data = catalogQuery.data;
  const unknownOnHandLines = usePosCheckoutSessionStore(
    selectUnknownOnHandLineCount,
  );
  useEffect(() => {
    if (data && data.length > 0) syncPurchaseCartOnHand(data);
  }, [data, unknownOnHandLines, syncPurchaseCartOnHand]);
}
