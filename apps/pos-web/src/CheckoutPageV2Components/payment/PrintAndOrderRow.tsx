import { ToggleField } from "../toolbar/ToggleField";

export interface PrintAndOrderRowProps {
  printInvoice: boolean;
  onPrintInvoiceChange: (next: boolean) => void;
  preorder: boolean;
  onPreorderChange: (next: boolean) => void;
}

/** "In hóa đơn" toggle + "Đặt hàng" checkbox shown above the cash hints. */
export function PrintAndOrderRow({
  printInvoice,
  onPrintInvoiceChange,
  preorder,
  onPreorderChange,
}: PrintAndOrderRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px] text-gray-700">
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
          className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-500 focus:ring-indigo-500/30"
        />
        Đặt hàng
      </label>
    </div>
  );
}
