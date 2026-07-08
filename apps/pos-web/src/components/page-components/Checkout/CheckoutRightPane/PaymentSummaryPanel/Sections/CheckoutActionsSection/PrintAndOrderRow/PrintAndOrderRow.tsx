import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PosToggle } from "@erp/pos/components/common/PosToggle/PosToggle";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import {
  selectIsReturnExchangeInvoice,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

/**
 * "In hóa đơn" toggle + "Đặt hàng" checkbox — sticky-bar style row pinned
 * above the cash-hint chips. Đọc/set printInvoice + preorder qua payment hook
 * (state per-tab nằm trong session draft). "Đặt hàng" chỉ ở tab bán (sale).
 */
export function PrintAndOrderRow() {
  const {
    printInvoice,
    setPrintInvoice,
    printDuplicate,
    setPrintDuplicate,
    preorder,
    setPreorder,
  } = useCheckoutPayment();
  const isReturnExchange = usePosCheckoutSessionStore(
    selectIsReturnExchangeInvoice,
  );

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
      <label
        className={`inline-flex items-center gap-2 text-[13px] text-gray-700 ${
          printInvoice ? "cursor-pointer" : "cursor-not-allowed opacity-50"
        }`}
        title="In 2 liên trong 1 lệnh in — 1 cho khách, 1 cửa hàng lưu"
      >
        <PosCheckbox
          checked={printDuplicate}
          onChange={setPrintDuplicate}
          disabled={!printInvoice}
          ariaLabel="In 2 liên"
        />
        In 2 liên
      </label>
      {isReturnExchange ? null : (
        <label className="inline-flex cursor-pointer items-center gap-2">
          <PosCheckbox
            checked={preorder}
            onChange={setPreorder}
            ariaLabel="Đặt hàng"
          />
          Đặt hàng
        </label>
      )}
    </div>
  );
}
