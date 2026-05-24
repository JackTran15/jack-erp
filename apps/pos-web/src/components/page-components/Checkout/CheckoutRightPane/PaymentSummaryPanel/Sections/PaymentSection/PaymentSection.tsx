import { useEffect, type RefObject } from "react";
import { cn, formatVnd } from "@erp/ui";
import { PosTextarea } from "@erp/pos/components/common/PosTextarea/PosTextarea";
import { DebtCheckRow } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/DebtCheckRow/DebtCheckRow";
import { ForgiveShortageRow } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/ForgiveShortageRow/ForgiveShortageRow";
import { KeepChangeRow } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/KeepChangeRow/KeepChangeRow";
import { PosPaymentMethodList } from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import { PaymentSummaryBlock } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/PaymentSummaryBlock/PaymentSummaryBlock";
import { QrPaymentButton } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/QrPaymentButton/QrPaymentButton";
import { LabelTagButton } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/Sections/PaymentSection/LabelTagButton/LabelTagButton";
import { PosSummaryRow } from "@erp/pos/components/common/PosSummaryRow/PosSummaryRow";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import { usePaymentAccountsQuery } from "@erp/pos/hooks/react-query/use-query-account";
import { usePosCheckoutPaymentStore } from "@erp/pos/stores/page-stores/checkout/checkout-payment.store";

interface PaymentSectionProps {
  paymentAmountRef: RefObject<HTMLInputElement | null>;
  onDepositClick: () => void;
}

export function PaymentSection({
  paymentAmountRef,
  onDepositClick,
}: PaymentSectionProps) {
  const {
    deposit,
    grandTotal: total,
    settlementAbs,
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
  const setFirstLineAmountAuto = usePosCheckoutPaymentStore(
    (s) => s.setFirstLineAmountAuto,
  );
  const paymentAccountsQuery = usePaymentAccountsQuery();
  const accounts = paymentAccountsQuery.accounts;

  // Mặc định số tiền dòng thanh toán đầu = số tiền cần thanh toán; tự đồng bộ khi
  // tổng đổi cho tới khi nhân viên tự nhập (store tự guard theo `firstAmountAuto`).
  useEffect(() => {
    setFirstLineAmountAuto(settlementAbs);
  }, [settlementAbs, setFirstLineAmountAuto]);

  useEffect(() => {
    if (accounts.length === 0) return;
    const used = new Set(
      paymentLines
        .map((l) => l.cashAccountId)
        .filter((id): id is string => Boolean(id)),
    );
    let mutated = false;
    const next = paymentLines.map((line) => {
      if (line.cashAccountId) return line;
      const free = accounts.find((a) => !used.has(a.id));
      if (!free) return line;
      used.add(free.id);
      mutated = true;
      return { ...line, cashAccountId: free.id };
    });
    if (mutated) handleChangePaymentLines(next);
  }, [accounts, paymentLines, handleChangePaymentLines]);

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
              accounts={accounts}
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
              accounts={accounts}
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
