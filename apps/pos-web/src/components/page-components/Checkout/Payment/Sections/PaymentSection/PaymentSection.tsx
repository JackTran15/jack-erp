import type { Ref } from "react";
import { cn, formatVnd } from "@erp/ui";
import { PosTextarea } from "@erp/pos/components/common/PosTextarea/PosTextarea";
import type { PaymentMethodOption } from "@erp/pos/lib/page-libs/checkout/checkout.types";
import { DebtCheckRow } from "@erp/pos/components/page-components/Checkout/Payment/DebtCheckRow/DebtCheckRow";
import { ForgiveShortageRow } from "@erp/pos/components/page-components/Checkout/Payment/ForgiveShortageRow/ForgiveShortageRow";
import { KeepChangeRow } from "@erp/pos/components/page-components/Checkout/Payment/KeepChangeRow/KeepChangeRow";
import { PaymentMethodList, type PaymentLine } from "@erp/pos/components/page-components/Checkout/Payment/PaymentMethodRow/PaymentMethodRow";
import { PaymentSummaryBlock } from "@erp/pos/components/page-components/Checkout/Payment/PaymentSummaryBlock/PaymentSummaryBlock";
import { QrPaymentButton } from "@erp/pos/components/page-components/Checkout/Payment/QrPaymentButton/QrPaymentButton";
import type { QrPaymentInfo } from "@erp/pos/components/page-components/Checkout/Payment/VietQrPaymentDialog/VietQrPaymentDialog";
import { SummaryRow } from "@erp/pos/components/page-components/Checkout/Payment/SummaryRow/SummaryRow";

interface PaymentSectionProps {
  itemCount: number;
  total: number;
  deposit: number;
  amountDue: number;
  paymentLines: PaymentLine[];
  methods: readonly PaymentMethodOption[];
  onChangePaymentLines: (lines: PaymentLine[]) => void;
  onDepositClick?: () => void;
  paymentAmountReadOnly?: (line: PaymentLine, index: number) => boolean;
  /** Ref forwarded to the amount input of the first payment line (for F12). */
  paymentAmountRef?: Ref<HTMLInputElement>;
  isRefundFlow: boolean;
  /** Effective change-due-back (post `keepChange`). */
  changeAmount: number;
  /** Effective shortage (post `forgiveShortage`). */
  shortageAmount: number;

  /**
   * Single `keepChange` flag: sale shows one of two rows from raw deltas;
   * refund uses one row for waive remainder or excess payout.
   */
  showKeepChange: boolean;
  showForgiveShortage: boolean;
  keepChange?: boolean;
  onKeepChangeChange?: (next: boolean) => void;
  /** Raw change amount — shown in the row's right column when checked. */
  rawChangeAmount: number;
  /** Raw shortage amount — shown in the row's right column when checked. */
  rawShortageAmount: number;

  debt: boolean;
  onDebtChange: (next: boolean) => void;
  debtAmount: number;
  note: string;
  onNoteChange: (n: string) => void;
  /** Account + amount data shown inside the VietQR dialog. */
  qrPayment: QrPaymentInfo;
}

export function PaymentSection({
  itemCount,
  total,
  deposit,
  amountDue,
  paymentLines,
  methods,
  onChangePaymentLines,
  onDepositClick,
  paymentAmountReadOnly,
  paymentAmountRef,
  isRefundFlow,
  changeAmount,
  shortageAmount,
  showKeepChange,
  showForgiveShortage,
  keepChange,
  onKeepChangeChange,
  rawChangeAmount,
  rawShortageAmount,
  debt,
  onDebtChange,
  debtAmount,
  note,
  onNoteChange,
  qrPayment,
}: PaymentSectionProps) {
  // Signed net for styling: positive = change due, negative = shortage (sale).
  const netChangeDisplay = changeAmount - shortageAmount;
  const refundDisplayAmount = Math.max(0, -total);
  return (
    <>
      <div className="px-4">
        <PaymentSummaryBlock
          itemCount={itemCount}
          total={total}
          deposit={deposit}
          amountDue={amountDue}
          onDepositClick={onDepositClick}
        />
      </div>
      {!isRefundFlow ? (
        <>
          <div className="border-t border-gray-200 pt-3 px-4">
            <SummaryRow
              label={
                <span className="font-medium text-gray-900">Còn phải thu</span>
              }
              value={formatVnd(amountDue)}
              emphasis="xl"
            />
          </div>
          <div className="border-t border-gray-200 px-4">
            <PaymentMethodList
              lines={paymentLines}
              methods={methods}
              onChange={onChangePaymentLines}
              amountReadOnly={paymentAmountReadOnly}
              amountInputRef={paymentAmountRef}
            />
          </div>
        </>
      ) : null}
      <div className="border-t border-gray-200 px-4 py-2">
        <SummaryRow
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
            <PaymentMethodList
              lines={paymentLines}
              methods={methods}
              onChange={onChangePaymentLines}
              amountReadOnly={paymentAmountReadOnly}
            />
          </div>
        </>
      ) : null}
      <div className="border-t border-gray-200 px-4">
        {showKeepChange ? (
          <KeepChangeRow
            checked={keepChange ?? false}
            onChange={onKeepChangeChange ?? (() => {})}
            amount={
              keepChange
                ? isRefundFlow
                  ? rawShortageAmount > 0
                    ? rawShortageAmount
                    : rawChangeAmount
                  : rawChangeAmount
                : 0
            }
          />
        ) : null}
        {showForgiveShortage ? (
          <ForgiveShortageRow
            checked={keepChange ?? false}
            onChange={onKeepChangeChange ?? (() => {})}
            amount={keepChange ? rawShortageAmount : 0}
          />
        ) : null}
        <DebtCheckRow
          checked={debt}
          onChange={onDebtChange}
          amount={debtAmount}
        />
      </div>
      <div className="border-t border-b border-gray-200 px-4">
        <PosTextarea
          value={note}
          onChange={onNoteChange}
          placeholder="Ghi chú ..."
          rows={2}
        />
      </div>
      <div className="px-4 py-3">
        <QrPaymentButton payment={qrPayment} />
      </div>
    </>
  );
}
