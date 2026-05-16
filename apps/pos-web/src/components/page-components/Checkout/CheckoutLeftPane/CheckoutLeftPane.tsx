import type { Dispatch, RefObject, SetStateAction } from "react";

import { AlertBar } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/AlertBar/AlertBar";
import { PanelCollapseHandle } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/PanelCollapseHandle/PanelCollapseHandle";
import { ProductCatalogGrid } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/ProductCatalogGrid/ProductCatalogGrid";
import { ProductCatalogHeader } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/ProductCatalogHeader/ProductCatalogHeader";
import { CheckoutExchangeTabs } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/CheckoutExchangeTabs/CheckoutExchangeTabs";
import { InvoiceLineItemTable } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/InvoiceLineItemTable/InvoiceLineItemTable";
import { POSToolbar } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/POSToolbar/POSToolbar";
import type { PriceBook } from "@erp/pos/hooks/page-hooks/checkout/use-price-books";
import type { ProductGroup } from "@erp/pos/hooks/page-hooks/checkout/use-product-groups";
import type { Salesperson } from "@erp/pos/hooks/page-hooks/checkout/use-salespersons";
import {
  CheckoutVariantEnum,
  type CartLine,
  type CatalogProduct,
} from "@erp/pos/lib/page-libs/checkout/checkout.types";
import {
  formatOnHand,
  locationQtyFor,
} from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { type PosCatalogLine } from "@erp/pos/lib/page-libs/checkout/posCatalogApi";
import type { PosSelectSearchSuggestion } from "@erp/pos/components/common/PosSelectSearch/PosSelectSearch";
import type { SearchSuggestion } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import {
  CheckoutPane,
  type usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

type SetActiveCheckoutPane = ReturnType<
  typeof usePosCheckoutSessionStore.getState
>["setActiveCheckoutPane"];

interface ToolbarState {
  query: string;
  qty: number;
  splitLine: boolean;
}

export interface CheckoutLeftPaneProps {
  // exchange tabs
  checkoutVariant: CheckoutVariantEnum;
  activeCheckoutPane: CheckoutPane;
  setActiveCheckoutPane: SetActiveCheckoutPane;

  // toolbar
  toolbar: ToolbarState;
  setToolbar: Dispatch<SetStateAction<ToolbarState>>;
  productSearchAdapter: (
    q: string,
  ) => Promise<SearchSuggestion<PosCatalogLine>[]>;
  productSearchRef: RefObject<HTMLInputElement | null>;
  catalogLoading: boolean;
  onSelectProduct: (p: PosCatalogLine, qty?: number) => void;
  onSubmitProductQuery: (q: string) => boolean;

  // toolbar dropdowns
  selectedSalesperson: Salesperson | null;
  setSelectedSalesperson: (next: Salesperson | null) => void;
  salespersonSearch: (
    q: string,
  ) => ReadonlyArray<PosSelectSearchSuggestion<Salesperson>>;
  salespersonRef: RefObject<HTMLInputElement | null>;
  selectedPriceBook: PriceBook | null;
  setSelectedPriceBook: (next: PriceBook | null) => void;
  priceBookSearch: (
    q: string,
  ) => ReadonlyArray<PosSelectSearchSuggestion<PriceBook>>;
  priceBookRef: RefObject<HTMLInputElement | null>;

  // catalog error
  catalogError: string;
  loadCatalog: () => Promise<void>;

  // invoice table
  invoiceTableCheckoutPane: CheckoutPane;
  cart: CartLine[];
  selectedLineId: string | null;
  isLineWarning: (line: CartLine) => boolean;
  pendingQtyFocusLineId: string | null;
  onQtyAutoFocusConsumed: () => void;
  onCommitQty: () => void;
  onSelectLine: (id: string | null) => void;
  onRemoveLine: (id: string) => void;
  onChangeQty: (lineId: string, raw: string) => void;
  onBumpQty: (id: string, delta: number) => void;
  onChangeUnitPrice: (lineId: string, raw: string) => void;

  // catalog
  catalogCollapsed: boolean;
  setCatalogCollapsed: Dispatch<SetStateAction<boolean>>;
  catalogSearchRef: RefObject<HTMLInputElement | null>;
  catalogQuery: string;
  setCatalogQuery: Dispatch<SetStateAction<string>>;
  selectedProductGroup: ProductGroup | null;
  setCatalogGroup: Dispatch<SetStateAction<string | undefined>>;
  productGroupSearch: (
    q: string,
  ) => ReadonlyArray<PosSelectSearchSuggestion<ProductGroup>>;
  catalogProducts: CatalogProduct[];
  onCatalogSelect: (product: CatalogProduct) => void;
}

export const CheckoutLeftPane = (props: CheckoutLeftPaneProps) => {
  const {
    checkoutVariant,
    activeCheckoutPane,
    setActiveCheckoutPane,
    toolbar,
    setToolbar,
    productSearchAdapter,
    productSearchRef,
    catalogLoading,
    onSelectProduct,
    onSubmitProductQuery,
    selectedSalesperson,
    setSelectedSalesperson,
    salespersonSearch,
    salespersonRef,
    selectedPriceBook,
    setSelectedPriceBook,
    priceBookSearch,
    priceBookRef,
    catalogError,
    loadCatalog,
    invoiceTableCheckoutPane,
    cart,
    selectedLineId,
    isLineWarning,
    pendingQtyFocusLineId,
    onQtyAutoFocusConsumed,
    onCommitQty,
    onSelectLine,
    onRemoveLine,
    onChangeQty,
    onBumpQty,
    onChangeUnitPrice,
    catalogCollapsed,
    setCatalogCollapsed,
    catalogSearchRef,
    catalogQuery,
    setCatalogQuery,
    selectedProductGroup,
    setCatalogGroup,
    productGroupSearch,
    catalogProducts,
    onCatalogSelect,
  } = props;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE ? (
        <CheckoutExchangeTabs
          activeCheckoutPane={activeCheckoutPane}
          onSelectCheckoutPane={setActiveCheckoutPane}
        />
      ) : null}

      <POSToolbar<PosCatalogLine, Salesperson, PriceBook>
        ref={productSearchRef}
        state={toolbar}
        onQueryChange={(query) => {
          setToolbar((s) => ({ ...s, query }));
        }}
        onQtyChange={(qty) => setToolbar((s) => ({ ...s, qty }))}
        onSplitLineChange={(splitLine) =>
          setToolbar((s) => ({ ...s, splitLine }))
        }
        productSearch={productSearchAdapter}
        onSelectProduct={onSelectProduct}
        productItemKey={(item) => item.itemId}
        productRenderItem={(item) => item.name}
        productRenderMeta={(item) => {
          const atDef = locationQtyFor(item);
          return (
            <>
              {item.code} · Tồn {formatOnHand(item.quantityOnHand, item.unit)}
              {atDef < 1 && " · Hết"}
            </>
          );
        }}
        onSubmitProductQuery={onSubmitProductQuery}
        productSearchDisabled={catalogLoading}
        salesperson={{
          value: selectedSalesperson,
          onChange: setSelectedSalesperson,
          search: salespersonSearch,
          itemKey: (s) => s.id,
          renderItem: (s) => s.name,
          renderMeta: (s) => `Mã: ${s.code}`,
          renderSelected: (s) => s.name,
          inputRef: salespersonRef,
        }}
        priceBook={{
          value: selectedPriceBook,
          onChange: setSelectedPriceBook,
          search: priceBookSearch,
          itemKey: (book) => book.id,
          renderItem: (book) => book.name,
          renderSelected: (book) => book.name,
          inputRef: priceBookRef,
        }}
      />

      {catalogError ? (
        <AlertBar
          variant="error"
          action={{ label: "Tải lại", onClick: () => void loadCatalog() }}
        >
          {catalogError}
        </AlertBar>
      ) : null}

      <InvoiceLineItemTable
        checkoutPane={invoiceTableCheckoutPane}
        lines={cart}
        selectedId={selectedLineId}
        isLineWarning={isLineWarning}
        autoFocusQtyLineId={pendingQtyFocusLineId}
        onAutoFocusConsumed={onQtyAutoFocusConsumed}
        onCommitQty={onCommitQty}
        onSelect={onSelectLine}
        onRemove={onRemoveLine}
        onChangeQty={onChangeQty}
        onBumpQty={onBumpQty}
        onChangeUnitPrice={onChangeUnitPrice}
      />

      <PanelCollapseHandle
        collapsed={catalogCollapsed}
        onToggle={() => setCatalogCollapsed((c) => !c)}
      />

      {!catalogCollapsed && (
        <>
          <ProductCatalogHeader<PosCatalogLine, ProductGroup>
            inputRef={catalogSearchRef}
            query={catalogQuery}
            onQueryChange={setCatalogQuery}
            productSearch={productSearchAdapter}
            onSelectProduct={onSelectProduct}
            productItemKey={(item) => item.itemId}
            productRenderItem={(item) => item.name}
            productRenderMeta={(item) => {
              const atDef = locationQtyFor(item);
              return (
                <>
                  {item.code} · Tồn{" "}
                  {formatOnHand(item.quantityOnHand, item.unit)}
                  {atDef < 1 && " · Hết"}
                </>
              );
            }}
            onSubmitProductQuery={onSubmitProductQuery}
            group={{
              value: selectedProductGroup,
              onChange: (g) => setCatalogGroup(g.id),
              search: productGroupSearch,
              itemKey: (g) => g.id,
              renderItem: (g) => g.name,
              renderSelected: (g) => g.name,
            }}
          />
          {catalogLoading ? (
            <p className="px-3 py-6 text-[13px] text-gray-500">Đang tải…</p>
          ) : catalogProducts.length === 0 ? (
            <p className="px-3 py-6 text-[13px] text-gray-500">
              Chưa có hàng phù hợp.
            </p>
          ) : (
            <ProductCatalogGrid
              products={catalogProducts}
              onSelect={onCatalogSelect}
            />
          )}
        </>
      )}
    </div>
  );
};
