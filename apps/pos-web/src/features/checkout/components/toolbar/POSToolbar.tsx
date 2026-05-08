import { forwardRef, type ReactNode } from "react";
import { UserPlusIcon } from "@erp/pos/components/icons/Icon";
import type { SearchSuggestion } from "../common/SearchPopover";
import { ProductSearchInput } from "./ProductSearchInput";
import { QuantityInput } from "./QuantityInput";
import { ToggleField } from "./ToggleField";
import { ToolbarSelect } from "./ToolbarSelect";

export interface POSToolbarState {
  query: string;
  qty: number;
  splitLine: boolean;
  salesperson?: string;
  priceBook?: string;
}

export interface POSToolbarProps<T> {
  state: POSToolbarState;
  onQueryChange: (query: string) => void;
  onQtyChange: (qty: number) => void;
  onSplitLineChange: (next: boolean) => void;

  /** Wired to ProductSearchInput → SearchPopover. */
  productSearch: (q: string) => Promise<SearchSuggestion<T>[]>;
  onSelectProduct: (item: T) => void;
  productItemKey: (item: T) => string;
  productRenderItem: (item: T) => ReactNode;
  productRenderMeta?: (item: T) => ReactNode;
  onSubmitProductQuery?: (q: string) => boolean | void;
  productSearchDisabled?: boolean;

  onPickSalesperson?: () => void;
  onPickPriceBook?: () => void;
}

/**
 * Toolbar row sitting under the topbar — search, qty, split-line toggle,
 * salesperson and price-book pickers.
 */
export const POSToolbar = forwardRef(function POSToolbar<T>(
  props: POSToolbarProps<T>,
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
    onPickSalesperson,
    onPickPriceBook,
  } = props;

  return (
    <div className="flex h-[52px] items-center gap-2 border-b border-gray-200 bg-white px-3">
      <div className="flex grow gap-2">
        <div className="grow">
          <ProductSearchInput<T>
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
      <ToolbarSelect
        placeholder="NV bán hàng"
        shortcut="Alt + N"
        value={state.salesperson}
        leadingIcon={<UserPlusIcon size={16} className="text-gray-500" />}
        onClick={onPickSalesperson}
        className="min-w-[180px]"
      />
      <ToolbarSelect
        placeholder="Chọn bảng giá"
        shortcut="Alt + B"
        value={state.priceBook}
        onClick={onPickPriceBook}
        className="min-w-[180px]"
      />
    </div>
  );
}) as <T>(
  props: POSToolbarProps<T> & { ref?: React.Ref<HTMLInputElement> },
) => ReturnType<React.FC>;
