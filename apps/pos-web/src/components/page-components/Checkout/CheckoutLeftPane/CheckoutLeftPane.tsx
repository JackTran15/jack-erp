import type { RefObject } from "react";

import { CatalogErrorAlert } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/CatalogErrorAlert/CatalogErrorAlert";
import { CheckoutExchangeTabs } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/CheckoutExchangeTabs/CheckoutExchangeTabs";
import { InvoiceLineItemTable } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/InvoiceLineItemTable/InvoiceLineItemTable";
import { PanelCollapseHandle } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/PanelCollapseHandle/PanelCollapseHandle";
import { POSToolbar } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/POSToolbar/POSToolbar";
import { ProductCatalogGrid } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/ProductCatalogGrid/ProductCatalogGrid";
import { ProductCatalogHeader } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/ProductCatalogHeader/ProductCatalogHeader";
import { useCheckoutCatalog } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-catalog";
import { CheckoutVariantEnum } from "@erp/pos/types/checkout.type";
import {
  selectCheckoutVariant,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

export interface CheckoutLeftPaneProps {
  productSearchRef: RefObject<HTMLInputElement | null>;
  salespersonRef: RefObject<HTMLInputElement | null>;
  priceBookRef: RefObject<HTMLInputElement | null>;
  catalogSearchRef: RefObject<HTMLInputElement | null>;
}

/**
 * Left pane: exchange tabs (chỉ QUICK_EXCHANGE) → toolbar → invoice table →
 * catalog (search header + product grid). Toàn bộ state đọc từ stores; props
 * chỉ là refs (forwardRef pattern cho focus management).
 */
export function CheckoutLeftPane({
  productSearchRef,
  salespersonRef,
  priceBookRef,
  catalogSearchRef,
}: CheckoutLeftPaneProps) {
  const checkoutVariant = usePosCheckoutSessionStore(selectCheckoutVariant);
  const { catalogCollapsed, catalogProductsLoading, catalogProducts } =
    useCheckoutCatalog();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE ? (
        <CheckoutExchangeTabs />
      ) : null}

      <POSToolbar
        productSearchRef={productSearchRef}
        salespersonRef={salespersonRef}
        priceBookRef={priceBookRef}
      />

      <CatalogErrorAlert />

      <InvoiceLineItemTable />

      <PanelCollapseHandle />

      {!catalogCollapsed && (
        <>
          <ProductCatalogHeader inputRef={catalogSearchRef} />
          {catalogProductsLoading ? (
            <p className="px-3 py-6 text-[13px] text-gray-500">Đang tải…</p>
          ) : catalogProducts.length === 0 ? (
            <p className="px-3 py-6 text-[13px] text-gray-500 min-h-[250px] flex justify-center items-center">
              Chưa có hàng phù hợp.
            </p>
          ) : (
            <ProductCatalogGrid />
          )}
        </>
      )}
    </div>
  );
}
