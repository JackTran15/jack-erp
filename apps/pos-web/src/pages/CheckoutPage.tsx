import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CheckoutAnnouncer } from "@erp/pos/components/page-components/Checkout/CheckoutAnnouncer/CheckoutAnnouncer";
import { CheckoutDialogs } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CheckoutDialogs";
import { CheckoutLeftPane } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/CheckoutLeftPane";
import { CheckoutRightPane } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/CheckoutRightPane";
import { createPaymentLine } from "@erp/pos/components/page-components/Checkout/Payment/PaymentMethodRow/PaymentMethodRow";
import { PAYMENT_METHODS } from "@erp/pos/constants/checkout.constant";
import { useAnnounce } from "@erp/pos/hooks/page-hooks/checkout/use-announce";
import { useCheckoutCatalog } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-catalog";
import { useCheckoutCustomer } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-customer";
import { useCheckoutDialogs } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-dialogs";
import { useCheckoutDraft } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-draft";
import { useCheckoutFinalize } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-finalize";
import { useCheckoutFocusManager } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-focus-manager";
import { useCheckoutHotkeys } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-hotkeys";
import { useCheckoutMeta } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-meta";
import { useCheckoutPayment } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-payment";
import { useCheckoutSessionCart } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-session-cart";
import { formatCustomerDisplay } from "@erp/pos/lib/common/customerApi";
import { formatViDateTime } from "@erp/pos/lib/common/dateTime";
import {
  CheckoutVariantEnum,
  type CatalogProduct,
} from "@erp/pos/lib/page-libs/checkout/checkout.types";
import {
  getOversellSaleLines,
  lineTotal,
  locationQtyFor,
  promoOptionLabel,
} from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { resetCheckoutSaleSession } from "@erp/pos/lib/page-libs/checkout/checkoutSaleSession";
import { type PosCatalogLine } from "@erp/pos/lib/page-libs/checkout/posCatalogApi";
import { clampPosCheckoutQtyNumber } from "@erp/pos/lib/page-libs/checkout/posCheckoutQty";
import type { PromotionItem } from "@erp/pos/lib/page-libs/checkout/promotion.types";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import {
  CheckoutPane,
  usePosCheckoutSessionStore,
} from "@erp/pos/stores/common/checkout-session.store";

