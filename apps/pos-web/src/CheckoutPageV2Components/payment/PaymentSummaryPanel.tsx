import { forwardRef, type ReactNode } from "react";
import { formatVnd } from "@erp/ui";
import type { SearchSuggestion } from "../common/SearchPopover";
import type {
  CashSuggestion,
  PaymentMethod,
  PaymentMethodOption,
} from "../types";
import { AlertBar } from "../common/AlertBar";
import type { InvoicePrinter } from "../printing/InvoicePrinter";
import { CashSuggestionList } from "./CashSuggestionList";
import { CustomerInputRow } from "./CustomerInputRow";
import { DebtCheckRow } from "./DebtCheckRow";
import { NoteInput } from "./NoteInput";
import {
  PaymentCTAButtons,
  type InvoicePayloadInput,
} from "./PaymentCTAButtons";
import { PaymentMethodRow } from "./PaymentMethodRow";
import { PaymentSubTopBar } from "./PaymentSubTopBar";
import { PaymentSummaryBlock } from "./PaymentSummaryBlock";
import { PrintAndOrderRow } from "./PrintAndOrderRow";
import { QrPaymentButton } from "./QrPaymentButton";
import { SummaryRow } from "./SummaryRow";

export interface PaymentSummaryPanelProps<TCustomer> {
  // Sub-topbar
  datetime: string;
  saleMode: string;
  onPickSaleMode?: () => void;

  // Customer search
  customerQuery: string;
  onCustomerQueryChange: (q: string) => void;
  customerSearch: (q: string) => Promise<SearchSuggestion<TCustomer>[]>;
  onSelectCustomer: (c: TCustomer) => void;
  customerItemKey: (c: TCustomer) => string;
  customerRenderItem: (c: TCustomer) => ReactNode;
  customerRenderMeta?: (c: TCustomer) => ReactNode;
  onSubmitCustomerQuery?: (q: string) => boolean | void;
  onAddCustomer: () => void;
  onOpenCustomerDirectory?: () => void;
  selectedCustomerLabel?: string | null;
  onClearCustomer?: () => void;
  customerFieldError?: string;

  // Summary
  itemCount: number;
  total: number;
  deposit: number;

  // Payment method
  methods: readonly PaymentMethodOption[];
  paymentMethod: PaymentMethodOption;
  paidAmount: number;
  amountReadOnly?: boolean;
  onChangeMethod: (m: PaymentMethod) => void;
  onChangePaidAmount: (raw: string) => void;
  changeAmount: number;
  shortageAmount: number;

  // Debt
  debt: boolean;
  debtAmount: number;
  onDebtChange: (next: boolean) => void;

  // Note
  note: string;
  onNoteChange: (n: string) => void;

  // QR
  onPrintQr?: () => void;

  // Footer
  printInvoice: boolean;
  onPrintInvoiceChange: (next: boolean) => void;
  preorder: boolean;
  onPreorderChange: (next: boolean) => void;
  suggestions: CashSuggestion[];
  selectedSuggestionId: string | null;
  onPickSuggestion: (s: CashSuggestion) => void;
  onSaveDraft: () => void;
  onCollect: () => void;
  collectDisabled?: boolean;

  /** Optional invoice payload (or factory) — when set, "Thu tiền" prints first. */
  invoice?: InvoicePayloadInput;
  /** Per-call printer override forwarded to `PaymentCTAButtons`. */
  invoicePrinter?: InvoicePrinter;
}

/**
 * Right-hand sticky panel containing the entire payment / customer summary.
 * The outer ref forwards to the customer search input so the page-level
 * F4 shortcut can focus it.
 */
