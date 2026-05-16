import type { ReactNode, Ref } from "react";
import { BoxIcon, SearchIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import {
  PosSelectSearch,
  type PosSelectSearchConfig,
} from "@erp/pos/components/common/PosSelectSearch/PosSelectSearch";
import { SearchPopover, type SearchSuggestion } from "@erp/pos/components/page-components/Checkout/Common/SearchPopover/SearchPopover";

export interface ProductCatalogHeaderProps<TProduct, TGroup = never> {
  query: string;
  onQueryChange: (q: string) => void;

  /** Wired to the SearchPopover that powers the catalog search. */
  productSearch: (q: string) => Promise<SearchSuggestion<TProduct>[]>;
  onSelectProduct: (item: TProduct) => void;
  productItemKey: (item: TProduct) => string;
  productRenderItem: (item: TProduct) => ReactNode;
  productRenderMeta?: (item: TProduct) => ReactNode;
  onSubmitProductQuery?: (q: string) => boolean | void;
  /** Forwarded to the underlying input — used by the Shift+F3 hotkey. */
  inputRef?: Ref<HTMLInputElement>;

  /** Data + handlers for the "Lọc theo nhóm hàng hóa" combobox. */
  group?: PosSelectSearchConfig<TGroup>;
}

/**
 * Section header for the product catalog: uppercase label + product search
 * popover (search icon prefix, no suffix) + group-filter combobox. The
 * combobox presentation is owned by the header; the caller passes only data
 * + handlers via the typed `group` config object.
 */
export function ProductCatalogHeader<TProduct, TGroup = never>({
  query,
  onQueryChange,
  productSearch,
  onSelectProduct,
  productItemKey,
  productRenderItem,
  productRenderMeta,
  onSubmitProductQuery,
  inputRef,
  group,
}: ProductCatalogHeaderProps<TProduct, TGroup>) {
  return (
    <div className="flex h-12 items-center gap-3 border-b border-gray-200 bg-white px-3">
      <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-gray-700">
        Tư vấn bán hàng
      </span>

      <div className="ml-auto w-[280px]">
        <SearchPopover<TProduct>
          inputRef={inputRef}
          value={query}
          onValueChange={onQueryChange}
          search={productSearch}
          onSelect={onSelectProduct}
          itemKey={productItemKey}
          renderItem={productRenderItem}
          renderMeta={productRenderMeta}
          onSubmitQuery={onSubmitProductQuery}
          placeholder="(Shift + F3) Tìm kiếm"
          containerClassName="flex h-9 w-full items-stretch overflow-hidden rounded-md border border-gray-200 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"
          inputClassName="min-w-0 flex-1 bg-transparent pr-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
          prefix={
            <span className="flex shrink-0 items-center pl-2.5 pr-1.5 text-gray-400">
              <SearchIcon size={14} />
            </span>
          }
        />
      </div>

      {group ? (
        <PosSelectSearch<TGroup>
          ref={group.inputRef}
          value={group.value}
          onChange={group.onChange}
          search={group.search}
          itemKey={group.itemKey}
          renderItem={group.renderItem}
          renderMeta={group.renderMeta}
          renderSelected={group.renderSelected}
          disabled={group.disabled}
          placeholder="Lọc theo nhóm hàng hóa"
          leadingIcon={<BoxIcon size={16} className="text-gray-500" />}
          ariaLabel="Lọc theo nhóm hàng hóa"
          className="min-w-[220px]"
          position="top"
        />
      ) : null}
    </div>
  );
}
