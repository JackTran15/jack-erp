import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { formatVnd } from "@erp/ui";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";

/**
 * "Bớt tiền lẻ cho khách" checkbox row — the under-paid counterpart of
 * KeepChangeRow. Cùng wire `keepChange` (sai khác: rawShortage vs rawChange).
 * Visibility kiểm soát bởi PaymentSection.
 */
export function ForgiveShortageRow() {
  const { keepChange, setKeepChange, rawShortageAmount } = useCheckoutPayment();

  return (
    <label className="flex h-10 cursor-pointer items-center justify-between gap-3 px-0 text-sm text-gray-900">
      <span className="inline-flex items-center gap-2">
        <PosCheckbox
          checked={keepChange}
          onChange={setKeepChange}
          ariaLabel="Bớt tiền lẻ cho khách"
        />
        Bớt tiền lẻ cho khách
      </span>
      <span className="text-gray-900">{formatVnd(rawShortageAmount)}</span>
    </label>
  );
}
