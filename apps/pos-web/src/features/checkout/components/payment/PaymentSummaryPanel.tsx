import { forwardRef, useMemo, useState, type ReactNode } from "react";
import type { SearchSuggestion } from "../common/SearchPopover";
import type {
  CashSuggestion,
  PaymentMethodOption,
} from "../types";
import {
  ChevronDownIcon,
  GiftIcon,
  PlusCircleIcon,
  QrIcon,
  ReceiptIcon,
} from "@erp/pos/components/icons/Icon";
import type { InvoicePrinter } from "../printing/InvoicePrinter";
import {
  PromoMenuOptionEnum,
  type PromoMenuOption,
} from "../../constants/promoMenu";
import { CheckoutActionsSection } from "./sections/CheckoutActionsSection";
import { CustomerSection } from "./sections/CustomerSection";
import { PaymentSection } from "./sections/PaymentSection";
import type { CustomerActionItem } from "./CustomerActions";
import { CustomerDetailDialog } from "./customerDetail/CustomerDetailDialog";
import type { CustomerDetailData } from "./customerDetail/types";
import { type InvoicePayloadInput } from "./PaymentCTAButtons";
import { type PaymentLine } from "./PaymentMethodRow";
import {
  PromoMenu,
  type PromoMenuDiscountPoint,
  type PromoMenuVoucher,
} from "./PromoMenu";
import { PromotionSelectionModal } from "./promotion/PromotionSelectionModal";
import type { PromotionItem } from "./promotion/types";

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

  /**
   * Promotions shown inside the "Chương trình khuyến mãi" dialog. When
   * omitted (or empty) the dialog renders its empty state.
   */
  promotions?: PromotionItem[];
  /** Currently-applied promotion id (drives the highlighted row). */
  appliedPromotionId?: string | null;
  /** Fired when the user confirms a selection in the dialog. */
  onApplyPromotion?: (promotion: PromotionItem | null) => void;
  /**
   * "Thêm khuyến mại" — outline CTA inside the dialog. Omit to hide the
   * "Khuyến mại khác" section entirely.
   */
  onAddPromotion?: () => void;
  /**
   * Lift the dialog's search input (e.g. for server-side filtering with
   * debounce). Leave both unset to use built-in in-memory filtering.
   */
  promotionSearchValue?: string;
  onPromotionSearchChange?: (next: string) => void;
  /**
   * Optional callback for the legacy promo-menu (anchored to the chevron
   * next to "Voucher / Quà tặng"). Receives one of "promo" | "voucher" |
   * "discount". Omit to keep the menu silent.
   */
  onPickPromoOption?: (option: PromoMenuOption) => void;
  /**
   * Optional payload + handlers for the "Mã ưu đãi và điểm" dialog opened
   * from the menu's "Mã ưu đãi" entry. Forwarded directly to `PromoMenu`.
   */
  discountPoint?: PromoMenuDiscountPoint;
  /**
   * Optional payload + handlers for the "Voucher" dialog opened from the
   * menu's "Voucher" entry. Forwarded directly to `PromoMenu`.
   */
  voucher?: PromoMenuVoucher;

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

  // Payment methods (multi-line — user can split a sale across N methods)
  methods: readonly PaymentMethodOption[];
  paymentLines: PaymentLine[];
  onChangePaymentLines: (lines: PaymentLine[]) => void;
  /** Optional read-only predicate forwarded to `PaymentMethodList`. */
  paymentAmountReadOnly?: (line: PaymentLine, index: number) => boolean;
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
    promotions,
    appliedPromotionId,
    onApplyPromotion,
    onAddPromotion,
    promotionSearchValue,
    onPromotionSearchChange,
    onPickPromoOption,
    discountPoint,
    voucher,
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
    paymentLines,
    onChangePaymentLines,
    paymentAmountReadOnly,
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

  // Split-button on the customer row:
  //   • Gift icon ("Voucher / Quà tặng") → promotion-selection dialog.
  //   • Chevron secondary trigger → legacy `PromoMenu` (3 quick options).
  // Both states live here so `customerActions` below can wire each trigger.
  const [promotionDialogOpen, setPromotionDialogOpen] = useState(false);
  const [promoMenuOpen, setPromoMenuOpen] = useState(false);

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
        onClick: () => setPromotionDialogOpen(true),
        isToggled: promotionDialogOpen,
        secondary: {
          ariaLabel: "Mở danh sách ưu đãi nhanh",
          icon: <ChevronDownIcon size={14} />,
          onClick: () => setPromoMenuOpen((o) => !o),
          isToggled: promoMenuOpen,
        },
        popover: (
          <PromoMenu
            open={promoMenuOpen}
            onClose={() => setPromoMenuOpen(false)}
            onSelect={(opt) => {
              // "Khuyến mãi" reuses the same PromotionSelectionModal mounted
              // for the gift split-button — single source of truth for the
              // promotion picker.
              if (opt === PromoMenuOptionEnum.DISCOUNT) {
                setPromotionDialogOpen(true);
              }
              onPickPromoOption?.(opt);
            }}
            discountPoint={discountPoint}
            voucher={voucher}
          />
        ),
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
    onPickPromoOption,
    discountPoint,
    voucher,
    promotionDialogOpen,
    promoMenuOpen,
    customerExtraActions,
  ]);

  // Render keep-change row only when a customer is *not* selected and the
  // host has wired the boolean state (controlled prop pattern).
  const showKeepChange =
    !hasCustomer &&
    typeof keepChange === "boolean" &&
    typeof onKeepChangeChange === "function";

  return (
    <aside className="flex h-full min-w-[350px] w-[26dvw] shrink-0 flex-col overflow-hidden border-l border-gray-200 bg-white">
      <div className="flex-1 overflow-y-auto">
        <CustomerSection<TCustomer>
          datetime={datetime}
          saleMode={saleMode}
          onPickSaleMode={onPickSaleMode}
          hasCustomer={hasCustomer}
          selectedCustomerLabel={selectedCustomerLabel}
          customerDebt={customerDebt}
          onClearCustomer={onClearCustomer}
          customerActions={customerActions}
          onOpenCustomerDetail={() => setDetailOpen(true)}
          customerInputRef={customerInputRef}
          customerQuery={customerQuery}
          onCustomerQueryChange={onCustomerQueryChange}
          customerSearch={customerSearch}
          onSelectCustomer={onSelectCustomer}
          customerItemKey={customerItemKey}
          customerRenderItem={customerRenderItem}
          customerRenderMeta={customerRenderMeta}
          onSubmitCustomerQuery={onSubmitCustomerQuery}
          onAddCustomer={onAddCustomer}
          customerFieldError={customerFieldError}
        />

        <PaymentSection
          itemCount={itemCount}
          total={total}
          deposit={deposit}
          amountDue={amountDue}
          paymentLines={paymentLines}
          methods={methods}
          onChangePaymentLines={onChangePaymentLines}
          paymentAmountReadOnly={paymentAmountReadOnly}
          changeAmount={changeAmount}
          shortageAmount={shortageAmount}
          showKeepChange={showKeepChange}
          keepChange={keepChange}
          onKeepChangeChange={onKeepChangeChange}
          debt={debt}
          onDebtChange={onDebtChange}
          debtAmount={debtAmount}
          note={note}
          onNoteChange={onNoteChange}
          onPrintQr={onPrintQr}
        />
      </div>

      <CheckoutActionsSection
        printInvoice={printInvoice}
        onPrintInvoiceChange={onPrintInvoiceChange}
        preorder={preorder}
        onPreorderChange={onPreorderChange}
        suggestions={suggestions}
        selectedSuggestionId={selectedSuggestionId}
        onPickSuggestion={onPickSuggestion}
        onSaveDraft={onSaveDraft}
        onCollect={onCollect}
        collectDisabled={collectDisabled}
        invoice={invoice}
        invoicePrinter={invoicePrinter}
      />

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

      <PromotionSelectionModal
        open={promotionDialogOpen}
        onClose={() => setPromotionDialogOpen(false)}
        promotions={promotions}
        initialSelectedId={appliedPromotionId ?? null}
        searchValue={promotionSearchValue}
        onSearchChange={onPromotionSearchChange}
        onConfirm={onApplyPromotion}
        onAddPromotion={onAddPromotion}
      />
    </aside>
  );
}) as <TCustomer>(
  props: PaymentSummaryPanelProps<TCustomer> & {
    ref?: React.Ref<HTMLInputElement>;
  },
) => ReturnType<React.FC>;
