import { useCallback } from "react";

import { CHECKOUT_ERRORS } from "@erp/pos/constants/checkout-messages.constant";
import { useCheckoutCatalog } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-catalog";
import { useCheckoutSessionCart } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-session-cart";
import type { CatalogProduct } from "@erp/pos/interfaces/checkout.interface";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import { clampPosCheckoutQtyNumber } from "@erp/pos/lib/page-libs/checkout/posCheckoutQty";
import {
  selectCatalogDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";
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
  addProductByItem: (product: PosCatalogLine, qty?: number) => void;
  /** Submit query trên ProductSearchInput — match đúng 1 thì thêm; 0 → báo lỗi; nhiều → báo hint. */
  addProductByQuery: () => void;
  /** Click product trong catalog grid. */
  addProductByCatalogCard: (product: CatalogProduct) => void;
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
  const { addProduct, handleCatalogSelect: handleCatalogSelectFromCart } =
    useCheckoutSessionCart();
  const { filteredProducts, catalog } = useCheckoutCatalog();

  const addProductByItem = useCallback(
    (product: PosCatalogLine, qty = 1) => {
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

  const addProductByQuery = useCallback(() => {
    const ui = usePosCheckoutUiStore.getState();
    const toolbar = selectCatalogDraft(
      usePosCheckoutSessionStore.getState(),
    ).toolbar;
    if (filteredProducts.length === 1) {
      const requested = clampPosCheckoutQtyNumber(toolbar.qty);
      const lineId = addProduct(filteredProducts[0]!, requested);
      clearToolbarQuery();
      if (lineId) {
        ui.setPendingQtyFocusLineId(lineId);
      } else {
        ui.requestProductSearchFocus();
      }
    } else if (filteredProducts.length === 0) {
      ui.setCartError(CHECKOUT_ERRORS.PRODUCT_NOT_FOUND);
    } else {
      ui.setCartError(CHECKOUT_ERRORS.PRODUCT_MULTIPLE_RESULTS);
    }
  }, [addProduct, filteredProducts]);

  const addProductByCatalogCard = useCallback(
    (product: CatalogProduct) => {
      const lineId = handleCatalogSelectFromCart(product, catalog);
      if (lineId) {
        usePosCheckoutUiStore.getState().setPendingQtyFocusLineId(lineId);
      }
    },
    [handleCatalogSelectFromCart, catalog],
  );

  const commitQty = useCallback(() => {
    usePosCheckoutUiStore.getState().requestProductSearchFocus();
  }, []);

  const consumeQtyAutoFocus = useCallback(() => {
    usePosCheckoutUiStore.getState().clearPendingQtyFocusLineId();
  }, []);

  return {
    addProductByItem,
    addProductByQuery,
    addProductByCatalogCard,
    commitQty,
    consumeQtyAutoFocus,
  };
}
