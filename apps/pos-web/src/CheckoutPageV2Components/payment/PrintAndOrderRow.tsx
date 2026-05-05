import { ToggleField } from "../toolbar/ToggleField";

export interface PrintAndOrderRowProps {
  printInvoice: boolean;
  onPrintInvoiceChange: (next: boolean) => void;
  preorder: boolean;
  onPreorderChange: (next: boolean) => void;
}

/**
 * "In hóa đơn" toggle + "Đặt hàng" checkbox — sticky-bar style row pinned
 * above the cash-hint chips. Background `#F5F5F5` per spec 4.10.3 to nudge
 * the eye toward the chips/CTAs underneath.
 */
export function PrintAndOrderRow({
  printInvoice,
  onPrintInvoiceChange,
  preorder,
  onPreorderChange,
}: PrintAndOrderRowProps) {
  return (
    <div className="flex h-11 items-center justify-between gap-3 bg-[#F5F5F5] px-4 text-[14px] text-gray-900">
      <ToggleField
        label="In hóa đơn"
        checked={printInvoice}
        onChange={onPrintInvoiceChange}
      />
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={preorder}
          onChange={(e) => onPreorderChange(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-indigo-500 focus:ring-indigo-500/30"
        />
        Đặt hàng
      </label>
    </div>
  );
}
