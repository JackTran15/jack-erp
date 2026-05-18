import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PosToggleField } from "@erp/pos/components/common/PosToggleField/PosToggleField";
import { usePosCheckoutPaymentStore } from "@erp/pos/stores/page-stores/checkout/checkout-payment.store";

/**
 * "In hóa đơn" toggle + "Đặt hàng" checkbox — sticky-bar style row pinned
 * above the cash-hint chips. Đọc/set printInvoice + preorder từ payment store.
 */
export function PrintAndOrderRow() {
  const printInvoice = usePosCheckoutPaymentStore((s) => s.printInvoice);
  const setPrintInvoice = usePosCheckoutPaymentStore((s) => s.setPrintInvoice);
  const preorder = usePosCheckoutPaymentStore((s) => s.preorder);
  const setPreorder = usePosCheckoutPaymentStore((s) => s.setPreorder);

  return (
    <div className="flex h-11 items-center justify-between gap-3 bg-[#F5F5F5] px-4 text-[14px] text-gray-900">
      <PosToggleField
        label="In hóa đơn"
        checked={printInvoice}
        onChange={setPrintInvoice}
      />
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
