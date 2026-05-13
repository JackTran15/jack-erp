import type { PosSelectSearchSuggestion } from "@erp/pos/components/form/PosSelectSearch";
import { useAnnounce } from "@erp/pos/hooks/useAnnounce";
import {
  formatCustomerDisplay,
  type CustomerRow,
} from "@erp/pos/lib/customerApi";
import { type PosCatalogLine } from "@erp/pos/lib/posCatalogApi";
import { usePosBranchStore } from "@erp/pos/stores/usePosBranchStore";
import {
  CheckoutPane,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/usePosCheckoutSessionStore";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { CustomerCreateDialog } from "../components/customerCreate";

import { AppErrorDialog } from "@erp/pos/components/AppErrorDialog";
import { formatViDateTime } from "@erp/pos/lib/dateTime";
import { CancelInvoiceConfirmDialog } from "../components/CancelInvoiceConfirmDialog";
import { PanelCollapseHandle } from "../components/catalog/PanelCollapseHandle";
import { ProductCatalogGrid } from "../components/catalog/ProductCatalogGrid";
import { ProductCatalogHeader } from "../components/catalog/ProductCatalogHeader";
import { AlertBar } from "../components/common/AlertBar";
import { CheckoutExchangeTabs } from "../components/exchange/CheckoutExchangeTabs";
import { InvoiceLineItemTable } from "../components/invoice/InvoiceLineItemTable";
import { OversellCheckoutConfirmDialog } from "../components/invoice/OversellCheckoutConfirmDialog";
import {
  createPaymentLine,
  type PaymentLine,
} from "../components/payment/PaymentMethodRow";
import { PaymentSummaryPanel } from "../components/payment/PaymentSummaryPanel";
import type { PromotionItem } from "../components/payment/promotion/types";
import type { InvoicePayload } from "../components/printing/types";
import { useInvoicePrinter } from "../components/printing/useInvoicePrinter";
import { POSToolbar } from "../components/toolbar/POSToolbar";
import {
  CheckoutVariantEnum,
  type CatalogProduct,
  type DraftInvoice,
} from "../components/types";
import { PAYMENT_METHODS } from "../constants/paymentMethod";
import { useCheckoutCatalog } from "../hooks/useCheckoutCatalog";
import { useCheckoutCustomer } from "../hooks/useCheckoutCustomer";
import { useCheckoutHotkeys } from "../hooks/useCheckoutHotkeys";
import { useCheckoutPayment } from "../hooks/useCheckoutPayment";
import { useCheckoutSessionCart } from "../hooks/useCheckoutSessionCart";
import { buildCheckoutInvoicePayload } from "../lib/checkoutReceiptFactory";
import { resetCheckoutSaleSession } from "../lib/checkoutSaleSession";
import {
  formatOnHand,
  getOversellSaleLines,
  lineTotal,
  locationQtyFor,
  paymentLabel,
  promoOptionLabel,
  resolvePaymentMethodLabel,
} from "../lib/checkoutUtils";
import { clampPosCheckoutQtyNumber } from "../lib/posCheckoutQty";

interface Salesperson {
  id: string;
  name: string;
  code: string;
}

interface PriceBook {
  id: string;
  name: string;
}

interface ProductGroup {
  id: string;
  name: string;
}

const SALESPERSON_OPTIONS: ReadonlyArray<Salesperson> = [
  { id: "nv01", code: "NV01", name: "Nguyễn Văn A" },
  { id: "nv02", code: "NV02", name: "Trần Thị B" },
  { id: "nv03", code: "NV03", name: "Lê Văn C" },
];

const PRICE_BOOK_OPTIONS: ReadonlyArray<PriceBook> = [
  { id: "default", name: "Bảng giá chuẩn" },
  { id: "vip", name: "Bảng giá VIP" },
  { id: "wholesale", name: "Bảng giá sỉ" },
];

const CATALOG_GROUP_OPTIONS: ReadonlyArray<ProductGroup> = [
  { id: "all", name: "Tất cả" },
  { id: "drink", name: "Nước uống" },
  { id: "food", name: "Đồ ăn" },
  { id: "other", name: "Khác" },
];

function buildLocalSearch<T>(
  items: ReadonlyArray<T>,
  getLabel: (item: T) => string,
) {
  return (q: string): ReadonlyArray<PosSelectSearchSuggestion<T>> => {
    const lower = q.trim().toLowerCase();
    const matched = lower
      ? items.filter((item) => getLabel(item).toLowerCase().includes(lower))
      : items;
    return matched.map((item) => ({ item }));
  };
}

export function CheckoutPageV2() {
  const branchId = usePosBranchStore((s) => s.branchId)!;

  const productSearchRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const catalogSearchRef = useRef<HTMLInputElement>(null);
  const salespersonRef = useRef<HTMLInputElement>(null);
  const priceBookRef = useRef<HTMLInputElement>(null);
  const setKeepChangeRef = useRef<Dispatch<SetStateAction<boolean>> | null>(
    null,
  );
  const lastActiveSessionIdRef = useRef<string | null>(null);

  const sessions = usePosCheckoutSessionStore((s) => s.sessions);
  const activeSessionId = usePosCheckoutSessionStore((s) => s.activeSessionId);
  const removeSession = usePosCheckoutSessionStore((s) => s.removeSession);
  const addDraft = usePosCheckoutSessionStore((s) => s.addDraft);
  const nextDraftSeq = usePosCheckoutSessionStore((s) => s.nextDraftSeq);
  const resetActiveSessionAfterCheckout = usePosCheckoutSessionStore(
    (s) => s.resetActiveSessionAfterCheckout,
  );
  const ensureHydratedShape = usePosCheckoutSessionStore(
    (s) => s.ensureHydratedShape,
  );
  const setActiveCheckoutPane = usePosCheckoutSessionStore(
    (s) => s.setActiveCheckoutPane,
  );

  useEffect(() => {
    ensureHydratedShape();
  }, [ensureHydratedShape]);

  const {
    catalog,
    catalogLoading,
    catalogError,
    loadCatalog,
    toolbar,
    setToolbar,
    catalogQuery,
    setCatalogQuery,
    catalogGroup,
    setCatalogGroup,
    catalogCollapsed,
    setCatalogCollapsed,
    filteredProducts,
    catalogProducts,
    productSearchAdapter,
  } = useCheckoutCatalog(branchId);

  const { message: announcement, announce } = useAnnounce();

  const {
    checkoutVariant,
    purchaseCart,
    returnCart,
    activeCheckoutPane,
    cart,
    selectedLineId,
    setSelectedLineId,
    cartError,
    setCartError,
    grandTotal,
    addProduct,
    handleCatalogSelect: handleCatalogSelectFromCart,
    updateUnitPrice,
    updateQty,
    bumpQty,
    removeLine,
    isLineWarning,
    itemCountForPayment,
    linesForDraftSingle,
  } = useCheckoutSessionCart({ announce });

  const isReturnExchangeInvoice = useMemo(
    () =>
      checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE ||
      checkoutVariant === CheckoutVariantEnum.INVOICE_RETURN,
    [checkoutVariant],
  );

  const invoiceTableCheckoutPane = useMemo<CheckoutPane>(() => {
    if (
      checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE &&
      activeCheckoutPane === CheckoutPane.RETURN
    ) {
      return CheckoutPane.RETURN;
    }
    return CheckoutPane.PURCHASE;
  }, [checkoutVariant, activeCheckoutPane]);

  const [selectedSalesperson, setSelectedSalesperson] =
    useState<Salesperson | null>(null);
  const [selectedPriceBook, setSelectedPriceBook] = useState<PriceBook | null>(
    null,
  );
  const selectedCatalogGroup = useMemo<ProductGroup | null>(
    () => CATALOG_GROUP_OPTIONS.find((g) => g.id === catalogGroup) ?? null,
    [catalogGroup],
  );

  const salespersonSearch = useMemo(
    () => buildLocalSearch(SALESPERSON_OPTIONS, (s) => s.name),
    [],
  );
  const priceBookSearch = useMemo(
    () => buildLocalSearch(PRICE_BOOK_OPTIONS, (p) => p.name),
    [],
  );
  const catalogGroupSearch = useMemo(
    () => buildLocalSearch(CATALOG_GROUP_OPTIONS, (g) => g.name),
    [],
  );

  const voucherLineSource = useMemo(() => {
    if (checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE) {
      return [...purchaseCart, ...returnCart];
    }
    return purchaseCart;
  }, [checkoutVariant, purchaseCart, returnCart]);

  const hasAnyCartLines = useMemo(() => {
    if (checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE) {
      return purchaseCart.length + returnCart.length > 0;
    }
    return purchaseCart.length > 0;
  }, [checkoutVariant, purchaseCart, returnCart]);

  const onCustomerSelectedClearKeepChange = useCallback(
    (_customer: CustomerRow) => {
      setKeepChangeRef.current?.(false);
    },
    [],
  );

  const {
    selectedCustomer,
    setSelectedCustomer,
    customerQuery,
    setCustomerQuery,
    customerFieldError,
    setCustomerFieldError,
    createCustomerOpen,
    setCreateCustomerOpen,
    createDefaultQuery,
    setCreateDefaultQuery,
    editCustomerOpen,
    setEditCustomerOpen,
    customerSearchAdapter,
    pickCustomer,
    handleCustomerSubmitQuery,
    handleClearCustomer,
    handleAddCustomer,
  } = useCheckoutCustomer({
    announce,
    formatCustomerLabel: formatCustomerDisplay,
    onCustomerSelected: onCustomerSelectedClearKeepChange,
  });

  const [appliedPromotion, setAppliedPromotion] =
    useState<PromotionItem | null>(null);
  const promotions = useMemo<PromotionItem[]>(() => [], []);
  const datetime = useMemo(() => formatViDateTime(new Date()), []);

  const [deposit, setDeposit] = useState(0);
  const settlementGrandTotal = grandTotal - deposit;

  const { setDebt, setKeepChange, ...paymentCore } = useCheckoutPayment({
    grandTotal: settlementGrandTotal,
    methods: PAYMENT_METHODS,
  });

  const handleDebtChange = useCallback(
    (next: boolean) => {
      if (next && !selectedCustomer) {
        setCartError("Hóa đơn chưa chọn khách hàng, vui lòng kiểm tra lại.");
        return;
      }
      if (next) {
        setKeepChange(false);
      }
      setDebt(next);
    },
    [selectedCustomer, setCartError, setDebt, setKeepChange],
  );

  const handleRequireCustomerForDeposit = useCallback(() => {
    setCartError("Hóa đơn chưa chọn khách hàng, vui lòng kiểm tra lại.");
  }, [setCartError]);

  const payment = {
    deposit,
    setDeposit,
    settlementGrandTotal,
    handleDebtChange,
    handleRequireCustomerForDeposit,
    setDebt,
    setKeepChange,
    ...paymentCore,
  };
  setKeepChangeRef.current = payment.setKeepChange;

  const [cancelInvoiceDialogOpen, setCancelInvoiceDialogOpen] = useState(false);
  const [oversellCheckoutOpen, setOversellCheckoutOpen] = useState(false);

  const onResetLocalCheckoutUi = useCallback(() => {
    resetCheckoutSaleSession({
      setSelectedCustomer,
      setCustomerQuery,
      setCustomerFieldError,
      setPaymentLines: payment.setPaymentLines,
      setSelectedSuggestionId: payment.setSelectedSuggestionId,
      setNote: payment.setNote,
      setKeepChange: payment.setKeepChange,
      setDebt: payment.setDebt,
    });
    payment.setDeposit(0);
  }, [
    setSelectedCustomer,
    setCustomerQuery,
    setCustomerFieldError,
    payment.setPaymentLines,
    payment.setSelectedSuggestionId,
    payment.setNote,
    payment.setKeepChange,
    payment.setDebt,
    payment.setDeposit,
  ]);

  const settlementAbsCheckout =
    settlementGrandTotal < 0
      ? -settlementGrandTotal
      : Math.max(0, settlementGrandTotal);

  const receiptLines = useMemo(() => {
    if (checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE) {
      return [...returnCart, ...purchaseCart];
    }
    return purchaseCart;
  }, [checkoutVariant, returnCart, purchaseCart]);

  const invoicePrinter = useInvoicePrinter();

  const buildReceiptPayload = useCallback((): InvoicePayload | null => {
    return buildCheckoutInvoicePayload({
      printInvoice: payment.printInvoice,
      cart: receiptLines,
      grandTotal,
      totalPaid: payment.totalPaid,
      paymentLines: payment.paymentLines,
      primaryMethodLabel: payment.primaryMethodLabel,
      methods: PAYMENT_METHODS,
      keepChange: payment.keepChange,
      debt: payment.debt,
    });
  }, [
    payment.printInvoice,
    receiptLines,
    grandTotal,
    payment.totalPaid,
    payment.paymentLines,
    payment.primaryMethodLabel,
    payment.keepChange,
    payment.debt,
  ]);

  const printReceiptIfNeeded = useCallback(
    async (payload: InvoicePayload | null) => {
      if (!payload) return;
      try {
        await invoicePrinter.print(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Lỗi in hóa đơn:", err);
      }
    },
    [invoicePrinter],
  );

  const handleCheckout = useCallback(
    (
      e: FormEvent | { preventDefault: () => void },
      options?: { bypassOversellModal?: boolean },
    ): boolean => {
      e.preventDefault();
      if (!hasAnyCartLines) {
        setCartError("Giỏ hàng trống.");
        return false;
      }
      if (payment.debt && !selectedCustomer) {
        setCartError("Hóa đơn chưa chọn khách hàng, vui lòng kiểm tra lại.");
        return false;
      }
      if (purchaseCart.some((l) => l.isReturnCredit && l.qty > l.maxQty)) {
        setCartError(
          "Số lượng hoàn trả vượt quá số lượng được phép trên hóa đơn gốc. Vui lòng kiểm tra lại.",
        );
        return false;
      }
      const saleNetReturnToCustomer =
        payment.changeAmount - payment.shortageAmount;
      if (
        settlementGrandTotal > 0 &&
        saleNetReturnToCustomer < 0 &&
        !payment.keepChange &&
        !(payment.debt && selectedCustomer)
      ) {
        setCartError(
          "Bạn chưa nhập đủ số tiền cần thanh toán. Vui lòng kiểm tra lại!",
        );
        return false;
      }
      if (
        settlementGrandTotal < 0 &&
        payment.totalPaid < settlementAbsCheckout &&
        !payment.keepChange &&
        !(payment.debt && selectedCustomer)
      ) {
        setCartError(
          "Bạn chưa nhập đủ số tiền cần trả khách. Vui lòng kiểm tra lại!",
        );
        return false;
      }
      if (
        settlementGrandTotal < 0 &&
        payment.totalPaid > settlementAbsCheckout
      ) {
        setCartError(
          "Số tiền nhập trong hình thức đổi trả đang vượt quá số tiền cần trả lại khách. Vui lòng kiểm tra lại!",
        );
        return false;
      }
      if (
        !options?.bypassOversellModal &&
        getOversellSaleLines(purchaseCart).length > 0
      ) {
        setOversellCheckoutOpen(true);
        return false;
      }
      const who = selectedCustomer
        ? ` cho ${formatCustomerDisplay(selectedCustomer)}`
        : " (khách lẻ)";
      announce(
        `Đã ghi nhận thanh toán${who}, ${new Intl.NumberFormat("vi-VN", {
          style: "currency",
          currency: "VND",
          maximumFractionDigits: 0,
        }).format(
          settlementGrandTotal,
        )}, ${paymentLabel(payment.primaryMethod)}.`,
      );
      resetActiveSessionAfterCheckout();
      onResetLocalCheckoutUi();
      return true;
    },
    [
      announce,
      payment.changeAmount,
      payment.debt,
      payment.keepChange,
      payment.primaryMethod,
      payment.shortageAmount,
      hasAnyCartLines,
      purchaseCart,
      resetActiveSessionAfterCheckout,
      selectedCustomer,
      settlementGrandTotal,
      settlementAbsCheckout,
      onResetLocalCheckoutUi,
      setCartError,
      setOversellCheckoutOpen,
    ],
  );

  const finalizeCheckoutAndPrint = useCallback(
    async (options?: { bypassOversellModal?: boolean }) => {
      const payload = buildReceiptPayload();
      const ok = handleCheckout({ preventDefault: () => {} }, options);
      if (!ok) return;
      await printReceiptIfNeeded(payload);
    },
    [buildReceiptPayload, handleCheckout, printReceiptIfNeeded],
  );

  const labelForMethod = useCallback(
    (m: PaymentLine["method"]): string =>
      resolvePaymentMethodLabel(m, PAYMENT_METHODS),
    [],
  );

  const handleSaveDraft = useCallback(() => {
    if (!hasAnyCartLines) return;

    const now = new Date();
    const yy = String(now.getFullYear() % 100).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const seq = String(nextDraftSeq()).padStart(4, "0");
    const invoiceNumber = `${yy}${mm}${dd}${seq}`;

    const paymentsSnapshot =
      payment.paymentLines
        .filter((l) => l.amount > 0)
        .map((l) => ({
          method: l.method,
          label: labelForMethod(l.method),
          amount: l.amount,
        })) ?? [];

    const snapshot: DraftInvoice = {
      id: crypto.randomUUID(),
      invoiceNumber,
      customerId: selectedCustomer?.id ?? null,
      customerName: selectedCustomer
        ? formatCustomerDisplay(selectedCustomer)
        : null,
      customerPhone: selectedCustomer?.phone ?? null,
      createdAt: now,
      lines: linesForDraftSingle.map((l) => ({ ...l })),
      total: grandTotal,
      payments: paymentsSnapshot.length > 0 ? paymentsSnapshot : undefined,
      checkoutVariant,
      quickExchangePurchase:
        checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE
          ? purchaseCart.map((l) => ({ ...l }))
          : undefined,
      quickExchangeReturn:
        checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE
          ? returnCart.map((l) => ({ ...l }))
          : undefined,
    };

    addDraft(snapshot);
    announce(`Đã lưu tạm hóa đơn ${invoiceNumber}.`);
    resetActiveSessionAfterCheckout();
    onResetLocalCheckoutUi();
  }, [
    addDraft,
    announce,
    checkoutVariant,
    grandTotal,
    hasAnyCartLines,
    labelForMethod,
    linesForDraftSingle,
    nextDraftSeq,
    payment.paymentLines,
    purchaseCart,
    returnCart,
    resetActiveSessionAfterCheckout,
    selectedCustomer,
    onResetLocalCheckoutUi,
  ]);

  useEffect(() => {
    if (lastActiveSessionIdRef.current === null) {
      lastActiveSessionIdRef.current = activeSessionId;
      return;
    }
    if (lastActiveSessionIdRef.current === activeSessionId) return;
    lastActiveSessionIdRef.current = activeSessionId;

    onResetLocalCheckoutUi();

    const pendingDraftPayments =
      usePosCheckoutSessionStore.getState().pendingDraftPaymentLines;
    usePosCheckoutSessionStore.getState().setPendingDraftPaymentLines(null);
    if (pendingDraftPayments && pendingDraftPayments.length > 0) {
      payment.setPaymentLines(
        pendingDraftPayments.map((row) =>
          createPaymentLine(row.method, row.amount),
        ),
      );
    }
    setCreateCustomerOpen(false);
    setEditCustomerOpen(false);
    setCreateDefaultQuery("");
    setCartError("");
    setCancelInvoiceDialogOpen(false);
    setOversellCheckoutOpen(false);
    setAppliedPromotion(null);
  }, [
    activeSessionId,
    onResetLocalCheckoutUi,
    payment.setPaymentLines,
    setCreateCustomerOpen,
    setEditCustomerOpen,
    setCreateDefaultQuery,
    setCartError,
    setCancelInvoiceDialogOpen,
    setOversellCheckoutOpen,
    setAppliedPromotion,
  ]);

  const handleSelectProduct = useCallback(
    (p: PosCatalogLine, qty = 1) => {
      const requested = clampPosCheckoutQtyNumber(qty);
      addProduct(p, requested);
      setToolbar((s) => ({ ...s, query: "" }));
      productSearchRef.current?.focus();
    },
    [addProduct, setToolbar],
  );

  const handleSubmitProductQuery = useCallback(
    (_q: string): boolean => {
      const matched = filteredProducts;
      if (matched.length === 1) {
        const requested = clampPosCheckoutQtyNumber(toolbar.qty);
        const line = matched[0]!;
        addProduct(line, requested);
        setToolbar((s) => ({ ...s, query: "" }));
        productSearchRef.current?.focus();
      }
      return true;
    },
    [addProduct, filteredProducts, toolbar.qty, setToolbar],
  );

  const handleCatalogSelect = useCallback(
    (product: CatalogProduct) => {
      handleCatalogSelectFromCart(product, catalog);
    },
    [catalog, handleCatalogSelectFromCart],
  );

  const handleRequestCancelInvoice = useCallback(() => {
    setCancelInvoiceDialogOpen(true);
  }, []);

  const handleConfirmCancelInvoice = useCallback(() => {
    setCancelInvoiceDialogOpen(false);
    if (sessions.length > 1) {
      removeSession(activeSessionId);
    } else {
      resetActiveSessionAfterCheckout();
      resetCheckoutSaleSession({
        setSelectedCustomer,
        setCustomerQuery,
        setCustomerFieldError,
        setPaymentLines: payment.setPaymentLines,
        setSelectedSuggestionId: payment.setSelectedSuggestionId,
        setNote: payment.setNote,
        setKeepChange: payment.setKeepChange,
        setDebt: payment.setDebt,
      });
    }
    announce("Đã hủy hóa đơn.");
  }, [
    announce,
    sessions.length,
    activeSessionId,
    removeSession,
    resetActiveSessionAfterCheckout,
    setSelectedCustomer,
    setCustomerQuery,
    setCustomerFieldError,
    payment.setPaymentLines,
    payment.setSelectedSuggestionId,
    payment.setNote,
    payment.setKeepChange,
    payment.setDebt,
  ]);

  useCheckoutHotkeys({
    productSearchRef,
    customerSearchRef,
    catalogSearchRef,
    salespersonRef,
    priceBookRef,
    hasCartItems: hasAnyCartLines,
    onCheckout: () => {
      void finalizeCheckoutAndPrint();
    },
    onSaveDraft: isReturnExchangeInvoice ? undefined : handleSaveDraft,
  });

  const quickExchangeReturnQty = useMemo(
    () => returnCart.reduce((s, l) => s + l.qty, 0),
    [returnCart],
  );
  const quickExchangePurchaseQty = useMemo(
    () => purchaseCart.reduce((s, l) => s + l.qty, 0),
    [purchaseCart],
  );
  const invoiceReturnReturnQty = useMemo(
    () =>
      purchaseCart
        .filter((l) => l.isReturnCredit)
        .reduce((s, l) => s + l.qty, 0),
    [purchaseCart],
  );
  const invoiceReturnPurchaseQty = useMemo(
    () =>
      purchaseCart
        .filter((l) => !l.isReturnCredit)
        .reduce((s, l) => s + l.qty, 0),
    [purchaseCart],
  );
  const quickExchangeBadges = useMemo(() => {
    if (checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE) {
      return {
        returnQuantity: quickExchangeReturnQty,
        purchaseQuantity: quickExchangePurchaseQty,
      };
    }
    if (checkoutVariant === CheckoutVariantEnum.INVOICE_RETURN) {
      return {
        returnQuantity: invoiceReturnReturnQty,
        purchaseQuantity: invoiceReturnPurchaseQty,
      };
    }
    return null;
  }, [
    checkoutVariant,
    invoiceReturnPurchaseQty,
    invoiceReturnReturnQty,
    quickExchangePurchaseQty,
    quickExchangeReturnQty,
  ]);

  /** Sale: negative net change on panel means underpaid — block collect unless forgive/debt. */
  const collectBlockedByShortPayment = useMemo(() => {
    if (settlementGrandTotal <= 0) return false;
    const net = payment.changeAmount - payment.shortageAmount;
    if (net >= 0) return false;
    if (payment.keepChange) return false;
    if (payment.debt && selectedCustomer) return false;
    return true;
  }, [
    settlementGrandTotal,
    payment.changeAmount,
    payment.shortageAmount,
    payment.keepChange,
    payment.debt,
    selectedCustomer,
  ]);

  return (
    <div className="flex h-screen w-full flex-col bg-gray-100 text-gray-900">
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>

      <CustomerCreateDialog
        open={createCustomerOpen}
        onClose={() => setCreateCustomerOpen(false)}
        defaultQuery={createDefaultQuery}
        onCreated={(c) => {
          setCreateCustomerOpen(false);
          pickCustomer(c, `Đã tạo và chọn khách ${formatCustomerDisplay(c)}.`);
        }}
      />

      <CustomerCreateDialog
        open={editCustomerOpen}
        onClose={() => setEditCustomerOpen(false)}
        mode="edit"
        customer={
          selectedCustomer
            ? {
                id: selectedCustomer.id,
                name: selectedCustomer.name,
                phone: selectedCustomer.phone ?? undefined,
                email: selectedCustomer.email ?? undefined,
              }
            : undefined
        }
        onSubmitted={(c) => {
          setEditCustomerOpen(false);
          pickCustomer(c, `Đã cập nhật khách ${formatCustomerDisplay(c)}.`);
        }}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          {checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE ? (
            <CheckoutExchangeTabs
              activeCheckoutPane={activeCheckoutPane}
              onSelectCheckoutPane={setActiveCheckoutPane}
            />
          ) : null}

          <POSToolbar<PosCatalogLine, Salesperson, PriceBook>
            ref={productSearchRef}
            state={toolbar}
            onQueryChange={(query) => {
              setToolbar((s) => ({ ...s, query }));
            }}
            onQtyChange={(qty) => setToolbar((s) => ({ ...s, qty }))}
            onSplitLineChange={(splitLine) =>
              setToolbar((s) => ({ ...s, splitLine }))
            }
            productSearch={productSearchAdapter}
            onSelectProduct={handleSelectProduct}
            productItemKey={(item) => item.itemId}
            productRenderItem={(item) => item.name}
            productRenderMeta={(item) => {
              const atDef = locationQtyFor(item);
              return (
                <>
                  {item.code} · Tồn{" "}
                  {formatOnHand(item.quantityOnHand, item.unit)}
                  {atDef < 1 && " · Hết"}
                </>
              );
            }}
            onSubmitProductQuery={handleSubmitProductQuery}
            productSearchDisabled={catalogLoading}
            salesperson={{
              value: selectedSalesperson,
              onChange: setSelectedSalesperson,
              search: salespersonSearch,
              itemKey: (s) => s.id,
              renderItem: (s) => s.name,
              renderMeta: (s) => `Mã: ${s.code}`,
              renderSelected: (s) => s.name,
              inputRef: salespersonRef,
            }}
            priceBook={{
              value: selectedPriceBook,
              onChange: setSelectedPriceBook,
              search: priceBookSearch,
              itemKey: (book) => book.id,
              renderItem: (book) => book.name,
              renderSelected: (book) => book.name,
              inputRef: priceBookRef,
            }}
          />

          {catalogError ? (
            <AlertBar
              variant="error"
              action={{ label: "Tải lại", onClick: () => void loadCatalog() }}
            >
              {catalogError}
            </AlertBar>
          ) : null}

          <InvoiceLineItemTable
            checkoutPane={invoiceTableCheckoutPane}
            lines={cart}
            selectedId={selectedLineId}
            isLineWarning={isLineWarning}
            onSelect={setSelectedLineId}
            onRemove={removeLine}
            onChangeQty={updateQty}
            onBumpQty={bumpQty}
            onChangeUnitPrice={updateUnitPrice}
          />

          <PanelCollapseHandle
            collapsed={catalogCollapsed}
            onToggle={() => setCatalogCollapsed((c) => !c)}
          />

          {!catalogCollapsed && (
            <>
              <ProductCatalogHeader<PosCatalogLine, ProductGroup>
                inputRef={catalogSearchRef}
                query={catalogQuery}
                onQueryChange={setCatalogQuery}
                productSearch={productSearchAdapter}
                onSelectProduct={handleSelectProduct}
                productItemKey={(item) => item.itemId}
                productRenderItem={(item) => item.name}
                productRenderMeta={(item) => {
                  const atDef = locationQtyFor(item);
                  return (
                    <>
                      {item.code} · Tồn{" "}
                      {formatOnHand(item.quantityOnHand, item.unit)}
                      {atDef < 1 && " · Hết"}
                    </>
                  );
                }}
                onSubmitProductQuery={handleSubmitProductQuery}
                group={{
                  value: selectedCatalogGroup,
                  onChange: (g) => setCatalogGroup(g.id),
                  search: catalogGroupSearch,
                  itemKey: (g) => g.id,
                  renderItem: (g) => g.name,
                  renderSelected: (g) => g.name,
                }}
              />
              {catalogLoading ? (
                <p className="px-3 py-6 text-[13px] text-gray-500">Đang tải…</p>
              ) : catalogProducts.length === 0 ? (
                <p className="px-3 py-6 text-[13px] text-gray-500">
                  Chưa có hàng phù hợp.
                </p>
              ) : (
                <ProductCatalogGrid
                  products={catalogProducts}
                  onSelect={handleCatalogSelect}
                />
              )}
            </>
          )}
        </div>

        <PaymentSummaryPanel<CustomerRow>
          ref={customerSearchRef}
          datetime={datetime}
          saleMode="Tại cửa hàng"
          customerQuery={customerQuery}
          onCustomerQueryChange={(q) => {
            setCustomerQuery(q);
            setCustomerFieldError("");
          }}
          customerSearch={customerSearchAdapter}
          onSelectCustomer={(c) => pickCustomer(c)}
          customerItemKey={(c) => c.id}
          customerRenderItem={(c) => formatCustomerDisplay(c)}
          customerRenderMeta={(c) => (
            <>
              {c.phone ?? "—"}
              {c.email ? ` · ${c.email}` : ""}
            </>
          )}
          onSubmitCustomerQuery={handleCustomerSubmitQuery}
          onAddCustomer={handleAddCustomer}
          selectedCustomerLabel={
            selectedCustomer ? formatCustomerDisplay(selectedCustomer) : null
          }
          customerDebt={null}
          selectedCustomerId={selectedCustomer?.id ?? null}
          onClearCustomer={selectedCustomer ? handleClearCustomer : undefined}
          customerFieldError={customerFieldError}
          promotions={promotions}
          appliedPromotionId={appliedPromotion?.id ?? null}
          onApplyPromotion={(promo) => {
            setAppliedPromotion(promo);
            announce(
              promo
                ? `Đã áp dụng ${promo.name}.`
                : "Đã bỏ chương trình khuyến mãi.",
            );
          }}
          onPickPromoOption={(option) =>
            announce(`Đã chọn ${promoOptionLabel(option)}.`)
          }
          discountPoint={{
            data: selectedCustomer
              ? {
                  member: {
                    name: formatCustomerDisplay(selectedCustomer),
                    cardNumber: selectedCustomer.id,
                  },
                }
              : undefined,
            onSearchVoucher: (code) => announce(`Đang tìm mã ưu đãi ${code}.`),
          }}
          voucher={{
            data: {
              items: voucherLineSource.map((l) => ({
                id: l.lineId,
                name: l.name,
                qty: l.qty,
                unitPrice: l.unitPrice,
                lineTotal: lineTotal(l),
              })),
            },
            onApply: (result) => {
              const code = result.voucherCode || result.voucherId;
              announce(
                code ? `Đã áp dụng voucher ${code}.` : "Đã áp dụng voucher.",
              );
            },
          }}
          onEditCustomer={() => setEditCustomerOpen(true)}
          quickExchangeBadges={quickExchangeBadges}
          itemCount={itemCountForPayment}
          total={grandTotal}
          deposit={payment.deposit}
          onDepositChange={payment.setDeposit}
          onRequireCustomerForDeposit={payment.handleRequireCustomerForDeposit}
          methods={PAYMENT_METHODS}
          paymentLines={payment.paymentLines}
          onChangePaymentLines={payment.handleChangePaymentLines}
          changeAmount={payment.changeAmount}
          shortageAmount={payment.shortageAmount}
          rawChangeAmount={payment.rawChangeAmount}
          rawShortageAmount={payment.rawShortageAmount}
          keepChange={payment.keepChange}
          onKeepChangeChange={payment.setKeepChange}
          debt={payment.debt}
          debtAmount={payment.debtAmount}
          onDebtChange={payment.handleDebtChange}
          note={payment.note}
          onNoteChange={payment.setNote}
          printInvoice={payment.printInvoice}
          onPrintInvoiceChange={payment.setPrintInvoice}
          preorder={payment.preorder}
          onPreorderChange={payment.setPreorder}
          suggestions={payment.suggestions}
          selectedSuggestionId={payment.selectedSuggestionId}
          onPickSuggestion={payment.handlePickSuggestion}
          onSaveDraft={isReturnExchangeInvoice ? undefined : handleSaveDraft}
          onCancelInvoice={
            isReturnExchangeInvoice ? handleRequestCancelInvoice : undefined
          }
          onCollect={finalizeCheckoutAndPrint}
          collectDisabled={!hasAnyCartLines || collectBlockedByShortPayment}
        />
      </div>

      <CancelInvoiceConfirmDialog
        open={cancelInvoiceDialogOpen}
        onClose={() => setCancelInvoiceDialogOpen(false)}
        onConfirm={handleConfirmCancelInvoice}
      />

      <OversellCheckoutConfirmDialog
        open={oversellCheckoutOpen}
        onClose={() => setOversellCheckoutOpen(false)}
        lines={getOversellSaleLines(purchaseCart)}
        onConfirm={async () => {
          setOversellCheckoutOpen(false);
          await finalizeCheckoutAndPrint({ bypassOversellModal: true });
        }}
      />

      <AppErrorDialog
        open={Boolean(cartError)}
        message={cartError}
        onClose={() => setCartError("")}
      />
    </div>
  );
}
