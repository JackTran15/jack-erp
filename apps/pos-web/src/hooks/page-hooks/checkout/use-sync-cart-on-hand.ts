import { useEffect, useMemo } from "react";

import { useCatalogStockQuery } from "@erp/pos/hooks/react-query/use-query-catalog";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import {
  selectCartItemIdsKey,
  selectUnknownOnHandLineCount,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

/**
 * Đồng bộ snapshot tồn (`maxQty`) của các dòng bán trong giỏ — icon cảnh báo
 * vượt tồn / dialog bán khống phản ánh đúng tồn kho hiện tại, nhất quán với
 * dialog chọn biến thể. Mount đúng 1 lần ở CheckoutPage.
 *
 * Hỏi tồn của ĐÚNG những item đang trong giỏ (`POST /catalog/stock`). Trước đây
 * hook này đọc ké mảng catalog toàn chi nhánh — 10 400 item ≈ 3 835 kB trên bản
 * restore prod — để tra vài món.
 */
export function useSyncCartOnHand(): void {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  // Chuỗi (primitive) chứ không phải mảng: subscribe một mảng dựng mới mỗi
  // render sẽ làm effect chạy vô hạn. Tách lại thành mảng ở đây, sau khi giá
  // trị đã ổn định.
  const itemIdsKey = usePosCheckoutSessionStore(selectCartItemIdsKey);
  const itemIds = useMemo(
    () => (itemIdsKey ? itemIdsKey.split(",") : []),
    [itemIdsKey],
  );
  const stockQuery = useCatalogStockQuery(branchId, itemIds);
  const syncPurchaseCartOnHand = usePosCheckoutSessionStore(
    (s) => s.syncPurchaseCartOnHand,
  );

  // Giỏ hàng đổi KHÔNG luôn làm React Query fetch lại: sửa số lượng giữ nguyên
  // tập itemId, nên `data` giữ nguyên reference suốt `staleTime` (30s) và lâu
  // hơn nữa. Dòng thêm vào sau lần fetch cuối — dòng khôi phục từ hóa đơn lưu
  // tạm là ca hay gặp nhất — sẽ không bao giờ được điền tồn nếu effect chỉ nghe
  // `data`, và `lineExceedsOnHandSnapshot` coi `onHandUnknown` là vượt tồn nên
  // thu ngân ăn cảnh báo oan mỗi lần thanh toán.
  // Đếm số dòng đang chờ là tín hiệu đủ: sync điền tồn xong thì số về 0 và vòng
  // lặp dừng; hàng thật sự không có bản ghi tồn thì số đứng yên, cũng dừng.
  const data = stockQuery.data;
  const unknownOnHandLines = usePosCheckoutSessionStore(
    selectUnknownOnHandLineCount,
  );
  useEffect(() => {
    if (data && data.length > 0) syncPurchaseCartOnHand(data);
  }, [data, unknownOnHandLines, syncPurchaseCartOnHand]);
}
