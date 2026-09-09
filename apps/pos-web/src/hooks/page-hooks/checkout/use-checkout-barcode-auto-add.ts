import { useCallback, useRef } from "react";

import type { PosCatalogSuggestion } from "@erp/pos/interfaces/catalog.interface";

import { useCheckoutCartActions } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-cart-actions";
import {
  POS_CATALOG_SEARCH_LIMIT,
  useSearchPosCatalog,
} from "@erp/pos/hooks/react-query/use-query-catalog";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";

/**
 * - `added`: trúng đúng 1 item, đã `addProductByItem`.
 * - `skipped`: chuỗi này đang/đã được một đường khác xử lý (khử trùng) — caller
 *   không làm gì thêm.
 * - `miss`: lookup không khớp (0 hoặc nhiều) — caller được phép fallback
 *   (dropdown gợi ý ở đường đổi-input, `addProductByQuery` ở đường Enter).
 */
export type BarcodeAutoAddResult = "added" | "skipped" | "miss";

export interface CheckoutSearchOutcome {
  result: BarcodeAutoAddResult;
  /** Gợi ý cho dropdown. Rỗng khi đã auto-add hoặc khi bị khử trùng. */
  suggestions: PosCatalogSuggestion[];
}

export interface UseCheckoutBarcodeAutoAddResult {
  /** Đường Enter: chỉ cần biết có khớp tuyệt đối không, không cần dropdown. */
  tryAutoAdd: (code: string) => Promise<BarcodeAutoAddResult>;
  /**
   * Đường gõ (debounce): **một** lời gọi trả cả khớp tuyệt đối lẫn gợi ý.
   * Trước đây là hai request nối tiếp — `/catalog/lookup` rồi `/catalog?search=`.
   */
  searchWithAutoAdd: (q: string) => Promise<CheckoutSearchOutcome>;
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
  const searchCatalog = useSearchPosCatalog();
  const { addProductByItem } = useCheckoutCartActions();
  const claimRef = useRef<string | null>(null);

  const resetGuard = useCallback(() => {
    claimRef.current = null;
  }, []);

  /**
   * Claim NGAY trước khi gọi API — không phải sau. Đó là điều làm call trùng
   * đang bay cho cùng chuỗi trả `skipped` thay vì add hai lần.
   */
  const claim = useCallback((code: string): boolean => {
    if (claimRef.current === code) return false;
    claimRef.current = code;
    return true;
  }, []);

  /** Kết sổ một lượt tra: add + GIỮ claim, hoặc NHẢ claim để Enter fallback. */
  const settle = useCallback(
    (exact: PosCatalogSuggestion | null): BarcodeAutoAddResult => {
      // Quy tắc "khớp đúng 1" giờ do server quyết: `exact` đã là null khi 0 khớp
      // và null khi nhiều hơn 1, nên FE không phải đếm danh sách nữa.
      if (exact) {
        addProductByItem(exact, 1);
        return "added"; // giữ claim để chặn debounce cũ nổ lại
      }
      claimRef.current = null; // nhả để Enter fallback
      return "miss";
    },
    [addProductByItem],
  );

  const tryAutoAdd = useCallback(
    async (raw: string): Promise<BarcodeAutoAddResult> => {
      const code = raw.trim();
      if (!code || !branchId) return "miss";
      if (!claim(code)) return "skipped";

      try {
        // `mode: "exact"` bỏ hẳn nhánh gợi ý. Đường này không cần dropdown, và
        // đó cũng là cách duy nhất tránh ca chuỗi 1–2 ký tự (phím Enter không
        // bị `minChars` chặn) — pg_trgm cần ≥3 ký tự nên nhánh mờ ở độ dài đó
        // quét toàn bộ catalog.
        const { exact } = await searchCatalog(branchId, {
          q: code,
          mode: "exact",
        });
        return settle(exact);
      } catch {
        claimRef.current = null;
        return "miss";
      }
    },
    [branchId, searchCatalog, claim, settle],
  );

  const searchWithAutoAdd = useCallback(
    async (raw: string): Promise<CheckoutSearchOutcome> => {
      const code = raw.trim();
      if (!code || !branchId) return { result: "miss", suggestions: [] };
      if (!claim(code)) return { result: "skipped", suggestions: [] };

      try {
        const { exact, suggestions } = await searchCatalog(branchId, {
          q: code,
          view: "suggest",
          limit: POS_CATALOG_SEARCH_LIMIT,
        });
        const result = settle(exact);
        // Khớp tuyệt đối thì đã vào giỏ — mở dropdown nữa chỉ tổ che lưới hàng.
        return { result, suggestions: result === "added" ? [] : suggestions };
      } catch {
        claimRef.current = null;
        // Trước đây lỗi ở lookup sẽ rơi xuống một request thứ hai; giờ chỉ có
        // một request, nên hỏng là hỏng — dropdown rỗng thay vì thử lại lần nữa.
        return { result: "miss", suggestions: [] };
      }
    },
    [branchId, searchCatalog, claim, settle],
  );

  return { tryAutoAdd, searchWithAutoAdd, resetGuard };
}
