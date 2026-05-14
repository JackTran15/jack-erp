import {
  ChevronDownIcon,
  GiftIcon,
  PlusCircleIcon,
  QrIcon,
} from "@erp/pos/components/icons/Icon";
import {
  forwardRef,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  PromoMenuOptionEnum,
  type PromoMenuOption,
} from "../../constants/promoMenu";
import type { SearchSuggestion } from "../common/SearchPopover";
import type { CashSuggestion, PaymentMethodOption } from "../types";
import type { CustomerActionItem } from "./CustomerActions";
import { type PaymentLine } from "./PaymentMethodRow";
import {
  PromoMenu,
  type PromoMenuDiscountPoint,
  type PromoMenuVoucher,
} from "./PromoMenu";
import { QuickExchangeBadges } from "./QuickExchangeBadges";
import { DepositDialog } from "./DepositDialog";
import { CustomerDetailDialog } from "./customerDetail/CustomerDetailDialog";
import { PromotionSelectionModal } from "./promotion/PromotionSelectionModal";
import type { PromotionItem } from "./promotion/types";
import type { QrPaymentInfo } from "./VietQrPaymentDialog";
import { CheckoutActionsSection } from "./sections/CheckoutActionsSection";
import { CustomerSection } from "./sections/CustomerSection";
import { PaymentSection } from "./sections/PaymentSection";
import {
  PaymentMethodEnum,
  type PaymentMethod,
} from "../../constants/paymentMethod";

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
  /**
   * Ref to the "Add new customer" button — caller uses it to return focus to
   * this button after closing `CustomerCreateDialog`. When not provided, the
   * button still renders normally but without the ref attached.
   */
  addCustomerButtonRef?: RefObject<HTMLButtonElement | null>;
  onOpenCustomerDirectory?: () => void;
  /** Display name shown in the selected-customer chip when set. */
  selectedCustomerLabel?: string | null;
  /** Outstanding debt for the selected customer (sub-line on the chip). */
  customerDebt?: number | null;
  onClearCustomer?: () => void;
  customerFieldError?: string;

  /**
   * Promotions shown inside the "Promotion Program" dialog. When
   * omitted (or empty) the dialog renders its empty state.
   */
  promotions?: PromotionItem[];
  /** Currently-applied promotion id (drives the highlighted row). */
  appliedPromotionId?: string | null;
  /** Fired when the user confirms a selection in the dialog. */
  onApplyPromotion?: (promotion: PromotionItem | null) => void;
  /**
   * "Add promotion" — outline CTA inside the dialog. Omit to hide the
   * "Other promotions" section entirely.
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
   * next to "Voucher / Gift"). Receives one of "promo" | "voucher" |
   * "discount". Omit to keep the menu silent.
   */
  onPickPromoOption?: (option: PromoMenuOption) => void;
  /**
   * Optional payload + handlers for the "Discount code & points" dialog opened
   * from the menu's "Discount code" entry. Forwarded directly to `PromoMenu`.
   */
  discountPoint?: PromoMenuDiscountPoint;
  /**
   * Optional payload + handlers for the "Voucher" dialog opened from the
   * menu's "Voucher" entry. Forwarded directly to `PromoMenu`.
   */
  voucher?: PromoMenuVoucher;

  /** Quick-action button: Scan customer QR. Omit to hide. */
  onScanCustomerQr?: () => void;

  /**
   * Extra customer-area buttons appended after the built-in QR / add /
   * receipts / voucher actions. Future buttons should be added here so
   * the panel doesn't need new props for every new action.
   */
  customerExtraActions?: CustomerActionItem[];

  /**
   * Selected customer id — required to open the `CustomerDetailDialog`,
   * which fetches its own data via `useCustomer(id)`. When null the chip
   * click is a no-op (the panel hides the chip in that state anyway).
   */
  selectedCustomerId?: string | null;
  /** Tab footer callbacks — forwarded to `CustomerDetailDialog`. */
  onConfirmCustomerDetail?: () => void;
  onEditCustomer?: () => void;
  onCollectCustomerDebt?: () => void;
  onChangeCustomerCard?: () => void;
  onRefreshCustomerPoints?: () => void;

  /** Return flows: read-only return / purchase-more labels + qty (quick exchange + invoice return). */
  quickExchangeBadges?: {
    returnQuantity: number;
    purchaseQuantity: number;
  } | null;

  // Summary
  itemCount: number;
  total: number;
  deposit: number;
  onDepositChange: (next: number) => void;
  onRequireCustomerForDeposit?: () => void;

  // Payment methods (multi-line — user can split a sale across N methods)
  methods: readonly PaymentMethodOption[];
  paymentLines: PaymentLine[];
  onChangePaymentLines: (lines: PaymentLine[]) => void;
  /** Optional read-only predicate forwarded to `PaymentMethodList`. */
  paymentAmountReadOnly?: (line: PaymentLine, index: number) => boolean;
  /** Ref forwarded to the amount input of the first payment line (for F12). */
  paymentAmountRef?: React.Ref<HTMLInputElement>;
  /** Effective change to give back (post `keepChange`). */
  changeAmount: number;
  /** Effective shortage (post `forgiveShortage`). */
  shortageAmount: number;
  /** Raw change amount (unaffected by `keepChange`) — drives row visibility. */
  rawChangeAmount: number;
  /** Raw shortage amount (unaffected by `forgiveShortage`) — drives row visibility. */
  rawShortageAmount: number;

  /**
   * When set with `onKeepChangeChange`, drives keep-change / forgive-shortage
   * rows: sale uses raw overpay vs raw shortage; refund uses one row for waive.
   * Keep-change ("Customer keeps the change") is only rendered when no
   * customer is selected (per spec 4.7.10).
   */
  keepChange?: boolean;
  onKeepChangeChange?: (next: boolean) => void;

  // Debt
  debt: boolean;
  debtAmount: number;
  onDebtChange: (next: boolean) => void;

  // Note
  note: string;
  onNoteChange: (n: string) => void;

  // QR — account + amount shown inside the VietQR dialog.
  qrPayment: QrPaymentInfo;

  // Footer
  printInvoice: boolean;
  onPrintInvoiceChange: (next: boolean) => void;
  preorder: boolean;
  onPreorderChange: (next: boolean) => void;
  suggestions: CashSuggestion[];
  selectedSuggestionId: string | null;
  onPickSuggestion: (s: CashSuggestion) => void;
  onSaveDraft?: () => void;
  onCancelInvoice?: () => void;
  /** Validation + commit + optional receipt print — see checkout page. */
  onCollect: () => void | Promise<void>;
  collectDisabled?: boolean;
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
    addCustomerButtonRef,
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
    selectedCustomerId,
    onConfirmCustomerDetail,
    onEditCustomer,
    onCollectCustomerDebt,
    onChangeCustomerCard,
    onRefreshCustomerPoints,
    quickExchangeBadges,
    itemCount,
    total,
    deposit,
    onDepositChange,
    onRequireCustomerForDeposit,
    methods,
    paymentLines,
    onChangePaymentLines,
    paymentAmountReadOnly,
    paymentAmountRef,
    changeAmount,
    shortageAmount,
    rawChangeAmount,
    rawShortageAmount,
    keepChange,
    onKeepChangeChange,
    debt,
    debtAmount,
    onDebtChange,
    note,
    onNoteChange,
    qrPayment,
    printInvoice,
    onPrintInvoiceChange,
    preorder,
    onPreorderChange,
    suggestions,
    selectedSuggestionId,
    onPickSuggestion,
    onSaveDraft,
    onCancelInvoice,
    onCollect,
    collectDisabled,
  } = props;

  const amountDue = Math.max(0, total - deposit);
  const hasCustomer = Boolean(selectedCustomerLabel);

  // Split-button on the customer row:
  //   • Gift icon ("Voucher / Gift") → promotion-selection dialog.
  //   • Chevron secondary trigger → legacy `PromoMenu` (3 quick options).
  // Both states live here so `customerActions` below can wire each trigger.
  const [promotionDialogOpen, setPromotionDialogOpen] = useState(false);
  const [promoMenuOpen, setPromoMenuOpen] = useState(false);

  // Customer detail dialog — opened by clicking the selected-customer chip.
  // Owns its own data fetching, so we only need to pass id + fallback name.
  const [detailOpen, setDetailOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [draftDepositAmount, setDraftDepositAmount] = useState(0);
  const [draftDepositMethod, setDraftDepositMethod] = useState<PaymentMethod>(
    PaymentMethodEnum.CASH,
  );

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
        triggerRef: addCustomerButtonRef,
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
              // "Promotion" reuses the same PromotionSelectionModal mounted
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
    const filtered = hasCustomer ? all.filter((a) => a.keepWhenSelected) : all;
    // Strip the local-only `keepWhenSelected` field before handing to
    // CustomerActions — it's a panel-internal visibility flag, not a public
    // CustomerActionItem property.
    return filtered.map(({ keepWhenSelected: _k, ...rest }) => rest);
  }, [
    hasCustomer,
    onAddCustomer,
    addCustomerButtonRef,
    onOpenCustomerDirectory,
    onScanCustomerQr,
    onPickPromoOption,
    discountPoint,
    voucher,
    promotionDialogOpen,
    promoMenuOpen,
    customerExtraActions,
  ]);

  // keepChange wires two sale rows (mutually exclusive) and one refund row.
  // Visibility keys off raw amounts so the row stays visible after checking.
  const isRefundFlow = total < 0;
  const hasKeepChangeWire =
    typeof keepChange === "boolean" && typeof onKeepChangeChange === "function";
  const showKeepChange =
    hasKeepChangeWire &&
    !debt &&
    (isRefundFlow
      ? rawChangeAmount > 0 || rawShortageAmount > 0
      : rawChangeAmount > 0);
  const showForgiveShortage =
    hasKeepChangeWire && !debt && !isRefundFlow && rawShortageAmount > 0;

  const handleOpenDepositDialog = () => {
    if (!selectedCustomerId) {
      onRequireCustomerForDeposit?.();
      return;
    }
    setDraftDepositAmount(deposit);
    setDraftDepositMethod(paymentLines[0]?.method ?? PaymentMethodEnum.CASH);
    setDepositDialogOpen(true);
  };

  const handleConfirmDeposit = () => {
    onDepositChange(Math.max(0, draftDepositAmount));
    setDepositDialogOpen(false);
  };

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

        {quickExchangeBadges != null ? (
          <QuickExchangeBadges
            returnQuantity={quickExchangeBadges.returnQuantity}
            purchaseQuantity={quickExchangeBadges.purchaseQuantity}
          />
        ) : null}

        <PaymentSection
          itemCount={itemCount}
          total={total}
          deposit={deposit}
          amountDue={amountDue}
          onDepositClick={handleOpenDepositDialog}
          paymentLines={paymentLines}
          methods={methods}
          onChangePaymentLines={onChangePaymentLines}
          paymentAmountReadOnly={paymentAmountReadOnly}
          paymentAmountRef={paymentAmountRef}
          isRefundFlow={isRefundFlow}
          changeAmount={changeAmount}
          shortageAmount={shortageAmount}
          showKeepChange={showKeepChange}
          showForgiveShortage={showForgiveShortage}
          keepChange={keepChange}
          onKeepChangeChange={onKeepChangeChange}
          rawChangeAmount={rawChangeAmount}
          rawShortageAmount={rawShortageAmount}
          debt={debt}
          onDebtChange={onDebtChange}
          debtAmount={debtAmount}
          note={note}
          onNoteChange={onNoteChange}
          qrPayment={qrPayment}
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
        onCancelInvoice={onCancelInvoice}
        onCollect={onCollect}
        collectDisabled={collectDisabled}
      />

      {selectedCustomerId ? (
        <CustomerDetailDialog
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          customerId={selectedCustomerId}
          fallbackName={selectedCustomerLabel ?? undefined}
          onConfirm={onConfirmCustomerDetail}
          onEdit={onEditCustomer}
          onCollectDebt={onCollectCustomerDebt}
          onChangeCard={onChangeCustomerCard}
          onRefreshPoints={onRefreshCustomerPoints}
        />
      ) : null}

      <DepositDialog
        open={depositDialogOpen}
        amount={draftDepositAmount}
        method={draftDepositMethod}
        methods={methods}
        onClose={() => setDepositDialogOpen(false)}
        onAmountChange={setDraftDepositAmount}
        onMethodChange={setDraftDepositMethod}
        onConfirm={handleConfirmDeposit}
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
