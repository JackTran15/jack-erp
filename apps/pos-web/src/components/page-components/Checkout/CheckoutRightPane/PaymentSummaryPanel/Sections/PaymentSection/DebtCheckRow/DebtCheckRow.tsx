import { useState } from "react";
import { formatVnd } from "@erp/ui";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PaymentDueDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/PaymentDueDialog/PaymentDueDialog";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import {
  selectCustomerDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

/**
 * "Tính vào công nợ" row — checkbox + label + amount. handleDebtChange yêu
 * cầu selectedCustomer; nếu chưa có sẽ phát cartError qua payment hook. Khi đã
 * tích nợ, hiện nút "Hạn thanh toán" mở modal chọn ngày hạn + số ngày được nợ.
 */
export function DebtCheckRow() {
  const {
    debt,
    handleDebtChange,
    debtAmount,
    paymentDueDate,
    creditDays,
    setPaymentDueDate,
    setCreditDays,
  } = useCheckoutPayment();
  const selectedCustomer = usePosCheckoutSessionStore(
    (s) => selectCustomerDraft(s).selectedCustomer,
  );
  const [dueOpen, setDueOpen] = useState(false);

  return (
    <div>
      <label className="flex h-10 cursor-pointer items-center justify-between gap-3 text-sm text-gray-900">
        <span className="inline-flex items-center gap-2">
          <PosCheckbox
            checked={debt}
            onChange={(next) => handleDebtChange(next, selectedCustomer)}
            ariaLabel="Tính vào công nợ"
          />
          Tính vào công nợ
        </span>
        <span className="font-semibold text-[#3B5BDB]">
          {formatVnd(debtAmount)}
        </span>
      </label>
      {debt ? (
        <div className="pb-2">
          <button
            type="button"
            onClick={() => setDueOpen(true)}
            className="text-sm text-indigo-600 hover:text-indigo-700"
          >
            Hạn thanh toán
          </button>
        </div>
      ) : null}
      <PaymentDueDialog
        open={dueOpen}
        onClose={() => setDueOpen(false)}
        initialDate={paymentDueDate}
        initialDays={creditDays}
        onConfirm={(date, days) => {
          setPaymentDueDate(date);
          setCreditDays(days);
          setDueOpen(false);
        }}
      />
    </div>
  );
}
