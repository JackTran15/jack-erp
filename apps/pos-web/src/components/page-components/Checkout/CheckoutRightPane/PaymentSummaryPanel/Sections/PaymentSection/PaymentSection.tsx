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
import { API_METHOD_TO_PAYMENT_METHOD } from "@erp/pos/constants/checkout.constant";

interface PaymentSectionProps {
  paymentAmountRef: RefObject<HTMLInputElement | null>;
  onDepositClick: () => void;
  onReturnFeeClick: () => void;
}

export function PaymentSection({
  paymentAmountRef,
  onDepositClick,
  onReturnFeeClick,
}: PaymentSectionProps) {
  const {
    settlementGrandTotal,
    settlementAbs,
    paymentLines,
    setPaymentLines,
    handleChangePaymentLines,
    changeAmount,
    shortageAmount,
    rawChangeAmount,
    rawShortageAmount,
    debt,
    note,
    setNote,
    preorder,
    setFirstLineAmountAuto,
  } = useCheckoutPayment();
  const paymentAccountsQuery = usePaymentAccountsQuery();
  const accounts = paymentAccountsQuery.accounts;

  // Dòng thanh toán đầu (khi chỉ có 1 dòng) bám theo "số tiền cần thanh toán" KHI
  // không ghi nợ: mỗi khi tổng đổi, ghi đè lại số tiền. Khi "Tính vào công nợ",
  // nhân viên tự quyết số thu ngay (phần còn lại vào công nợ) nên không ghi đè.
  useEffect(() => {
    if (debt) return;
    setFirstLineAmountAuto(settlementAbs);
  }, [debt, settlementAbs, setFirstLineAmountAuto]);

  // Gán tài khoản mặc định cho dòng thanh toán chưa chọn. Dùng `setPaymentLines`
  // (functional updater → đọc state TƯƠI, KHÔNG chạy manual-edit detection) thay vì
  // `handleChangePaymentLines` để không vô tình tắt auto-fill / ghi đè số tiền vừa
  // được auto-fill — race này chỉ lộ ở invoice_return (mở tab với giỏ khác rỗng).
  const needsAssign =
    accounts.length > 0 && paymentLines.some((l) => !l.paymentAccountId);
  useEffect(() => {
    if (!needsAssign) return;
    setPaymentLines((prev) => {
      const used = new Set(
        prev
          .map((l) => l.paymentAccountId)
          .filter((id): id is string => Boolean(id)),
      );
      let mutated = false;
      const next = prev.map((line) => {
        if (line.paymentAccountId) return line;
        const free = accounts.find((a) => !used.has(a.id));
        if (!free) return line;
        used.add(free.id);
        mutated = true;
        return {
          ...line,
          paymentAccountId: free.id,
          method: API_METHOD_TO_PAYMENT_METHOD[free.paymentMethod],
        };
      });
      return mutated ? next : prev;
    });
  }, [needsAssign, accounts, setPaymentLines]);

  // Dùng settlementGrandTotal (đã trừ đặt cọc + cộng phí đổi trả) để Còn phải thu /
  // hoàn tiền + chiều refund tự đúng khi phí/đặt cọc lật dấu.
  const amountDue = Math.max(0, settlementGrandTotal);
  const isRefundFlow = settlementGrandTotal < 0;
  const netChangeDisplay = changeAmount - shortageAmount;
  const refundDisplayAmount = Math.max(0, -settlementGrandTotal);

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
        <PaymentSummaryBlock
          onDepositClick={onDepositClick}
          onReturnFeeClick={onReturnFeeClick}
        />
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
