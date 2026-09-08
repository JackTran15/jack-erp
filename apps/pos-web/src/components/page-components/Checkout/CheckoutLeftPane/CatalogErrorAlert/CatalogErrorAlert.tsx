import { AlertBar } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/AlertBar/AlertBar";
import { useCheckoutCatalog } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-catalog";

/**
 * Wrapper hiển thị lỗi tải lưới hàng hoá + nút "Tải lại" — đọc từ catalog adapter
 * (React Query), không cần prop drilling từ Page.
 *
 * Nguồn lỗi là `GET /catalog/products` (lưới). Trước đây là `GET /catalog` (catalog
 * phẳng toàn chi nhánh), thứ trang này không còn tải.
 */
export function CatalogErrorAlert() {
  const { catalogProductsError, refetchCatalogProducts } = useCheckoutCatalog();

  if (!catalogProductsError) return null;

  return (
    <AlertBar
      variant="error"
      action={{ label: "Tải lại", onClick: refetchCatalogProducts }}
    >
      {catalogProductsError}
    </AlertBar>
  );
}
