import { AlertBar } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/AlertBar/AlertBar";
import { usePosCheckoutCatalogStore } from "@erp/pos/stores/page-stores/checkout/checkout-catalog.store";

interface CatalogErrorAlertProps {
  branchId: string;
}

/**
 * Wrapper hiển thị catalog error + nút "Tải lại" — đọc trực tiếp từ catalog
 * store, không cần prop drilling từ Page.
 */
export function CatalogErrorAlert({ branchId }: CatalogErrorAlertProps) {
  const catalogError = usePosCheckoutCatalogStore((s) => s.catalogError);
  const loadCatalog = usePosCheckoutCatalogStore((s) => s.loadCatalog);

  if (!catalogError) return null;

  return (
    <AlertBar
      variant="error"
      action={{ label: "Tải lại", onClick: () => void loadCatalog(branchId) }}
    >
      {catalogError}
    </AlertBar>
  );
}
