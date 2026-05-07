import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { CustomerCreateDialog } from "../../../components/CustomerCreateDialog";
import { useAnnounce } from "../../../hooks/useAnnounce";
import {
  formatCustomerDisplay,
  type CustomerRow,
} from "../../../lib/customerApi";
import { type PosCatalogLine } from "../../../lib/posCatalogApi";
import { usePosBranchStore } from "../../../stores/usePosBranchStore";

import { formatViDateTime } from "../../../lib/dateTime";
import { PanelCollapseHandle } from "../components/catalog/PanelCollapseHandle";
import { ProductCatalogGrid } from "../components/catalog/ProductCatalogGrid";
import { ProductCatalogHeader } from "../components/catalog/ProductCatalogHeader";
import { AlertBar } from "../components/common/AlertBar";
import { DraftInvoicesDialog } from "../components/draftInvoices/DraftInvoicesDialog";
import { InvoiceLineItemTable } from "../components/invoice/InvoiceLineItemTable";
import { type PaymentLine } from "../components/payment/PaymentMethodRow";
import { PaymentSummaryPanel } from "../components/payment/PaymentSummaryPanel";
import type { PromotionItem } from "../components/payment/promotion/types";
import type { InvoicePayload } from "../components/printing/types";
import { POSToolbar } from "../components/toolbar/POSToolbar";
import { InvoiceTabBar } from "../components/topbar/InvoiceTabBar";
import type { CatalogProduct, InvoiceTabItem } from "../components/types";
import { PAYMENT_METHODS } from "../constants/paymentMethod";
import { useCheckoutCart } from "../hooks/useCheckoutCart";
import { useCheckoutCatalog } from "../hooks/useCheckoutCatalog";
import { useCheckoutCustomer } from "../hooks/useCheckoutCustomer";
import { useCheckoutDrafts } from "../hooks/useCheckoutDrafts";
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

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function CheckoutPageV2() {
  const branchId = usePosBranchStore((s) => s.branchId)!;
  const productSearchRef = useRef<HTMLInputElement>(null);
  const customerSearchRef = useRef<HTMLInputElement>(null);

  // Tabs (UI only — single active cart at a time, mirrors legacy single-cart).
  const [tabs, setTabs] = useState<InvoiceTabItem[]>([
    { id: "tab-1", label: "Hóa đơn 1" },
    { id: "tab-draft", label: "HĐ lưu tạm", isDraft: true },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("tab-1");

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
    cart,
    setCart,
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
  } = useCheckoutCart({ announce });
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

  // Promotion / voucher selection — backend wiring lands later, so the page
  // currently exposes an empty list (modal renders its empty state).
  const [appliedPromotion, setAppliedPromotion] =
    useState<PromotionItem | null>(null);
  const promotions = useMemo<PromotionItem[]>(() => [], []);

  const {
    drafts,
    draftsDialogOpen,
    setDraftsDialogOpen,
    handleSaveDraft: saveDraft,
    handleRestoreDraft: restoreDraft,
    handleDeleteDraft: deleteDraft,
  } = useCheckoutDrafts();

  // Inject the live draft count into the "HĐ lưu tạm" tab as a badge. Tabs
  // without `isDraft` flow through unchanged.
  const tabsWithBadges = useMemo<InvoiceTabItem[]>(
    () =>
      tabs.map((t) => (t.isDraft ? { ...t, badgeCount: drafts.length } : t)),
    [tabs, drafts.length],
  );

  // ---- Derived data ----
  const datetime = useMemo(() => formatViDateTime(new Date()), []);

  /** Resolve the human label for a `PaymentMethod`. Falls back to the raw value. */
  const labelForMethod = useCallback(
    (m: PaymentLine["method"]): string =>
      resolvePaymentMethodLabel(m, PAYMENT_METHODS),
    [],
  );

  // ---- Customer state/handlers are provided by useCheckoutCustomer ----

  // ---- Cart handlers ----
  const handleSelectProduct = useCallback(
    (p: PosCatalogLine) => {
      const atDef = locationQtyFor(p);
      if (atDef >= 1) {
        addProduct(p);
        setToolbar((s) => ({ ...s, query: "" }));
        productSearchRef.current?.focus();
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
        addProduct(matched[0]!);
        setToolbar((s) => ({ ...s, query: "" }));
        productSearchRef.current?.focus();
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
      handleCatalogSelectFromCart(product, catalog);
    },
    [catalog, handleCatalogSelectFromCart],
  );

  // ---- Checkout / save-draft ----
  const handleCheckout = useCallback(
    (e: FormEvent | { preventDefault: () => void }) => {
      e.preventDefault();
      if (cart.length === 0) {
        setCartError("Giỏ hàng trống.");
        return;
      }
      if (cart.some((l) => l.unitPrice <= 0)) {
        setCartError("Nhập đơn giá > 0 cho từng dòng hàng.");
        return;
      }
      if (totalPaid > 0 && totalPaid < grandTotal) {
        setCartError("Tiền khách đưa chưa đủ.");
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
      resetCheckoutSaleSession({
        setCart,
        setSelectedLineId,
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
    [announce, cart, grandTotal, primaryMethod, selectedCustomer, totalPaid],
  );

  const handleSaveDraft = useCallback(() => {
    saveDraft({
      cart,
      paymentLines,
      selectedCustomer,
      labelForMethod,
      announce,
      onAfterSave: () =>
        resetCheckoutSaleSession({
          setCart,
          setSelectedLineId,
          setSelectedCustomer,
          setCustomerQuery,
          setCustomerFieldError,
          setPaymentLines,
          setSelectedSuggestionId,
          setNote,
          setKeepChange,
          setDebt,
        }),
    });
  }, [
    announce,
    cart,
    labelForMethod,
    paymentLines,
    saveDraft,
    selectedCustomer,
  ]);

  const handleRestoreDraft = useCallback(
    (draft: (typeof drafts)[number]) => {
      restoreDraft({
        draft,
        setCart,
        setSelectedLineId,
        setPaymentLines,
        setSelectedSuggestionId,
        setCartError,
        announce,
      });
    },
    [announce, restoreDraft],
  );

  const handleDeleteDraft = useCallback(
    (id: string) => {
      deleteDraft({ id, announce });
    },
    [announce, deleteDraft],
  );

  // ---- Tabs ----
  const handleAddTab = useCallback(() => {
    setTabs((prev) => {
      const newId = `tab-${Date.now()}`;
      const drafts = prev.filter((t) => t.isDraft);
      const actives = prev.filter((t) => !t.isDraft);
      const newTab: InvoiceTabItem = {
        id: newId,
        label: `Hóa đơn ${actives.length + 1}`,
      };
      setActiveTabId(newId);
      return [...actives, newTab, ...drafts];
    });
  }, []);

  const handleCloseTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        if (id === activeTabId) {
          const fallback = next.find((t) => !t.isDraft) ?? next[0];
          setActiveTabId(fallback?.id ?? "");
        }
        return next;
      });
    },
    [activeTabId],
  );

  // ---- Keyboard shortcuts ----
  useCheckoutHotkeys({
    productSearchRef,
    customerSearchRef,
    hasCartItems: cart.length > 0,
    onCheckout: () => handleCheckout({ preventDefault: () => {} }),
    onSaveDraft: handleSaveDraft,
  });

  // Payment suggestion/line mutation handlers are provided by useCheckoutPayment.

  // ---- Invoice payload factory (printed on "Thu tiền") ----
  // Closure captures the *current* render's state so the receipt reflects
  // the cart/customer/totals before `handleCheckout` clears them.
  const buildInvoicePayload = (): InvoicePayload | null =>
    buildCheckoutInvoicePayload({
      printInvoice,
      cart,
      grandTotal,
      totalPaid,
      paymentLines,
      primaryMethodLabel,
      methods: PAYMENT_METHODS,
    });

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

      <InvoiceTabBar
        tabs={tabsWithBadges}
        activeTabId={activeTabId}
        onSelectTab={(id) => {
          // The "HĐ lưu tạm" tab is a launcher for the drafts picker, not a
          // real cart tab — clicking it opens the dialog and leaves the
          // active cart untouched.
          const tab = tabs.find((t) => t.id === id);
          if (tab?.isDraft) {
            setDraftsDialogOpen(true);
            return;
          }
          setActiveTabId(id);
        }}
        onCloseTab={handleCloseTab}
        onAddTab={handleAddTab}
        location="Giầy MT Cần Thơ"
        userName="Phan Thanh Hà"
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
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
              items: cart.map((l) => ({
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
          itemCount={cart.length}
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
          printInvoice={printInvoice}
          onPrintInvoiceChange={setPrintInvoice}
          preorder={preorder}
          onPreorderChange={setPreorder}
          suggestions={suggestions}
          selectedSuggestionId={selectedSuggestionId}
          onPickSuggestion={handlePickSuggestion}
          onSaveDraft={handleSaveDraft}
          onCollect={() => handleCheckout({ preventDefault: () => {} })}
          collectDisabled={cart.length === 0}
          invoice={buildInvoicePayload}
        />
      </div>

      <DraftInvoicesDialog
        open={draftsDialogOpen}
        onClose={() => setDraftsDialogOpen(false)}
        drafts={drafts}
        onConfirm={handleRestoreDraft}
        onDelete={handleDeleteDraft}
      />
    </div>
  );
}
