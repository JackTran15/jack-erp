import { useCallback } from "react";

import { useCheckoutCatalog } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-catalog";
import { useCheckoutSessionCart } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-session-cart";
import type { CatalogProduct } from "@erp/pos/lib/page-libs/checkout/checkout.types";
import { locationQtyFor } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import type { PosCatalogLine } from "@erp/pos/lib/page-libs/checkout/posCatalogApi";
import { clampPosCheckoutQtyNumber } from "@erp/pos/lib/page-libs/checkout/posCheckoutQty";
import { usePosCheckoutCatalogStore } from "@erp/pos/stores/page-stores/checkout/checkout-catalog.store";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

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
  const { filteredProducts } = useCheckoutCatalog();

  const addProductByItem = useCallback(
    (product: PosCatalogLine, qty = 1) => {
      const atDef = locationQtyFor(product);
      const ui = usePosCheckoutUiStore.getState();
      if (atDef < 1) {
        ui.setCartError("Hết tồn.");
        return;
      }
      const requested = clampPosCheckoutQtyNumber(qty);
      const lineId = addProduct(product, requested);
      usePosCheckoutCatalogStore
        .getState()
        .setToolbar((s) => ({ ...s, query: "" }));
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
    const toolbar = usePosCheckoutCatalogStore.getState().toolbar;
    if (filteredProducts.length === 1) {
      const requested = clampPosCheckoutQtyNumber(toolbar.qty);
      const lineId = addProduct(filteredProducts[0]!, requested);
      usePosCheckoutCatalogStore
        .getState()
        .setToolbar((s) => ({ ...s, query: "" }));
      if (lineId) {
        ui.setPendingQtyFocusLineId(lineId);
      } else {
        ui.requestProductSearchFocus();
      }
    } else if (filteredProducts.length === 0) {
      ui.setCartError("Không tìm thấy hàng phù hợp.");
    } else {
      ui.setCartError("Nhiều kết quả — chọn hàng bên dưới hoặc thu hẹp từ khóa.");
    }
  }, [addProduct, filteredProducts]);

  const addProductByCatalogCard = useCallback(
    (product: CatalogProduct) => {
      const catalog = usePosCheckoutCatalogStore.getState().catalog;
      const lineId = handleCatalogSelectFromCart(product, catalog);
      if (lineId) {
        usePosCheckoutUiStore.getState().setPendingQtyFocusLineId(lineId);
      }
    },
    [handleCatalogSelectFromCart],
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
