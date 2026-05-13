import type { Ref } from "react";
import { formatVnd } from "@erp/ui";
import { AlertBar } from "../../common/AlertBar";
import { PosTextarea } from "@erp/pos/components/form/PosTextarea";
import type { PaymentMethodOption } from "../../types";
import { DebtCheckRow } from "../DebtCheckRow";
import { KeepChangeRow } from "../KeepChangeRow";
import { PaymentMethodList, type PaymentLine } from "../PaymentMethodRow";
import { PaymentSummaryBlock } from "../PaymentSummaryBlock";
import { QrPaymentButton } from "../QrPaymentButton";
import type { QrPaymentInfo } from "../VietQrPaymentDialog";
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
  /** Ref forwarded to the amount input of the first payment line (for F12). */
  paymentAmountRef?: Ref<HTMLInputElement>;
  changeAmount: number;
  shortageAmount: number;
  showKeepChange: boolean;
  keepChange?: boolean;
  onKeepChangeChange?: (next: boolean) => void;
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
  paymentAmountReadOnly,
  paymentAmountRef,
  changeAmount,
  shortageAmount,
  showKeepChange,
  keepChange,
  onKeepChangeChange,
  debt,
  onDebtChange,
  debtAmount,
  note,
  onNoteChange,
  qrPayment,
}: PaymentSectionProps) {
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
          amountInputRef={paymentAmountRef}
        />
      </div>
      <div className="border-t border-gray-200 px-4 py-2">
        <SummaryRow
          label={<span className="font-semibold text-gray-900">Trả lại khách</span>}
          value={
            <span className="text-[16px] font-bold text-gray-900">
              {formatVnd(changeAmount)}
            </span>
          }
        />
      </div>
      {shortageAmount > 0 ? (
        <div className="px-4 pb-2">
          <AlertBar variant="error" className="rounded-md">
            Còn thiếu {formatVnd(shortageAmount)}
          </AlertBar>
        </div>
      ) : null}
      <div className="border-t border-gray-200 px-4">
        {showKeepChange ? (
          <KeepChangeRow
            checked={keepChange ?? false}
            onChange={onKeepChangeChange ?? (() => {})}
          />
        ) : null}
        <DebtCheckRow checked={debt} onChange={onDebtChange} amount={debtAmount} />
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
