import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import {
  selectCustomerDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

/**
 * "Tính vào công nợ" cho luồng hoàn tiền (return/exchange net<0). Khi tích,
 * khoản hoàn được bù trừ vào công nợ hóa đơn gốc (refundMethod=OFFSET) thay vì
 * chi tiền mặt; nếu hóa đơn gốc không còn nợ, BE tự chuyển về chi tiền mặt.
 * Yêu cầu đã chọn khách (công nợ theo khách).
 */
export function RefundToDebtRow() {
  const { refundToDebt, handleRefundToDebtChange } = useCheckoutPayment();
  const selectedCustomer = usePosCheckoutSessionStore(
    (s) => selectCustomerDraft(s).selectedCustomer,
  );

  return (
    <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-gray-900">
      <PosCheckbox
        checked={refundToDebt}
        onChange={(next) => handleRefundToDebtChange(next, selectedCustomer)}
        ariaLabel="Tính vào công nợ"
      />
      Tính vào công nợ
    </label>
  );
}
