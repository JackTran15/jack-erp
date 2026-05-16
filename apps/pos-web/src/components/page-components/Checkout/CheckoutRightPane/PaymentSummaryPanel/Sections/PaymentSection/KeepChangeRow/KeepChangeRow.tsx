import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { formatVnd } from "@erp/ui";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";

/**
 * "Customer keeps the change" checkbox row. Đọc keepChange + rawChangeAmount
 * từ payment hook. Visibility được kiểm soát bởi PaymentSection.
 */
export function KeepChangeRow() {
  const { keepChange, setKeepChange, rawChangeAmount } = useCheckoutPayment();

  return (
    <label className="flex h-10 cursor-pointer items-center justify-between gap-3 px-0 text-sm text-gray-900">
      <span className="inline-flex items-center gap-2">
        <PosCheckbox
          checked={keepChange}
          onChange={setKeepChange}
          ariaLabel="Khách không lấy tiền thừa"
        />
        Khách không lấy tiền thừa
      </span>
      <span className="text-gray-900">{formatVnd(rawChangeAmount)}</span>
    </label>
  );
}
