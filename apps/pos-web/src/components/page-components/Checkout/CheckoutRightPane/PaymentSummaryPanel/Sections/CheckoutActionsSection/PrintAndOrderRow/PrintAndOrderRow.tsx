import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PosToggle } from "@erp/pos/components/common/PosToggle/PosToggle";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";

/**
 * "In hóa đơn" toggle + "Đặt hàng" checkbox — sticky-bar style row pinned
 * above the cash-hint chips. Đọc/set printInvoice + preorder qua payment hook
 * (state per-tab nằm trong session draft).
 */
export function PrintAndOrderRow() {
  const { printInvoice, setPrintInvoice, preorder, setPreorder } =
    useCheckoutPayment();

  return (
    <div className="flex h-11 items-center justify-between gap-3 bg-[#F5F5F5] px-4 text-[14px] text-gray-900">
      <label className="inline-flex items-center gap-2 text-[13px] text-gray-700">
        <span>In hóa đơn</span>
        <PosToggle
          checked={printInvoice}
          onChange={setPrintInvoice}
          ariaLabel="In hóa đơn"
        />
      </label>
      <label className="inline-flex cursor-pointer items-center gap-2">
        <PosCheckbox
          checked={preorder}
          onChange={setPreorder}
          ariaLabel="Đặt hàng"
        />
        Đặt hàng
      </label>
    </div>
  );
}
