import { cn, formatVnd } from "@erp/ui";
import { PosTextarea } from "@erp/pos/components/form/PosTextarea";
import type { PaymentMethodOption } from "../../types";
import { DebtCheckRow } from "../DebtCheckRow";
import { ForgiveShortageRow } from "../ForgiveShortageRow";
import { KeepChangeRow } from "../KeepChangeRow";
import { PaymentMethodList, type PaymentLine } from "../PaymentMethodRow";
import { PaymentSummaryBlock } from "../PaymentSummaryBlock";
import { QrPaymentButton } from "../QrPaymentButton";
import { SummaryRow } from "../SummaryRow";

interface PaymentSectionProps {
  itemCount: number;
  total: number;
  deposit: number;
  amountDue: number;
  paymentLines: PaymentLine[];
  methods: readonly PaymentMethodOption[];
  onChangePaymentLines: (lines: PaymentLine[]) => void;
  paymentAmountReadOnly?: (line: PaymentLine, index: number) => boolean;
  /** Effective change-due-back (post `keepChange`). */
  changeAmount: number;
  /** Effective shortage (post `forgiveShortage`). */
  shortageAmount: number;

  /**
   * A single `keepChange` boolean powers both "Khách không lấy tiền thừa"
   * (when overpaid) and "Bớt tiền lẻ cho khách" (when underpaid). The two
   * `show*` flags decide which row to render — only one can ever be true
   * at a time since the sale is either over- or under-paid.
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
  onPrintQr?: () => void;
}

export function PaymentSection({
  itemCount,
  total,
  deposit,
  amountDue,
  paymentLines,
  methods,
  onChangePaymentLines,
  paymentAmountReadOnly,
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
  onPrintQr,
}: PaymentSectionProps) {
  // Signed display: positive = change to give back, negative = shortage.
  // Only one of changeAmount / shortageAmount is non-zero at a time (the
  // sale either over- or under-paid), so the subtraction picks the right
  // sign without an explicit branch.
  const netChangeDisplay = changeAmount - shortageAmount;
  return (
    <>
      <div className="px-4">
        <PaymentSummaryBlock
          itemCount={itemCount}
          total={total}
          deposit={deposit}
          amountDue={amountDue}
        />
      </div>
      <div className="border-t border-gray-200 px-4">
        <PaymentMethodList
          lines={paymentLines}
          methods={methods}
          onChange={onChangePaymentLines}
          amountReadOnly={paymentAmountReadOnly}
        />
      </div>
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
              {formatVnd(netChangeDisplay)}
            </span>
          }
        />
      </div>
      <div className="border-t border-gray-200 px-4">
        {showKeepChange ? (
          <KeepChangeRow
            checked={keepChange ?? false}
            onChange={onKeepChangeChange ?? (() => {})}
            amount={keepChange ? rawChangeAmount : 0}
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
        <QrPaymentButton onClick={onPrintQr} />
      </div>
    </>
  );
}
