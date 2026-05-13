import { forwardRef, type ReactNode } from "react";
import {
  BookOpenIcon,
  TagIcon,
  UserPlusIcon,
} from "@erp/pos/components/icons/Icon";
import {
  PosSelectSearch,
  type PosSelectSearchConfig,
} from "@erp/pos/components/form/PosSelectSearch";
import type { SearchSuggestion } from "../common/SearchPopover";
import { ProductSearchInput } from "./ProductSearchInput";
import { QuantityInput } from "./QuantityInput";
import { ToggleField } from "./ToggleField";

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
  onSelectProduct: (item: TProduct) => void;
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
            onSelect={onSelectProduct}
            itemKey={productItemKey}
            renderItem={productRenderItem}
            renderMeta={productRenderMeta}
            onSubmitQuery={onSubmitProductQuery}
            disabled={productSearchDisabled}
          />
        </div>
        <QuantityInput value={state.qty} onChange={onQtyChange} />
      </div>
      <ToggleField
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
