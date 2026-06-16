import { useState } from "react";
import { formatVnd } from "@erp/ui";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PaymentDueDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/PaymentDueDialog/PaymentDueDialog";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import { useOrgPosSettings } from "@erp/pos/hooks/react-query/use-query-organization";
import {
  selectCustomerDraft,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

/** ISO `YYYY-MM-DD` → `DD/MM/YYYY` (date-only, không lệch timezone). */
function formatIsoDateVi(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/**
 * "Tính vào công nợ" row — checkbox + label + amount. handleDebtChange yêu
 * cầu selectedCustomer; nếu chưa có sẽ phát cartError qua payment hook. Khi đã
 * tích nợ, hiện nút "Hạn thanh toán" mở modal chọn ngày hạn + số ngày được nợ,
 * và hiển thị hạn đã chọn ngay cạnh nút.
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
  const { data: posSettings } = useOrgPosSettings();
  const [dueOpen, setDueOpen] = useState(false);

  // Khi chưa chọn gì cho hóa đơn này, prefill modal từ default cấp tổ chức;
  // giá trị thu ngân nhập per-invoice (đã lưu vào draft) luôn thắng prefill.
  const defaultCreditDays = posSettings?.defaultCreditDays ?? null;
  const initialDays = creditDays ?? defaultCreditDays;

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
        <div className="flex items-center justify-between gap-2 pb-2">
          <button
            type="button"
            onClick={() => setDueOpen(true)}
            className="text-sm text-indigo-600 hover:text-indigo-700"
          >
            Hạn thanh toán
          </button>
          {paymentDueDate ? (
            <span className="text-sm text-gray-700">
              {formatIsoDateVi(paymentDueDate)}
              {creditDays != null ? ` (${creditDays} ngày)` : ""}
            </span>
          ) : null}
        </div>
      ) : null}
      <PaymentDueDialog
        open={dueOpen}
        onClose={() => setDueOpen(false)}
        initialDate={paymentDueDate}
        initialDays={initialDays}
        onConfirm={(date, days) => {
          setPaymentDueDate(date);
          setCreditDays(days);
          setDueOpen(false);
        }}
      />
    </div>
  );
}
