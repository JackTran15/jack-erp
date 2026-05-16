import { forwardRef, type ReactNode } from "react";
import {
  BookOpenIcon,
  TagIcon,
  UserPlusIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import {
  PosSelectSearch,
  type PosSelectSearchConfig,
} from "@erp/pos/components/common/PosSelectSearch/PosSelectSearch";
import type { SearchSuggestion } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import { ProductSearchInput } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/POSToolbar/ProductSearchInput/ProductSearchInput";
import { PosToggleField } from "@erp/pos/components/common/PosToggleField/PosToggleField";
import { PosQuantityInput } from "@erp/pos/components/common/PosQuantityInput/PosQuantityInput";
import {
  POS_CHECKOUT_QTY_MIN,
  clampPosCheckoutQtyNumber,
  safePosCheckoutQtyFromRaw,
} from "@erp/pos/lib/page-libs/checkout/posCheckoutQty";

export interface POSToolbarState {
  query: string;
  qty: number;
  splitLine: boolean;
}

export interface POSToolbarProps<
  TProduct,
  TSalesperson = never,
  TPriceBook = never,
> {
  state: POSToolbarState;
  onQueryChange: (query: string) => void;
  onQtyChange: (qty: number) => void;
  onSplitLineChange: (next: boolean) => void;

  /** Wired to ProductSearchInput → SearchPopover. */
  productSearch: (q: string) => Promise<SearchSuggestion<TProduct>[]>;
  onSelectProduct: (item: TProduct, qty: number) => void;
  productItemKey: (item: TProduct) => string;
  productRenderItem: (item: TProduct) => ReactNode;
  productRenderMeta?: (item: TProduct) => ReactNode;
  onSubmitProductQuery?: (q: string) => boolean | void;
  productSearchDisabled?: boolean;

  /** Data + handlers for the "NV bán hàng" (salesperson) combobox. */
  salesperson?: PosSelectSearchConfig<TSalesperson>;
  /** Data + handlers for the "Bảng giá" (price-book) combobox. */
  priceBook?: PosSelectSearchConfig<TPriceBook>;
}

/**
 * Toolbar row sitting under the topbar — search, qty, split-line toggle, plus
 * the salesperson and price-book pickers. The pickers' look (placeholder /
 * shortcut / leading icon / sizing) is owned by the toolbar; the caller passes
 * only data + handlers in the typed config objects.
 */
export const POSToolbar = forwardRef(function POSToolbar<
  TProduct,
  TSalesperson,
  TPriceBook,
>(
  props: POSToolbarProps<TProduct, TSalesperson, TPriceBook>,
  searchRef: React.Ref<HTMLInputElement>,
) {
  const {
    state,
    onQueryChange,
    onQtyChange,
    onSplitLineChange,
    productSearch,
    onSelectProduct,
    productItemKey,
    productRenderItem,
    productRenderMeta,
    onSubmitProductQuery,
    productSearchDisabled,
    salesperson,
    priceBook,
  } = props;

  return (
    <div className="flex h-[52px] items-center gap-2 border-b border-gray-200 bg-white px-3">
      <div className="flex grow gap-2">
        <div className="grow">
          <ProductSearchInput<TProduct>
            ref={searchRef}
            value={state.query}
            onChange={onQueryChange}
            search={productSearch}
            onSelect={(item) => onSelectProduct(item, state.qty)}
            itemKey={productItemKey}
            renderItem={productRenderItem}
            renderMeta={productRenderMeta}
            onSubmitQuery={onSubmitProductQuery}
            disabled={productSearchDisabled}
          />
        </div>
        <PosQuantityInput
          displayValue={state.qty}
          onChangeRaw={(raw) => onQtyChange(safePosCheckoutQtyFromRaw(raw))}
          onBumpUp={() => onQtyChange(clampPosCheckoutQtyNumber(state.qty + 1))}
          onBumpDown={() =>
            onQtyChange(clampPosCheckoutQtyNumber(state.qty - 1))
          }
          leading={<span className="text-gray-500 pl-2">SL</span>}
          className="w-24"
          min={POS_CHECKOUT_QTY_MIN}
          bumpDownDisabled={state.qty <= POS_CHECKOUT_QTY_MIN}
          variant="boxed"
        />
      </div>
      <PosToggleField
        label="Tách dòng"
        checked={state.splitLine}
        onChange={onSplitLineChange}
      />
      {salesperson ? (
        <PosSelectSearch<TSalesperson>
          ref={salesperson.inputRef}
          value={salesperson.value}
          onChange={salesperson.onChange}
          search={salesperson.search}
          itemKey={salesperson.itemKey}
          renderItem={salesperson.renderItem}
          renderMeta={salesperson.renderMeta}
          renderSelected={salesperson.renderSelected}
          disabled={salesperson.disabled}
          placeholder="NV bán hàng"
          shortcut="Alt + N"
          leadingIcon={<UserPlusIcon size={16} className="text-gray-500" />}
          ariaLabel="Chọn nhân viên bán hàng"
          className="min-w-[180px]"
        />
      ) : null}
      {priceBook ? (
        <PosSelectSearch<TPriceBook>
          ref={priceBook.inputRef}
          value={priceBook.value}
          onChange={priceBook.onChange}
          search={priceBook.search}
          itemKey={priceBook.itemKey}
          renderItem={priceBook.renderItem}
          renderMeta={priceBook.renderMeta}
          renderSelected={priceBook.renderSelected}
          leadingIcon={<TagIcon size={16} className="text-gray-500" />}
          disabled={priceBook.disabled}
          placeholder="Chọn bảng giá"
          shortcut="Alt + B"
          ariaLabel="Chọn bảng giá"
          className="min-w-[180px]"
        />
      ) : null}
    </div>
  );
}) as <TProduct, TSalesperson = never, TPriceBook = never>(
  props: POSToolbarProps<TProduct, TSalesperson, TPriceBook> & {
    ref?: React.Ref<HTMLInputElement>;
  },
) => ReturnType<React.FC>;
