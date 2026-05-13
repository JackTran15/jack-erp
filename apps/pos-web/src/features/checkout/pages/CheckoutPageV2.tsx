import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CustomerCreateDialog } from "@erp/pos/components/CustomerCreateDialog";
import { useAnnounce } from "@erp/pos/hooks/useAnnounce";
import {
  formatCustomerDisplay,
  type CustomerRow,
} from "@erp/pos/lib/customerApi";
import { type PosCatalogLine } from "@erp/pos/lib/posCatalogApi";
import { usePosBranchStore } from "@erp/pos/stores/usePosBranchStore";
import { usePosCheckoutSessionStore } from "@erp/pos/stores/usePosCheckoutSessionStore";

import { formatViDateTime } from "@erp/pos/lib/dateTime";
import { PanelCollapseHandle } from "../components/catalog/PanelCollapseHandle";
import { ProductCatalogGrid } from "../components/catalog/ProductCatalogGrid";
import { ProductCatalogHeader } from "../components/catalog/ProductCatalogHeader";
import { AlertBar } from "../components/common/AlertBar";
import { CancelInvoiceConfirmDialog } from "../components/CancelInvoiceConfirmDialog";
import { CheckoutExchangeTabs } from "../components/exchange/CheckoutExchangeTabs";
import { InvoiceLineItemTable } from "../components/invoice/InvoiceLineItemTable";
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
import { useCheckoutSessionCart } from "../hooks/useCheckoutSessionCart";
import { useCheckoutCatalog } from "../hooks/useCheckoutCatalog";
import { useCheckoutCustomer } from "../hooks/useCheckoutCustomer";
import { useCheckoutHotkeys } from "../hooks/useCheckoutHotkeys";
import { useCheckoutPayment } from "../hooks/useCheckoutPayment";
import { buildCheckoutInvoicePayload } from "../lib/checkoutReceiptFactory";
import { resetCheckoutSaleSession } from "../lib/checkoutSaleSession";
import {
  formatOnHand,
  lineTotal,
  locationQtyFor,
  paymentLabel,
  promoOptionLabel,
  resolvePaymentMethodLabel,
} from "../lib/checkoutUtils";

