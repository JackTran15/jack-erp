import type { RefObject } from "react";
import { cn, formatVnd } from "@erp/ui";
import { PosTextarea } from "@erp/pos/components/common/PosTextarea/PosTextarea";
import { PAYMENT_METHODS } from "@erp/pos/constants/checkout.constant";
import { DebtCheckRow } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/DebtCheckRow/DebtCheckRow";
import { ForgiveShortageRow } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/ForgiveShortageRow/ForgiveShortageRow";
import { KeepChangeRow } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/KeepChangeRow/KeepChangeRow";
import { PosPaymentMethodList } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import { PaymentSummaryBlock } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/PaymentSummaryBlock/PaymentSummaryBlock";
import { QrPaymentButton } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/QrPaymentButton/QrPaymentButton";
import { LabelTagButton } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/LabelTagButton/LabelTagButton";
import { PosSummaryRow } from "@erp/pos/components/common/PosSummaryRow/PosSummaryRow";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import { usePosCheckoutPaymentStore } from "@erp/pos/stores/page-stores/checkout/checkout-payment.store";

interface PaymentSectionProps {
  paymentAmountRef: RefObject<HTMLInputElement | null>;
  /** Mở deposit dialog ở PaymentSummaryPanel level. */
  onDepositClick: () => void;
}

/**
 * Payment block: summary (total/deposit) → còn phải thu + payment method list →
 * trả lại khách → keep-change/forgive/debt rows → note + QR button. Đọc payment
 * raw + derived qua hook; quyết định row visibility dựa trên rawAmounts.
 */
export function PaymentSection({
  paymentAmountRef,
  onDepositClick,
}: PaymentSectionProps) {
  const {
    deposit,
    grandTotal: total,
    paymentLines,
    handleChangePaymentLines,
    changeAmount,
    shortageAmount,
    rawChangeAmount,
    rawShortageAmount,
    debt,
    note,
    setNote,
  } = useCheckoutPayment();
  const preorder = usePosCheckoutPaymentStore((s) => s.preorder);

  const amountDue = Math.max(0, total - deposit);
  const isRefundFlow = total < 0;
  const netChangeDisplay = changeAmount - shortageAmount;
  const refundDisplayAmount = Math.max(0, -total);

  const showKeepChange =
    !debt &&
    (isRefundFlow
      ? rawChangeAmount > 0 || rawShortageAmount > 0
      : rawChangeAmount > 0);
  const showForgiveShortage =
    !debt && !isRefundFlow && rawShortageAmount > 0;

  return (
    <>
      <div className="px-4">
        <PaymentSummaryBlock onDepositClick={onDepositClick} />
      </div>
      {!isRefundFlow ? (
        <>
          <div className="border-t border-gray-200 pt-3 px-4">
            <PosSummaryRow
              label={
                <span className="font-medium text-gray-900">Còn phải thu</span>
              }
              value={formatVnd(amountDue)}
              emphasis="xl"
            />
          </div>
          <div className="border-t border-gray-200 px-4">
            <PosPaymentMethodList
              lines={paymentLines}
              methods={PAYMENT_METHODS}
              onChange={handleChangePaymentLines}
              amountInputRef={paymentAmountRef}
            />
          </div>
        </>
      ) : null}
      <div className="border-t border-gray-200 px-4 py-2">
        <PosSummaryRow
          label={
            <span className="font-semibold text-gray-900">Trả lại khách</span>
          }
          value={
            <span
              className={cn(
                "text-[16px] font-bold",
                netChangeDisplay < 0 ? "text-[#DC2626]" : "text-gray-900",
              )}
            >
              {formatVnd(isRefundFlow ? refundDisplayAmount : netChangeDisplay)}
            </span>
          }
        />
      </div>
      {isRefundFlow ? (
        <>
          <div className="border-t border-gray-200 px-4 py-2">
            <p className="text-[13px] font-medium text-gray-900">
              Hình thức đổi trả
            </p>
          </div>
          <div className="border-t border-gray-200 px-4">
            <PosPaymentMethodList
              lines={paymentLines}
              methods={PAYMENT_METHODS}
              onChange={handleChangePaymentLines}
            />
          </div>
        </>
      ) : null}
      <div className="border-t border-gray-200 px-4">
        {showKeepChange ? <KeepChangeRow /> : null}
        {showForgiveShortage ? <ForgiveShortageRow /> : null}
        <DebtCheckRow />
      </div>
      <div className="border-t border-b border-gray-200 px-4">
        <PosTextarea
          value={note}
          onChange={setNote}
          placeholder="Ghi chú ..."
          rows={2}
        />
      </div>
      <div className="flex flex-col gap-2 px-4 py-3">
        <QrPaymentButton />
        {preorder ? <LabelTagButton /> : null}
      </div>
    </>
  );
}
