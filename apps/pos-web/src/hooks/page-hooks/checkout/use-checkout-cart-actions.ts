import { useCallback } from "react";

import { CHECKOUT_ERRORS } from "@erp/pos/constants/checkout-messages.constant";
import { useCheckoutSessionCart } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-session-cart";
import { useSearchPosCatalog } from "@erp/pos/hooks/react-query/use-query-catalog";
import type { PosCatalogSuggestion } from "@erp/pos/interfaces/catalog.interface";
import { clampPosCheckoutQtyNumber } from "@erp/pos/lib/page-libs/checkout/posCheckoutQty";
import {
  selectCatalogDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

/** Xóa ô tìm sản phẩm (toolbar query) trên tab đang active. */
function clearToolbarQuery(): void {
  usePosCheckoutSessionStore.getState().updateActiveDraftSlice("catalog", (c) => ({
    ...c,
    toolbar: { ...c.toolbar, query: "" },
  }));
}

export interface UseCheckoutCartActionsResult {
  /** Thêm sản phẩm cụ thể (từ ProductSearchInput đã chọn). */
  /**
   * Nhận shape hẹp (`PosCatalogSuggestion`) chứ không đòi `PosCatalogLine` đầy đủ:
   * dropdown gợi ý gọi `?view=suggest`, vốn không mang `locations[]` /
   * `quantityOnHand` — và giỏ hàng cũng không đọc hai trường đó.
   */
  addProductByItem: (product: PosCatalogSuggestion, qty?: number) => void;
  /**
   * Submit query trên ProductSearchInput — khớp đúng 1 thì thêm; 0 → báo lỗi;
   * nhiều → báo hint.
   *
   * Hỏi server (`/catalog/search`) chứ không lọc mảng catalog trên client. Đổi
   * sang `Promise` vì thế; caller duy nhất (`handleSubmitQuery`) vốn đã gọi
   * trong `.then()`.
   */
  addProductByQuery: () => Promise<void>;
  /** Sau khi user xác nhận số lượng (Enter ở qty input) — focus về product search. */
  commitQty: () => void;
  /** Sau khi qty input đã nhận focus xong — clear signal. */
  consumeQtyAutoFocus: () => void;
}

/**
 * Tập hợp 3 handler thêm sản phẩm + 2 focus signal cho MISA flow:
 * search → Enter → focus qty → Enter → focus search lại.
 *
 * Hook đọc cart adapter + catalog adapter + ui store; không cần input.
 */
export function useCheckoutCartActions(): UseCheckoutCartActionsResult {
  const { addProduct } = useCheckoutSessionCart();
  const branchId = usePosBranchStore((s) => s.branchId) ?? "";
  const searchCatalog = useSearchPosCatalog();

  const addProductByItem = useCallback(
    (product: PosCatalogSuggestion, qty = 1) => {
      // Cho phép bán khống: KHÔNG chặn khi hết tồn (addProduct dùng tồn làm
      // snapshot maxQty để cảnh báo vượt tồn, không chặn thêm vào giỏ).
      const ui = usePosCheckoutUiStore.getState();
      const requested = clampPosCheckoutQtyNumber(qty);
      const lineId = addProduct(product, requested);
      clearToolbarQuery();
      if (lineId) {
        ui.setPendingQtyFocusLineId(lineId);
      } else {
        ui.requestProductSearchFocus();
      }
    },
    [addProduct],
  );

  const addProductByQuery = useCallback(async () => {
    const ui = usePosCheckoutUiStore.getState();
    const toolbar = selectCatalogDraft(
      usePosCheckoutSessionStore.getState(),
    ).toolbar;
    const term = toolbar.query.trim();
    if (!term || !branchId) {
      ui.setCartError(CHECKOUT_ERRORS.PRODUCT_NOT_FOUND);
      return;
    }

    let matches;
    try {
      // limit 2, không phải 20: ba nhánh dưới chỉ rẽ theo `=== 1`, `=== 0`,
      // `else` — phần tử thứ ba trở đi không bao giờ được đọc.
      ({ suggestions: matches } = await searchCatalog(branchId, {
        q: term,
        view: "suggest",
        limit: 2,
      }));
    } catch {
      // Im lặng ở đây nghĩa là Enter không làm gì cả và thu ngân bấm lại mà
      // không biết vì sao.
      ui.setCartError(CHECKOUT_ERRORS.PRODUCT_NOT_FOUND);
      return;
    }

    if (matches.length === 1) {
      const requested = clampPosCheckoutQtyNumber(toolbar.qty);
      const lineId = addProduct(matches[0]!, requested);
      clearToolbarQuery();
      if (lineId) {
        ui.setPendingQtyFocusLineId(lineId);
      } else {
        ui.requestProductSearchFocus();
      }
    } else if (matches.length === 0) {
      ui.setCartError(CHECKOUT_ERRORS.PRODUCT_NOT_FOUND);
    } else {
      ui.setCartError(CHECKOUT_ERRORS.PRODUCT_MULTIPLE_RESULTS);
    }
  }, [addProduct, branchId, searchCatalog]);

  const commitQty = useCallback(() => {
    usePosCheckoutUiStore.getState().requestProductSearchFocus();
  }, []);

  const consumeQtyAutoFocus = useCallback(() => {
    usePosCheckoutUiStore.getState().clearPendingQtyFocusLineId();
  }, []);

  return {
    addProductByItem,
    addProductByQuery,
    commitQty,
    consumeQtyAutoFocus,
  };
}
