import { forwardRef, useMemo, useState, type ReactNode } from "react";
import { formatVnd } from "@erp/ui";
import type { SearchSuggestion } from "../common/SearchPopover";
import type {
  CashSuggestion,
  PaymentMethod,
  PaymentMethodOption,
} from "../types";
import { AlertBar } from "../common/AlertBar";
import {
  GiftIcon,
  PlusCircleIcon,
  QrIcon,
  ReceiptIcon,
} from "../icons/Icon";
import type { InvoicePrinter } from "../printing/InvoicePrinter";
import { CashSuggestionList } from "./CashSuggestionList";
import type { CustomerActionItem } from "./CustomerActions";
import { CustomerDetailDialog } from "./customerDetail/CustomerDetailDialog";
import type { CustomerDetailData } from "./customerDetail/types";
import { CustomerInputRow } from "./CustomerInputRow";
import { DebtCheckRow } from "./DebtCheckRow";
import { KeepChangeRow } from "./KeepChangeRow";
import { NoteInput } from "./NoteInput";
import {
  PaymentCTAButtons,
  type InvoicePayloadInput,
} from "./PaymentCTAButtons";
import { PaymentMethodRow } from "./PaymentMethodRow";
import { PaymentSubTopBar } from "./PaymentSubTopBar";
import { PaymentSummaryBlock } from "./PaymentSummaryBlock";
import { PrintAndOrderRow } from "./PrintAndOrderRow";
import { PromoMenu, type PromoMenuOption } from "./PromoMenu";
import { QrPaymentButton } from "./QrPaymentButton";
import { SelectedCustomerCard } from "./SelectedCustomerCard";
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
  /** Display name shown in the selected-customer chip when set. */
  selectedCustomerLabel?: string | null;
  /** Outstanding debt for the selected customer (sub-line on the chip). */
  customerDebt?: number | null;
  onClearCustomer?: () => void;
  customerFieldError?: string;

  /** Optional callback invoked when the user picks a promo-menu option. */
  onPickPromoOption?: (option: PromoMenuOption) => void;

  /** Quick-action button: Quét QR khách. Omit to hide. */
  onScanCustomerQr?: () => void;

  /**
   * Extra customer-area buttons appended after the built-in QR / add /
   * receipts / voucher actions. Future buttons should be added here so
   * the panel doesn't need new props for every new action.
   */
  customerExtraActions?: CustomerActionItem[];

  /**
   * Detail data shown when the user clicks the selected-customer chip.
   * When omitted, the panel synthesises a minimal payload from
   * `selectedCustomerLabel` + `customerDebt` so the dialog still opens.
   */
  customerDetail?: CustomerDetailData;
  /** Tab footer callbacks — forwarded to `CustomerDetailDialog`. */
  onConfirmCustomerDetail?: () => void;
  onEditCustomer?: () => void;
  onCollectCustomerDebt?: () => void;
  onChangeCustomerCard?: () => void;
  onRefreshCustomerPoints?: () => void;

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

  // Keep change ("Khách không lấy tiền thừa") — only rendered when no
  // customer is selected (per spec 4.7.10). Provide both to enable the row.
  keepChange?: boolean;
  onKeepChangeChange?: (next: boolean) => void;

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
 * F4 shortcut can focus it (the input is mounted only when no customer is
 * selected; once selected the chip card replaces it and the ref resolves to
 * `null` until the user clears the selection).
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
    customerDebt,
    onClearCustomer,
    customerFieldError,
    onPickPromoOption,
    onScanCustomerQr,
    customerExtraActions,
    customerDetail,
    onConfirmCustomerDetail,
    onEditCustomer,
    onCollectCustomerDebt,
    onChangeCustomerCard,
    onRefreshCustomerPoints,
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
    keepChange,
    onKeepChangeChange,
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
  const hasCustomer = Boolean(selectedCustomerLabel);

  // Promo menu (4.13) — open state lives here so the trigger can be wired
  // through the shared customer-action group below.
  const [promoOpen, setPromoOpen] = useState(false);
  const handlePromoSelect = (option: PromoMenuOption) => {
    onPickPromoOption?.(option);
  };

  // Customer detail dialog — opened by clicking the selected-customer chip.
  const [detailOpen, setDetailOpen] = useState(false);
  const dialogData: CustomerDetailData = useMemo(() => {
    if (customerDetail) return customerDetail;
    // Fallback: build a minimal payload from what the panel already knows.
    return {
      identity: { name: selectedCustomerLabel ?? "" },
      stats:
        typeof customerDebt === "number"
          ? {
              totalSpent: 0,
              invoiceCount: 0,
              debtTotal: customerDebt,
              debtDocumentCount: 0,
            }
          : undefined,
    };
  }, [customerDetail, selectedCustomerLabel, customerDebt]);

  /**
   * Source of truth for the customer-area action icons.
   *
   * Visibility rules (per product spec):
   *   • No customer selected → show every action ("qr", "add", "receipts",
   *     "voucher").
   *   • Customer selected → only "receipts" and "voucher" stay; "qr" and
   *     "add" don't make sense once a customer is chosen.
   *
   * Each action declares a `keepWhenSelected` flag so this rule lives next
   * to the action itself — adding a new icon later just sets the flag.
   * `customerExtraActions` (from the page) appends; entries default to
   * staying visible in both states unless they opt out.
   */
  const customerActions = useMemo<CustomerActionItem[]>(() => {
    const all: Array<CustomerActionItem & { keepWhenSelected: boolean }> = [
      {
        key: "qr",
        ariaLabel: "Quét QR khách",
        icon: <QrIcon size={16} />,
        onClick: onScanCustomerQr,
        keepWhenSelected: false,
      },
      {
        key: "add",
        ariaLabel: "Thêm khách mới",
        icon: <PlusCircleIcon size={16} className="text-green-500" />,
        onClick: onAddCustomer,
        keepWhenSelected: false,
      },
      {
        key: "voucher",
        ariaLabel: "Voucher / quà tặng",
        icon: <GiftIcon size={16} />,
        onClick: () => setPromoOpen((o) => !o),
        isToggled: promoOpen,
        keepWhenSelected: true,
      },
      ...(customerExtraActions ?? []).map((a) => ({
        ...a,
        keepWhenSelected: true,
      })),
    ];
    const filtered = hasCustomer
      ? all.filter((a) => a.keepWhenSelected)
      : all;
    // Strip the local-only `keepWhenSelected` field before handing to
    // CustomerActions — it's a panel-internal visibility flag, not a public
    // CustomerActionItem property.
    return filtered.map(({ keepWhenSelected: _k, ...rest }) => rest);
  }, [
    hasCustomer,
    onAddCustomer,
    onOpenCustomerDirectory,
    onScanCustomerQr,
    promoOpen,
    customerExtraActions,
  ]);

  // Render keep-change row only when a customer is *not* selected and the
  // host has wired the boolean state (controlled prop pattern).
  const showKeepChange =
    !hasCustomer &&
    typeof keepChange === "boolean" &&
    typeof onKeepChangeChange === "function";

  return (
    <aside className="flex h-full w-[26dvw] shrink-0 flex-col overflow-hidden border-l border-gray-200 bg-white">
      <div className="flex-1 overflow-y-auto">
        {/* 4.1 TopBar — datetime + sale mode picker */}
        <div className="px-4">
          <PaymentSubTopBar
            datetime={datetime}
            saleMode={saleMode}
            onPickSaleMode={onPickSaleMode}
          />
        </div>

        {/* 4.2/4.3 Customer field — chip when selected, search-input otherwise */}
        <div className="relative px-4 py-2">
          {hasCustomer ? (
            <SelectedCustomerCard
              name={selectedCustomerLabel ?? ""}
              debt={customerDebt}
              onClear={onClearCustomer ?? (() => {})}
              actions={customerActions}
              onClick={() => setDetailOpen(true)}
            />
          ) : (
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
              actions={customerActions}
              emptyAction={{
                label: "Tạo khách mới",
                onClick: () => onAddCustomer(),
              }}
            />
          )}

          <PromoMenu
            open={promoOpen}
            onClose={() => setPromoOpen(false)}
            onSelect={handlePromoSelect}
          />

          {customerFieldError ? (
            <p className="mt-1 text-[12px] text-red-600" role="alert">
              {customerFieldError}
            </p>
          ) : null}
        </div>

        {/* 4.4 Summary rows */}
        <div className="px-4">
          <PaymentSummaryBlock
            itemCount={itemCount}
            total={total}
            deposit={deposit}
            amountDue={amountDue}
          />
        </div>

        {/* 4.5 Payment method */}
        <div className="border-t border-gray-200 px-4">
          <PaymentMethodRow
            method={paymentMethod}
            amount={paidAmount}
            amountReadOnly={amountReadOnly}
            methods={methods}
            onChangeMethod={onChangeMethod}
            onChangeAmount={onChangePaidAmount}
          />
        </div>

        {/* 4.6 Change-return row */}
        <div className="border-t border-gray-200 px-4 py-2">
          <SummaryRow
            label={
              <span className="font-semibold text-gray-900">Trả lại khách</span>
            }
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

        {/* 4.7 Checkbox rows */}
        <div className="border-t border-gray-200 px-4">
          {showKeepChange ? (
            <KeepChangeRow
              checked={keepChange ?? false}
              onChange={onKeepChangeChange ?? (() => {})}
            />
          ) : null}
          <DebtCheckRow
            checked={debt}
            onChange={onDebtChange}
            amount={debtAmount}
          />
        </div>

        {/* 4.8 Note */}
        <div className="border-t border-b border-gray-200 px-4">
          <NoteInput value={note} onChange={onNoteChange} />
        </div>

        {/* 4.9 Print-QR ghost button */}
        <div className="px-4 py-3">
          <QrPaymentButton onClick={onPrintQr} />
        </div>
      </div>

      {/* Bottom-pinned section: 4.10 → 4.12 */}
      <div className="border-t border-gray-200 bg-white">
        <PrintAndOrderRow
          printInvoice={printInvoice}
          onPrintInvoiceChange={onPrintInvoiceChange}
          preorder={preorder}
          onPreorderChange={onPreorderChange}
        />
        {suggestions.length > 0 ? (
          <div className="py-3">
            <CashSuggestionList
              suggestions={suggestions}
              selectedId={selectedSuggestionId}
              onPick={onPickSuggestion}
            />
          </div>
        ) : null}
        <PaymentCTAButtons
          onSaveDraft={onSaveDraft}
          onCollect={onCollect}
          collectDisabled={collectDisabled}
          invoice={invoice}
          printer={invoicePrinter}
        />
      </div>

      <CustomerDetailDialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        data={dialogData}
        onConfirm={onConfirmCustomerDetail}
        onEdit={onEditCustomer}
        onCollectDebt={onCollectCustomerDebt}
        onChangeCard={onChangeCustomerCard}
        onRefreshPoints={onRefreshCustomerPoints}
      />
    </aside>
  );
}) as <TCustomer>(
  props: PaymentSummaryPanelProps<TCustomer> & {
    ref?: React.Ref<HTMLInputElement>;
  },
) => ReturnType<React.FC>;
