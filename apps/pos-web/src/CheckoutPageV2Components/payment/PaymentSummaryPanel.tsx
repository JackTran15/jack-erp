import { forwardRef } from "react";
import type { CashSuggestion, PaymentMethodOption } from "../types";
import { CashSuggestionList } from "./CashSuggestionList";
import { CustomerInputRow } from "./CustomerInputRow";
import { DebtCheckRow } from "./DebtCheckRow";
import { NoteInput } from "./NoteInput";
import { PaymentCTAButtons } from "./PaymentCTAButtons";
import { PaymentMethodRow } from "./PaymentMethodRow";
import { PaymentSubTopBar } from "./PaymentSubTopBar";
import { PaymentSummaryBlock } from "./PaymentSummaryBlock";
import { PrintAndOrderRow } from "./PrintAndOrderRow";
import { QrPaymentButton } from "./QrPaymentButton";
import { SummaryRow } from "./SummaryRow";
import { formatVnd } from "@erp/ui";

export interface PaymentPanelState {
  customerQuery: string;
  saleMode: string;
  itemCount: number;
  total: number;
  deposit: number;
  paymentMethod: PaymentMethodOption;
  paidAmount: number;
  changeAmount: number;
  debt: boolean;
  debtAmount: number;
  note: string;
  printInvoice: boolean;
  preorder: boolean;
  selectedSuggestionId: string | null;
}

export interface PaymentSummaryPanelProps {
  datetime: string;
  state: PaymentPanelState;
  suggestions: CashSuggestion[];
  onCustomerQueryChange: (q: string) => void;
  onPickSaleMode?: () => void;
  onAddCustomer?: () => void;
  onScanQr?: () => void;
  onPickMethod?: () => void;
  onDebtChange: (next: boolean) => void;
  onNoteChange: (note: string) => void;
  onPrintInvoiceChange: (next: boolean) => void;
  onPreorderChange: (next: boolean) => void;
  onPickSuggestion: (s: CashSuggestion) => void;
  onSaveDraft: () => void;
  onCollect: () => void;
  onPrintQr?: () => void;
  collectDisabled?: boolean;
}

/**
 * Right-hand sticky panel containing the entire payment / customer summary.
 * Pure composition over the smaller payment-* atoms.
 */
export const PaymentSummaryPanel = forwardRef<
  HTMLInputElement,
  PaymentSummaryPanelProps
>(function PaymentSummaryPanel(props, customerInputRef) {
  const {
    datetime,
    state,
    suggestions,
    onCustomerQueryChange,
    onPickSaleMode,
    onAddCustomer,
    onScanQr,
    onPickMethod,
    onDebtChange,
    onNoteChange,
    onPrintInvoiceChange,
    onPreorderChange,
    onPickSuggestion,
    onSaveDraft,
    onCollect,
    onPrintQr,
    collectDisabled,
  } = props;

  const amountDue = Math.max(0, state.total - state.deposit);

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col gap-3 border-l border-gray-200 bg-white px-4 py-3">
      <PaymentSubTopBar
        datetime={datetime}
        saleMode={state.saleMode}
        onPickSaleMode={onPickSaleMode}
      />

      <CustomerInputRow
        ref={customerInputRef}
        value={state.customerQuery}
        onChange={onCustomerQueryChange}
        onAddCustomer={onAddCustomer}
        onScanQr={onScanQr}
      />

      <PaymentSummaryBlock
        itemCount={state.itemCount}
        total={state.total}
        deposit={state.deposit}
        amountDue={amountDue}
      />

      <PaymentMethodRow
        method={state.paymentMethod}
        amount={state.paidAmount}
        onPickMethod={onPickMethod}
      />

      <SummaryRow
        label="Trả lại khách"
        value={
          <span className="font-bold text-gray-900">
            {formatVnd(state.changeAmount)}
          </span>
        }
      />

      <DebtCheckRow
        checked={state.debt}
        onChange={onDebtChange}
        amount={state.debtAmount}
      />

      <NoteInput value={state.note} onChange={onNoteChange} />

      <QrPaymentButton onClick={onPrintQr} />

      <div className="mt-auto space-y-3">
        <PrintAndOrderRow
          printInvoice={state.printInvoice}
          onPrintInvoiceChange={onPrintInvoiceChange}
          preorder={state.preorder}
          onPreorderChange={onPreorderChange}
        />
        <CashSuggestionList
          suggestions={suggestions}
          selectedId={state.selectedSuggestionId}
          onPick={onPickSuggestion}
        />
        <PaymentCTAButtons
          onSaveDraft={onSaveDraft}
          onCollect={onCollect}
          collectDisabled={collectDisabled}
        />
      </div>
    </aside>
  );
});
