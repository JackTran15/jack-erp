import { AlertBar } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/AlertBar/AlertBar";
import { useCheckoutCatalog } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-catalog";

/**
 * Wrapper hiển thị catalog error + nút "Tải lại" — đọc từ catalog adapter
 * (React Query), không cần prop drilling từ Page.
 */
export function CatalogErrorAlert() {
  const { catalogError, refetchCatalog } = useCheckoutCatalog();

  if (!catalogError) return null;

  return (
    <AlertBar
      variant="error"
      action={{ label: "Tải lại", onClick: refetchCatalog }}
    >
      {catalogError}
    </AlertBar>
  );
}