export function CheckoutPage() {
  const branchId = usePosBranchStore((s) => s.branchId)!;

  const focus = useCheckoutFocusManager();
  const dialogs = useCheckoutDialogs();
  const lastActiveSessionIdRef = useRef<string | null>(null);
  const [pendingQtyFocusLineId, setPendingQtyFocusLineId] = useState<
    string | null
  >(null);

  const sessions = usePosCheckoutSessionStore((s) => s.sessions);
  const activeSessionId = usePosCheckoutSessionStore((s) => s.activeSessionId);
  const removeSession = usePosCheckoutSessionStore((s) => s.removeSession);
  const addSession = usePosCheckoutSessionStore((s) => s.addSession);
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

  const meta = useCheckoutMeta(catalogGroup);

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

  const payment = useCheckoutPayment({
    grandTotal,
    methods: PAYMENT_METHODS,
    onError: setCartError,
  });

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
    onCustomerSelected: payment.clearKeepChange,
  });

  const [appliedPromotion, setAppliedPromotion] =
    useState<PromotionItem | null>(null);
  const promotions = useMemo<PromotionItem[]>(() => [], []);
  const datetime = useMemo(() => formatViDateTime(new Date()), []);

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

  const receiptLines = useMemo(() => {
    if (checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE) {
      return [...returnCart, ...purchaseCart];
    }
    return purchaseCart;
  }, [checkoutVariant, returnCart, purchaseCart]);

  const { finalizeCheckoutAndPrint } = useCheckoutFinalize({
    hasAnyCartLines,
    selectedCustomer,
    purchaseCart,
    receiptLines,
    grandTotal,
    settlementGrandTotal: payment.settlementGrandTotal,
    settlementAbs: payment.settlementAbs,
    paymentLines: payment.paymentLines,
    methods: PAYMENT_METHODS,
    totalPaid: payment.totalPaid,
    changeAmount: payment.changeAmount,
    shortageAmount: payment.shortageAmount,
    keepChange: payment.keepChange,
    debt: payment.debt,
    primaryMethod: payment.primaryMethod,
    primaryMethodLabel: payment.primaryMethodLabel,
    printInvoice: payment.printInvoice,
    announce,
    resetActiveSessionAfterCheckout,
    onValidationError: setCartError,
    onOversellDetected: dialogs.oversell.openDialog,
    onAfterCheckout: onResetLocalCheckoutUi,
  });

  const handleSelectProduct = useCallback(
    (p: PosCatalogLine, qty = 1) => {
      const atDef = locationQtyFor(p);
      if (atDef >= 1) {
        const requested = clampPosCheckoutQtyNumber(qty);
        const lineId = addProduct(p, requested);
        setToolbar((s) => ({ ...s, query: "" }));
        // MISA flow: focus chuyển sang ô SL của dòng vừa thêm (Bước 2).
        // Khi user gõ SL xong + Enter, InvoiceLineItemRow gọi onCommitQty
        // để focus quay lại ô tìm SP cho lần thêm tiếp theo (Bước 3).
        if (lineId) setPendingQtyFocusLineId(lineId);
        else focus.focusProductSearch();
      } else {
        setCartError("Hết tồn.");
      }
    },
    [addProduct, setCartError, setToolbar, focus],
  );

  const handleSubmitProductQuery = useCallback(
    (_q: string): boolean => {
      const matched = filteredProducts;
      if (matched.length === 1) {
        const requested = clampPosCheckoutQtyNumber(toolbar.qty);
        const lineId = addProduct(matched[0]!, requested);
        setToolbar((s) => ({ ...s, query: "" }));
        if (lineId) setPendingQtyFocusLineId(lineId);
        else focus.focusProductSearch();
      } else if (matched.length === 0) {
        setCartError("Không tìm thấy hàng phù hợp.");
      } else {
        setCartError(
          "Nhiều kết quả — chọn hàng bên dưới hoặc thu hẹp từ khóa.",
        );
      }
      return true;
    },
    [
      addProduct,
      filteredProducts,
      toolbar.qty,
      setCartError,
      setToolbar,
      focus,
    ],
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
    focus.focusProductSearchAndSelect();
  }, [focus]);

  const { saveDraft } = useCheckoutDraft({
    hasAnyCartLines,
    checkoutVariant,
    grandTotal,
    purchaseCart,
    returnCart,
    linesForDraftSingle,
    selectedCustomer,
    paymentLines: payment.paymentLines,
    methods: PAYMENT_METHODS,
    announce,
    addDraft,
    nextDraftSeq,
    resetActiveSessionAfterCheckout,
    onAfterSave: onResetLocalCheckoutUi,
  });

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
    dialogs.cancelInvoice.close();
    dialogs.oversell.close();
    setAppliedPromotion(null);
  }, [
    activeSessionId,
    onResetLocalCheckoutUi,
    payment.setPaymentLines,
    setCreateCustomerOpen,
    setEditCustomerOpen,
    setCreateDefaultQuery,
    setCartError,
    dialogs.cancelInvoice,
    dialogs.oversell,
    setAppliedPromotion,
  ]);

  const handleRequestCancelInvoice = useCallback(() => {
    dialogs.cancelInvoice.openDialog();
  }, [dialogs.cancelInvoice]);

  const handleConfirmCancelInvoice = useCallback(() => {
    dialogs.cancelInvoice.close();
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
    dialogs.cancelInvoice,
  ]);

  useCheckoutHotkeys({
    productSearchRef: focus.refs.productSearch,
    customerSearchRef: focus.refs.customerSearch,
    paymentAmountRef: focus.refs.paymentAmount,
    catalogSearchRef: focus.refs.catalogSearch,
    salespersonRef: focus.refs.salesperson,
    priceBookRef: focus.refs.priceBook,
    hasCartItems: hasAnyCartLines,
    onCheckout: () => {
      void finalizeCheckoutAndPrint();
    },
    onSaveDraft: isReturnExchangeInvoice ? undefined : saveDraft,
    onAddSession: addSession,
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
    if (payment.settlementGrandTotal <= 0) return false;
    const net = payment.changeAmount - payment.shortageAmount;
    if (net >= 0) return false;
    if (payment.keepChange) return false;
    if (payment.debt && selectedCustomer) return false;
    return true;
  }, [
    payment.settlementGrandTotal,
    payment.changeAmount,
    payment.shortageAmount,
    payment.keepChange,
    payment.debt,
    selectedCustomer,
  ]);

  return (
    <div className="flex h-screen w-full flex-col bg-gray-100 text-gray-900">
      <CheckoutAnnouncer message={announcement} />

      <div className="flex flex-1 overflow-hidden">
        <CheckoutLeftPane
          checkoutVariant={checkoutVariant}
          activeCheckoutPane={activeCheckoutPane}
          setActiveCheckoutPane={setActiveCheckoutPane}
          toolbar={toolbar}
          setToolbar={setToolbar}
          productSearchAdapter={productSearchAdapter}
          productSearchRef={focus.refs.productSearch}
          catalogLoading={catalogLoading}
          onSelectProduct={handleSelectProduct}
          onSubmitProductQuery={handleSubmitProductQuery}
          selectedSalesperson={meta.selectedSalesperson}
          setSelectedSalesperson={meta.setSelectedSalesperson}
          salespersonSearch={meta.salespersonSearch}
          salespersonRef={focus.refs.salesperson}
          selectedPriceBook={meta.selectedPriceBook}
          setSelectedPriceBook={meta.setSelectedPriceBook}
          priceBookSearch={meta.priceBookSearch}
          priceBookRef={focus.refs.priceBook}
          catalogError={catalogError}
          loadCatalog={loadCatalog}
          invoiceTableCheckoutPane={invoiceTableCheckoutPane}
          cart={cart}
          selectedLineId={selectedLineId}
          isLineWarning={isLineWarning}
          pendingQtyFocusLineId={pendingQtyFocusLineId}
          onQtyAutoFocusConsumed={handleQtyAutoFocusConsumed}
          onCommitQty={handleCommitQty}
          onSelectLine={setSelectedLineId}
          onRemoveLine={removeLine}
          onChangeQty={updateQty}
          onBumpQty={bumpQty}
          onChangeUnitPrice={updateUnitPrice}
          catalogCollapsed={catalogCollapsed}
          setCatalogCollapsed={setCatalogCollapsed}
          catalogSearchRef={focus.refs.catalogSearch}
          catalogQuery={catalogQuery}
          setCatalogQuery={setCatalogQuery}
          selectedProductGroup={meta.selectedProductGroup}
          setCatalogGroup={setCatalogGroup}
          productGroupSearch={meta.productGroupSearch}
          catalogProducts={catalogProducts}
          onCatalogSelect={handleCatalogSelect}
        />

        <CheckoutRightPane
          ref={focus.refs.customerSearch}
          paymentAmountRef={focus.refs.paymentAmount}
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
          addCustomerButtonRef={focus.refs.addCustomerButton}
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
          onDebtChange={(next) =>
            payment.handleDebtChange(next, selectedCustomer)
          }
          note={payment.note}
          onNoteChange={payment.setNote}
          qrPayment={{
            holderName: "HOÀNG THỊ THU",
            accountNumber: "005704060134345",
            bankCode: "VIB",
            amount: grandTotal,
          }}
          printInvoice={payment.printInvoice}
          onPrintInvoiceChange={payment.setPrintInvoice}
          preorder={payment.preorder}
          onPreorderChange={payment.setPreorder}
          suggestions={payment.suggestions}
          selectedSuggestionId={payment.selectedSuggestionId}
          onPickSuggestion={payment.handlePickSuggestion}
          onSaveDraft={isReturnExchangeInvoice ? undefined : saveDraft}
          onCancelInvoice={
            isReturnExchangeInvoice ? handleRequestCancelInvoice : undefined
          }
          onCollect={finalizeCheckoutAndPrint}
          collectDisabled={!hasAnyCartLines || collectBlockedByShortPayment}
        />
      </div>

      <CheckoutDialogs
        createCustomer={{
          open: createCustomerOpen,
          onClose: () => {
            setCreateCustomerOpen(false);
            dialogs.createCustomerSucceeded.set(false);
          },
          defaultQuery: createDefaultQuery,
          returnFocusTo: dialogs.createCustomerSucceeded.value
            ? focus.refs.paymentAmount
            : focus.refs.customerSearch,
          onCreated: (c) => {
            dialogs.createCustomerSucceeded.set(true);
            setCreateCustomerOpen(false);
            pickCustomer(c, `Đã tạo và chọn khách ${formatCustomerDisplay(c)}.`);
          },
        }}
        editCustomer={{
          open: editCustomerOpen,
          onClose: () => setEditCustomerOpen(false),
          mode: "edit",
          customer: selectedCustomer
            ? {
                id: selectedCustomer.id,
                name: selectedCustomer.name,
                phone: selectedCustomer.phone ?? undefined,
                email: selectedCustomer.email ?? undefined,
              }
            : undefined,
          onSubmitted: (c) => {
            setEditCustomerOpen(false);
            pickCustomer(c, `Đã cập nhật khách ${formatCustomerDisplay(c)}.`);
          },
        }}
        cancelInvoiceOpen={dialogs.cancelInvoice.open}
        onCloseCancelInvoice={dialogs.cancelInvoice.close}
        onConfirmCancelInvoice={handleConfirmCancelInvoice}
        oversellOpen={dialogs.oversell.open}
        onCloseOversell={dialogs.oversell.close}
        oversellLines={getOversellSaleLines(purchaseCart)}
        onConfirmOversell={async () => {
          dialogs.oversell.close();
          await finalizeCheckoutAndPrint({ bypassOversellModal: true });
        }}
        cartError={cartError}
        onCloseCartError={() => setCartError("")}
      />
    </div>
  );
}
