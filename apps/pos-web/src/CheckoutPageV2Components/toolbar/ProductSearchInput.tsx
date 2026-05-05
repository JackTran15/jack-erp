import { forwardRef, type ChangeEvent } from "react";
import { BarcodeIcon, ChevronDownIcon } from "../icons/Icon";
import { IconButton } from "../common/IconButton";

export interface ProductSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onScanBarcode?: () => void;
  onChangeMode?: () => void;
  /** Label of the leading mode dropdown (default: "Tìm kiếm"). */
  modeLabel?: string;
}

/**
 * Toolbar product search:
 *  [ Tìm kiếm ▾ ] [ (F3) Nhập tên hàng hóa, mã vạch, mã SKU ........ ] [⎮ barcode]
 */
export const ProductSearchInput = forwardRef<
  HTMLInputElement,
  ProductSearchInputProps
>(function ProductSearchInput(
  {
    value,
    onChange,
    placeholder = "(F3) Nhập tên hàng hóa, mã vạch, mã SKU",
    onScanBarcode,
    onChangeMode,
    modeLabel = "Tìm kiếm",
  },
  ref,
) {
  return (
    <div className="flex h-9 flex-1 items-stretch overflow-hidden rounded-md border border-gray-200 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
      <button
        type="button"
        onClick={onChangeMode}
        className="flex h-full shrink-0 items-center gap-1 border-r border-gray-200 bg-gray-50 px-3 text-[13px] text-gray-700 hover:bg-gray-100"
      >
        {modeLabel}
        <ChevronDownIcon size={14} className="text-gray-400" />
      </button>
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent px-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
      />
      <IconButton
        ariaLabel="Quét mã vạch"
        icon={<BarcodeIcon size={18} />}
        onClick={onScanBarcode}
        className="h-full w-9 rounded-none"
      />
    </div>
  );
});