export function CheckoutPageV2() {
  const branchId = usePosBranchStore((s) => s.branchId)!;
  const productSearchRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);
  const paymentAmountRef = useRef<HTMLInputElement>(null);
  const addCustomerButtonRef = useRef<HTMLButtonElement>(null);
  const [pendingQtyFocusLineId, setPendingQtyFocusLineId] = useState<
    string | null
  >(null);

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
  const setActiveExchangePane = usePosCheckoutSessionStore(
    (s) => s.setActiveExchangePane,
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
    activeExchangePane,
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
    onCustomerSelected: () => setKeepChange(false),
  });

  const {
    paymentLines,
    setPaymentLines,
    keepChange,
    setKeepChange,
    debt,
    setDebt,
    note,
    setNote,
    printInvoice,
    setPrintInvoice,
    preorder,
    setPreorder,
    selectedSuggestionId,
    setSelectedSuggestionId,
    totalPaid,
    changeAmount,
    shortageAmount,
    isShort,
    suggestions,
    primaryMethod,
    primaryMethodLabel,
    debtAmount,
    handlePickSuggestion,
    handleChangePaymentLines,
  } = useCheckoutPayment({
    grandTotal,
    methods: PAYMENT_METHODS,
  });

  const [appliedPromotion, setAppliedPromotion] =
    useState<PromotionItem | null>(null);
  const promotions = useMemo<PromotionItem[]>(() => [], []);

  const datetime = useMemo(() => formatViDateTime(new Date()), []);

  const labelForMethod = useCallback(
    (m: PaymentLine["method"]): string =>
      resolvePaymentMethodLabel(m, PAYMENT_METHODS),
    [],
  );

  const receiptLines = useMemo(() => {
    if (checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE) {
      return [...returnCart, ...purchaseCart];
    }
    return purchaseCart;
  }, [checkoutVariant, returnCart, purchaseCart]);

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

  const allLinesForPriceCheck = useMemo(() => {
    if (checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE) {
      return [...purchaseCart, ...returnCart];
    }
    return purchaseCart;
  }, [checkoutVariant, purchaseCart, returnCart]);

  const handleSelectProduct = useCallback(
    (p: PosCatalogLine) => {
      const atDef = locationQtyFor(p);
      if (atDef >= 1) {
        const lineId = addProduct(p);
        setToolbar((s) => ({ ...s, query: "" }));
        // MISA flow: focus chuyển sang ô SL của dòng vừa thêm (Bước 2).
        // Khi user gõ SL xong + Enter, InvoiceLineItemRow gọi onCommitQty
        // để focus quay lại ô tìm SP cho lần thêm tiếp theo (Bước 3).
        if (lineId) setPendingQtyFocusLineId(lineId);
        else productSearchRef.current?.focus();
      } else {
        setCartError("Hết tồn.");
      }
    },
    [addProduct],
  );

  const handleSubmitProductQuery = useCallback(
    (q: string): boolean => {
      const matched = filteredProducts;
      if (matched.length === 1) {
        const lineId = addProduct(matched[0]!);
        setToolbar((s) => ({ ...s, query: "" }));
        if (lineId) setPendingQtyFocusLineId(lineId);
        else productSearchRef.current?.focus();
      } else if (matched.length === 0) {
        setCartError("Không tìm thấy hàng phù hợp.");
      } else {
        setCartError(
          "Nhiều kết quả — chọn hàng bên dưới hoặc thu hẹp từ khóa.",
        );
      }
      return true;
    },
    [addProduct, filteredProducts],
  );

  const handleCatalogSelect = useCallback(
    (product: CatalogProduct) => {
      const lineId = handleCatalogSelectFromCart(product, catalog);
      if (lineId) setPendingQtyFocusLineId(lineId);
    },
    [catalog, handleCatalogSelectFromCart],
  );

  const handleQtyAutoFocusConsumed = useCallback(() => {
    setPendingQtyFocusLineId(null);
  }, []);

  const handleCommitQty = useCallback(() => {
    productSearchRef.current?.focus();
    productSearchRef.current?.select();
  }, []);

  const settlementAbs = grandTotal < 0 ? -grandTotal : Math.max(0, grandTotal);

  const handleCheckout = useCallback(
    (e: FormEvent | { preventDefault: () => void }) => {
      e.preventDefault();
      if (!hasAnyCartLines) {
        setCartError("Giỏ hàng trống.");
        return;
      }
      if (allLinesForPriceCheck.some((l) => l.unitPrice <= 0)) {
        setCartError("Nhập đơn giá > 0 cho từng dòng hàng.");
        return;
      }
      if (grandTotal > 0 && totalPaid > 0 && totalPaid < grandTotal) {
        setCartError("Tiền khách đưa chưa đủ.");
        return;
      }
      if (grandTotal < 0 && totalPaid < settlementAbs) {
        setCartError("Nhập đủ số tiền trả khách.");
        return;
      }
      setCartError("");
      const who = selectedCustomer
        ? ` cho ${formatCustomerDisplay(selectedCustomer)}`
        : " (khách lẻ)";
      announce(
        `Đã ghi nhận thanh toán${who}, ${new Intl.NumberFormat("vi-VN", {
          style: "currency",
          currency: "VND",
          maximumFractionDigits: 0,
        }).format(grandTotal)}, ${paymentLabel(primaryMethod)}.`,
      );
      resetActiveSessionAfterCheckout();
      resetCheckoutSaleSession({
        setSelectedCustomer,
        setCustomerQuery,
        setCustomerFieldError,
        setPaymentLines,
        setSelectedSuggestionId,
        setNote,
        setKeepChange,
        setDebt,
      });
    },
    [
      announce,
      allLinesForPriceCheck,
      grandTotal,
      hasAnyCartLines,
      primaryMethod,
      resetActiveSessionAfterCheckout,
      selectedCustomer,
      settlementAbs,
      totalPaid,
      setSelectedCustomer,
      setCustomerQuery,
      setCustomerFieldError,
      setPaymentLines,
      setSelectedSuggestionId,
      setNote,
      setKeepChange,
      setDebt,
    ],
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
      paymentLines
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
    resetCheckoutSaleSession({
      setSelectedCustomer,
      setCustomerQuery,
      setCustomerFieldError,
      setPaymentLines,
      setSelectedSuggestionId,
      setNote,
      setKeepChange,
      setDebt,
    });
  }, [
    addDraft,
    announce,
    checkoutVariant,
    grandTotal,
    hasAnyCartLines,
    labelForMethod,
    linesForDraftSingle,
    nextDraftSeq,
    paymentLines,
    purchaseCart,
    returnCart,
    resetActiveSessionAfterCheckout,
    selectedCustomer,
    setSelectedCustomer,
    setCustomerQuery,
    setCustomerFieldError,
    setPaymentLines,
    setSelectedSuggestionId,
    setNote,
    setKeepChange,
    setDebt,
  ]);

  const [cancelInvoiceDialogOpen, setCancelInvoiceDialogOpen] = useState(false);

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
        setPaymentLines,
        setSelectedSuggestionId,
        setNote,
        setKeepChange,
        setDebt,
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
    setPaymentLines,
    setSelectedSuggestionId,
    setNote,
    setKeepChange,
    setDebt,
  ]);

  /** Customer + payment UI are React-local; reset when switching invoice tab so they match the active session. */
  const lastActiveSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastActiveSessionIdRef.current === null) {
      lastActiveSessionIdRef.current = activeSessionId;
      return;
    }
    if (lastActiveSessionIdRef.current === activeSessionId) return;
    lastActiveSessionIdRef.current = activeSessionId;

    resetCheckoutSaleSession({
      setSelectedCustomer,
      setCustomerQuery,
      setCustomerFieldError,
      setPaymentLines,
      setSelectedSuggestionId,
      setNote,
      setKeepChange,
      setDebt,
    });
    const pendingDraftPayments =
      usePosCheckoutSessionStore.getState().pendingDraftPaymentLines;
    usePosCheckoutSessionStore
      .getState()
      .setPendingDraftPaymentLines(null);
    if (pendingDraftPayments && pendingDraftPayments.length > 0) {
      setPaymentLines(
        pendingDraftPayments.map((p) =>
          createPaymentLine(p.method, p.amount),
        ),
      );
    }
    setCreateCustomerOpen(false);
    setEditCustomerOpen(false);
    setCreateDefaultQuery("");
    setCartError("");
    setCancelInvoiceDialogOpen(false);
    setAppliedPromotion(null);
  }, [
    activeSessionId,
    setSelectedCustomer,
    setCustomerQuery,
    setCustomerFieldError,
    setPaymentLines,
    setSelectedSuggestionId,
    setNote,
    setKeepChange,
    setDebt,
    setCreateCustomerOpen,
    setEditCustomerOpen,
    setCreateDefaultQuery,
    setCartError,
  ]);

  const printer = useInvoicePrinter();

  const buildInvoicePayload = useCallback(
    (): InvoicePayload | null =>
      buildCheckoutInvoicePayload({
        printInvoice,
        cart: receiptLines,
        grandTotal,
        totalPaid,
        paymentLines,
        primaryMethodLabel,
        methods: PAYMENT_METHODS,
      }),
    [
      printInvoice,
      receiptLines,
      grandTotal,
      totalPaid,
      paymentLines,
      primaryMethodLabel,
    ],
  );

  // F9 path: mirror PaymentCTAButtons.handleCollect so the hotkey prints
  // the receipt before committing. Print errors must not block the commit.
  const handleHotkeyCheckout = useCallback(async () => {
    const payload = buildInvoicePayload();
    if (payload) {
      try {
        await printer.print(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Lỗi in hóa đơn:", err);
      }
    }
    handleCheckout({ preventDefault: () => {} });
  }, [buildInvoicePayload, printer, handleCheckout]);

  useCheckoutHotkeys({
    productSearchRef,
    customerSearchRef,
    paymentAmountRef,
    hasCartItems: hasAnyCartLines,
    onCheckout: handleHotkeyCheckout,
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
        returnFocusTo={addCustomerButtonRef}
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
                phone: selectedCustomer.phone,
                email: selectedCustomer.email,
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
              activePane={activeExchangePane}
              onSelectPane={setActiveExchangePane}
            />
          ) : null}

          <POSToolbar<PosCatalogLine>
            ref={productSearchRef}
            state={toolbar}
            onQueryChange={(query) => {
              setToolbar((s) => ({ ...s, query }));
              setCartError("");
            }}
            onQtyChange={(qty) => setToolbar((s) => ({ ...s, qty }))}
            onSplitLineChange={(splitLine) =>
              setToolbar((s) => ({ ...s, splitLine }))
            }
            productSearch={productSearchAdapter}
            onSelectProduct={handleSelectProduct}
            productItemKey={(p) => p.itemId}
            productRenderItem={(p) => p.name}
            productRenderMeta={(p) => {
              const atDef = locationQtyFor(p);
              return (
                <>
                  {p.code} · Tồn {formatOnHand(p.quantityOnHand, p.unit)}
                  {atDef < 1 && " · Hết"}
                </>
              );
            }}
            onSubmitProductQuery={handleSubmitProductQuery}
            productSearchDisabled={catalogLoading}
          />

          {cartError ? <AlertBar variant="error">{cartError}</AlertBar> : null}
          {catalogError ? (
            <AlertBar
              variant="error"
              action={{ label: "Tải lại", onClick: () => void loadCatalog() }}
            >
              {catalogError}
            </AlertBar>
          ) : null}

          <InvoiceLineItemTable
            lines={cart}
            selectedId={selectedLineId}
            isLineWarning={isLineWarning}
            autoFocusQtyLineId={pendingQtyFocusLineId}
            onAutoFocusConsumed={handleQtyAutoFocusConsumed}
            onCommitQty={handleCommitQty}
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
              <ProductCatalogHeader
                query={catalogQuery}
                onQueryChange={setCatalogQuery}
                group={catalogGroup}
                onPickGroup={() =>
                  setCatalogGroup((g) => (g ? undefined : "Tất cả"))
                }
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
          paymentAmountRef={paymentAmountRef}
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
          addCustomerButtonRef={addCustomerButtonRef}
          selectedCustomerLabel={
            selectedCustomer ? formatCustomerDisplay(selectedCustomer) : null
          }
          customerDebt={null}
          onClearCustomer={selectedCustomer ? handleClearCustomer : undefined}
          customerFieldError={customerFieldError}
          promotions={promotions}
          appliedPromotionId={appliedPromotion?.id ?? null}
          onApplyPromotion={(p) => {
            setAppliedPromotion(p);
            announce(
              p ? `Đã áp dụng ${p.name}.` : "Đã bỏ chương trình khuyến mãi.",
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
          deposit={0}
          methods={PAYMENT_METHODS}
          paymentLines={paymentLines}
          onChangePaymentLines={handleChangePaymentLines}
          changeAmount={changeAmount}
          shortageAmount={isShort ? shortageAmount : 0}
          keepChange={keepChange}
          onKeepChangeChange={setKeepChange}
          debt={debt}
          debtAmount={debtAmount}
          onDebtChange={setDebt}
          note={note}
          onNoteChange={setNote}
          qrPayment={{
            holderName: "HOÀNG THỊ THU",
            accountNumber: "005704060134345",
            bankCode: "VIB",
            amount: grandTotal,
          }}
          printInvoice={printInvoice}
          onPrintInvoiceChange={setPrintInvoice}
          preorder={preorder}
          onPreorderChange={setPreorder}
          suggestions={suggestions}
          selectedSuggestionId={selectedSuggestionId}
          onPickSuggestion={handlePickSuggestion}
          onSaveDraft={
            isReturnExchangeInvoice ? undefined : handleSaveDraft
          }
          onCancelInvoice={
            isReturnExchangeInvoice ? handleRequestCancelInvoice : undefined
          }
          onCollect={() => handleCheckout({ preventDefault: () => {} })}
          collectDisabled={!hasAnyCartLines}
          invoice={buildInvoicePayload}
        />
      </div>

      <CancelInvoiceConfirmDialog
        open={cancelInvoiceDialogOpen}
        onClose={() => setCancelInvoiceDialogOpen(false)}
        onConfirm={handleConfirmCancelInvoice}
      />
    </div>
  );
}