export const PaymentSummaryPanel = forwardRef(function PaymentSummaryPanel<
  TCustomer,
>(
  props: PaymentSummaryPanelProps<TCustomer>,
  customerInputRef: React.Ref<HTMLInputElement>,
) {
  const {
    datetime,
    saleMode,
    onPickSaleMode,
    customerQuery,
    onCustomerQueryChange,
    customerSearch,
    onSelectCustomer,
    customerItemKey,
    customerRenderItem,
    customerRenderMeta,
    onSubmitCustomerQuery,
    onAddCustomer,
    onOpenCustomerDirectory,
    selectedCustomerLabel,
    onClearCustomer,
    customerFieldError,
    itemCount,
    total,
    deposit,
    methods,
    paymentMethod,
    paidAmount,
    amountReadOnly,
    onChangeMethod,
    onChangePaidAmount,
    changeAmount,
    shortageAmount,
    debt,
    debtAmount,
    onDebtChange,
    note,
    onNoteChange,
    onPrintQr,
    printInvoice,
    onPrintInvoiceChange,
    preorder,
    onPreorderChange,
    suggestions,
    selectedSuggestionId,
    onPickSuggestion,
    onSaveDraft,
    onCollect,
    collectDisabled,
    invoice,
    invoicePrinter,
  } = props;

  const amountDue = Math.max(0, total - deposit);

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-white px-4 py-3">
      <PaymentSubTopBar
        datetime={datetime}
        saleMode={saleMode}
        onPickSaleMode={onPickSaleMode}
      />

      <CustomerInputRow<TCustomer>
        ref={customerInputRef}
        value={customerQuery}
        onChange={onCustomerQueryChange}
        search={customerSearch}
        onSelect={onSelectCustomer}
        itemKey={customerItemKey}
        renderItem={customerRenderItem}
        renderMeta={customerRenderMeta}
        onSubmitQuery={onSubmitCustomerQuery}
        onAddCustomer={onAddCustomer}
        onOpenReceipts={onOpenCustomerDirectory}
        emptyAction={{
          label: "Tạo khách mới",
          onClick: () => onAddCustomer(),
        }}
      />

      {customerFieldError ? (
        <p className="text-[12px] text-red-600" role="alert">
          {customerFieldError}
        </p>
      ) : selectedCustomerLabel ? (
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium text-gray-900">
            {selectedCustomerLabel}
          </span>
          {onClearCustomer ? (
            <button
              type="button"
              onClick={onClearCustomer}
              className="text-[12px] text-gray-500 hover:text-red-600"
            >
              Bỏ khách
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-[12px] text-gray-400">Chưa chọn — bán lẻ.</p>
      )}

      <PaymentSummaryBlock
        itemCount={itemCount}
        total={total}
        deposit={deposit}
        amountDue={amountDue}
      />

      <PaymentMethodRow
        method={paymentMethod}
        amount={paidAmount}
        amountReadOnly={amountReadOnly}
        methods={methods}
        onChangeMethod={onChangeMethod}
        onChangeAmount={onChangePaidAmount}
      />

      <SummaryRow
        label="Trả lại khách"
        value={
          <span className="font-bold text-gray-900">
            {formatVnd(changeAmount)}
          </span>
        }
      />

      {shortageAmount > 0 ? (
        <AlertBar variant="error" className="rounded-md">
          Còn thiếu {formatVnd(shortageAmount)}
        </AlertBar>
      ) : null}

      <DebtCheckRow
        checked={debt}
        onChange={onDebtChange}
        amount={debtAmount}
      />

      <NoteInput value={note} onChange={onNoteChange} />

      <QrPaymentButton onClick={onPrintQr} />

      <div className="mt-auto space-y-3">
        <PrintAndOrderRow
          printInvoice={printInvoice}
          onPrintInvoiceChange={onPrintInvoiceChange}
          preorder={preorder}
          onPreorderChange={onPreorderChange}
        />
        {suggestions.length > 0 ? (
          <CashSuggestionList
            suggestions={suggestions}
            selectedId={selectedSuggestionId}
            onPick={onPickSuggestion}
          />
        ) : null}
        <PaymentCTAButtons
          onSaveDraft={onSaveDraft}
          onCollect={onCollect}
          collectDisabled={collectDisabled}
          invoice={invoice}
          printer={invoicePrinter}
        />
      </div>
    </aside>
  );
}) as <TCustomer>(
  props: PaymentSummaryPanelProps<TCustomer> & {
    ref?: React.Ref<HTMLInputElement>;
  },
) => ReturnType<React.FC>;
