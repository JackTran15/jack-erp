import { forwardRef, type ReactNode } from "react";
import { BarcodeIcon, ChevronDownIcon } from "../icons/Icon";
import { IconButton } from "../common/IconButton";
import {
  SearchPopover,
  type SearchSuggestion,
} from "../common/SearchPopover";

export interface ProductSearchInputProps<T> {
  value: string;
  onChange: (value: string) => void;
  search: (q: string) => Promise<SearchSuggestion<T>[]>;
  onSelect: (item: T) => void;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  renderMeta?: (item: T) => ReactNode;
  onSubmitQuery?: (q: string) => boolean | void;
  placeholder?: string;
  onScanBarcode?: () => void;
  onChangeMode?: () => void;
  /** Label of the leading mode dropdown (default: "Tìm kiếm"). */
  modeLabel?: string;
  disabled?: boolean;
  minChars?: number;
  debounceMs?: number;
}

/**
 * Toolbar product search:
 *  [ Tìm kiếm ▾ ] [ (F3) Nhập tên hàng hóa, mã vạch, mã SKU ........ ] [⎮ barcode]
 *
 * Wraps the generic SearchPopover so the toolbar can render its own
 * mode-picker prefix and barcode-scan suffix while keeping debounce /
 * keyboard navigation / suggestion rendering shared.
 */
export const ProductSearchInput = forwardRef(function ProductSearchInput<T>(
  {
    value,
    onChange,
    search,
    onSelect,
    itemKey,
    renderItem,
    renderMeta,
    onSubmitQuery,
    placeholder = "(F3) Nhập tên hàng hóa, mã vạch, mã SKU",
    onScanBarcode,
    onChangeMode,
    modeLabel = "Tìm kiếm",
    disabled,
    minChars = 1,
    debounceMs = 150,
  }: ProductSearchInputProps<T>,
  ref: React.Ref<HTMLInputElement>,
) {
  return (
    <SearchPopover<T>
      inputRef={ref}
      value={value}
      onValueChange={onChange}
      search={search}
      onSelect={onSelect}
      itemKey={itemKey}
      renderItem={renderItem}
      renderMeta={renderMeta}
      onSubmitQuery={onSubmitQuery}
      placeholder={placeholder}
      disabled={disabled}
      minChars={minChars}
      debounceMs={debounceMs}
      containerClassName="flex h-9 flex-1 items-stretch overflow-hidden rounded-md border border-gray-200 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"
      inputClassName="min-w-0 flex-1 bg-transparent px-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
      prefix={
        <button
          type="button"
          onClick={onChangeMode}
          className="flex h-full shrink-0 items-center gap-1 border-r border-gray-200 bg-gray-50 px-3 text-[13px] text-gray-700 hover:bg-gray-100"
        >
          {modeLabel}
          <ChevronDownIcon size={14} className="text-gray-400" />
        </button>
      }
      suffix={
        <IconButton
          ariaLabel="Quét mã vạch"
          icon={<BarcodeIcon size={18} />}
          onClick={onScanBarcode}
          className="h-full w-9 rounded-none"
        />
      }
    />
  );
}) as <T>(
  props: ProductSearchInputProps<T> & { ref?: React.Ref<HTMLInputElement> },
) => ReturnType<React.FC>;
