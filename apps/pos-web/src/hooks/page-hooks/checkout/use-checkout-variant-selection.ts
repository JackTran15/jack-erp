import { useCallback } from "react";

import { CHECKOUT_ERRORS } from "@erp/pos/constants/checkout-messages.constant";
import { useCheckoutCatalog } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-catalog";
import { useCheckoutSessionCart } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-session-cart";
import type { CatalogProduct } from "@erp/pos/interfaces/checkout.interface";
import type {
  PosCatalogLine,
  PosProductVariant,
} from "@erp/pos/interfaces/catalog.interface";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

/** Một biến thể đã chọn + số lượng từ dialog. */
export interface VariantSelection {
  variant: PosProductVariant;
  qty: number;
}

export interface UseCheckoutVariantSelectionResult {
  /** Click product trong catalog grid → mở dialog chọn biến thể. */
  openForCatalogCard: (product: CatalogProduct) => void;
  /** Chọn 1 sản phẩm từ ProductSearchInput → mở dialog. */
  openForItem: (line: PosCatalogLine) => void;
  /** Submit query trên ProductSearchInput — đúng 1 match thì mở dialog; 0/nhiều → lỗi. */
  openForQuery: () => void;
  /** Người dùng bấm "Đồng ý" trong dialog — thêm các biến thể đã chọn vào giỏ. */
  confirmVariants: (selections: VariantSelection[]) => void;
}

/** Map 1 biến thể (detail) sang dòng catalog để tái dùng `addProduct` của cart. */
function variantToCatalogLine(variant: PosProductVariant): PosCatalogLine {
  return {
    itemId: variant.itemId,
    productId: null,
    code: variant.code,
    name: variant.name,
    unit: variant.unit,
    sellingPrice: variant.sellingPrice,
    quantityOnHand: variant.quantityOnHand,
    locations: variant.locations,
    // BE trả `locations` đã sort theo quantity desc → [0] là vị trí ưu tiên bán
    // (khớp logic `defaultLocationId` của catalog phẳng).
    defaultLocationId: variant.locations[0]?.locationId ?? "",
  };
}

/**
 * Cầu nối giữa product card / search và dialog chọn biến thể. Mở dialog dựa trên
 * `productId` (resolve từ catalog phẳng), và đẩy biến thể đã chọn vào giỏ qua
 * `addProduct` hiện có (giữ nguyên guard tồn kho + focus flow MISA).
 */
export function useCheckoutVariantSelection(): UseCheckoutVariantSelectionResult {
  const { filteredProducts } = useCheckoutCatalog();
  const { addProduct } = useCheckoutSessionCart();
  const openVariantDialog = usePosCheckoutUiStore((s) => s.openVariantDialog);

  const openForItem = useCallback(
    (line: PosCatalogLine) => {
      openVariantDialog({
        id: line.productId ?? line.itemId,
        kind: line.productId ? "PRODUCT" : "ITEM",
        title: line.name,
      });
    },
    [openVariantDialog],
  );

  const openForCatalogCard = useCallback(
    (product: CatalogProduct) => {
      // Card đã ở mức product → mở dialog trực tiếp theo kind + id của card.
      openVariantDialog({
        id: product.id,
        kind: product.kind,
        title: product.name,
      });
    },
    [openVariantDialog],
  );

  const openForQuery = useCallback(() => {
    const ui = usePosCheckoutUiStore.getState();
    if (filteredProducts.length === 1) {
      openForItem(filteredProducts[0]!);
    } else if (filteredProducts.length === 0) {
      ui.setCartError(CHECKOUT_ERRORS.PRODUCT_NOT_FOUND);
    } else {
      ui.setCartError(CHECKOUT_ERRORS.PRODUCT_MULTIPLE_RESULTS);
    }
  }, [filteredProducts, openForItem]);

  const confirmVariants = useCallback(
    (selections: VariantSelection[]) => {
      const ui = usePosCheckoutUiStore.getState();
      for (const { variant, qty } of selections) {
        if (qty < 1) continue;
        addProduct(variantToCatalogLine(variant), qty);
      }
      ui.closeVariantDialog();
      // Quay về ô tìm sản phẩm để quét/gõ tiếp (flow MISA).
      ui.requestProductSearchFocus();
    },
    [addProduct],
  );

  return { openForCatalogCard, openForItem, openForQuery, confirmVariants };
}
