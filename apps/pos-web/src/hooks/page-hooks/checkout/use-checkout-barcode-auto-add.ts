import { useCallback, useRef } from "react";

import { useCheckoutCartActions } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-cart-actions";
import { useLookupCatalogByCode } from "@erp/pos/hooks/react-query/use-query-catalog";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";

/**
 * - `added`: trúng đúng 1 item, đã `addProductByItem`.
 * - `skipped`: chuỗi này đang/đã được một đường khác xử lý (khử trùng) — caller
 *   không làm gì thêm.
 * - `miss`: lookup không khớp (0 hoặc nhiều) — caller được phép fallback
 *   (dropdown gợi ý ở đường đổi-input, `addProductByQuery` ở đường Enter).
 */
export type BarcodeAutoAddResult = "added" | "skipped" | "miss";

export interface UseCheckoutBarcodeAutoAddResult {
  tryAutoAdd: (code: string) => Promise<BarcodeAutoAddResult>;
  /** Mở phiên nhập mới — gọi trên mỗi lần gõ/quét thật (`onValueChange`). */
  resetGuard: () => void;
}

/**
 * Auto-add khi quét/nhập trúng mã vạch hoặc mã SKU 100%. Hai đường kích hoạt
 * (đổi input debounced + Enter) có thể cùng trỏ tới một chuỗi, và sau khi add
 * ta xóa ô input khiến debounce cũ của popover vẫn nổ lại với chuỗi cũ. Để một
 * lần quét chỉ thêm đúng 1 lần:
 *
 *  - `claimRef` được "claim" NGAY trước khi gọi lookup → call trùng đang bay
 *    cho cùng chuỗi trả `skipped`.
 *  - claim được GIỮ sau khi add thành công → debounce cũ nổ lại (xóa input
 *    KHÔNG bắn `onValueChange`) thấy claim trùng → `skipped`, không add lần 2.
 *  - claim được NHẢ lại khi `miss` → đường Enter vẫn fallback được.
 *  - `resetGuard` (gắn vào `onValueChange`, tức gõ/quét thật) nhả claim để lần
 *    quét kế tiếp — kể cả đúng mã vừa thêm — được tính là phiên mới (re-scan +1).
 */
export function useCheckoutBarcodeAutoAdd(): UseCheckoutBarcodeAutoAddResult {
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  const lookup = useLookupCatalogByCode();
  const { addProductByItem } = useCheckoutCartActions();
  const claimRef = useRef<string | null>(null);

  const resetGuard = useCallback(() => {
    claimRef.current = null;
  }, []);

  const tryAutoAdd = useCallback(
    async (raw: string): Promise<BarcodeAutoAddResult> => {
      const code = raw.trim();
      if (!code || !branchId) return "miss";
      if (claimRef.current === code) return "skipped";
      claimRef.current = code;

      let lines;
      try {
        lines = await lookup(branchId, code);
      } catch {
        claimRef.current = null;
        return "miss";
      }

      if (lines.length === 1) {
        addProductByItem(lines[0]!, 1);
        return "added"; // giữ claim để chặn debounce cũ nổ lại
      }
      claimRef.current = null; // nhả để Enter fallback
      return "miss";
    },
    [branchId, lookup, addProductByItem],
  );

  return { tryAutoAdd, resetGuard };
}
