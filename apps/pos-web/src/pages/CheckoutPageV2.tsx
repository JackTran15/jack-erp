import { useCallback, useMemo, useRef, useState } from "react";
import { PanelCollapseHandle } from "../CheckoutPageV2Components/catalog/PanelCollapseHandle";
import { ProductCatalogGrid } from "../CheckoutPageV2Components/catalog/ProductCatalogGrid";
import { ProductCatalogHeader } from "../CheckoutPageV2Components/catalog/ProductCatalogHeader";
import { InvoiceLineItemTable } from "../CheckoutPageV2Components/invoice/InvoiceLineItemTable";
import { PaymentSummaryPanel } from "../CheckoutPageV2Components/payment/PaymentSummaryPanel";
import { POSToolbar } from "../CheckoutPageV2Components/toolbar/POSToolbar";
import { InvoiceTabBar } from "../CheckoutPageV2Components/topbar/InvoiceTabBar";
import type {
  CashSuggestion,
  CatalogProduct,
  InvoiceLineItem,
  InvoiceTabItem,
  PaymentMethodOption,
} from "../CheckoutPageV2Components/types";

const PAYMENT_METHOD_CASH: PaymentMethodOption = {
  value: "CASH",
  label: "Tiền mặt",
};

/**
 * Mock invoice tabs — the spec shows two: an active "Hóa đơn 1" and a draft.
 * Replace with real multi-tab state when wired to the cart store.
 */
const INITIAL_TABS: InvoiceTabItem[] = [
  { id: "tab-1", label: "Hóa đơn 1" },
  { id: "tab-draft", label: "HĐ lưu tạm", isDraft: true },
];

/** Initial line items mirror the screenshot in the spec (4.3.6). */
const INITIAL_LINES: InvoiceLineItem[] = [
  {
    id: "line-1",
    sku: "MY3007-D-35",
    name: "Dép nữ MY3007-D-35",
    qty: 1,
    unit: "Đôi",
    unitPrice: 850_000,
    hasWarning: true,
  },
  {
    id: "line-2",
    sku: "AKCV19837-D-40",
    name: "Giầy nam AKCV19837-D-40",
    qty: 1,
    unit: "Đôi",
    unitPrice: 1_650_000,
    hasWarning: true,
  },
];

/** Mock catalog — 12 cards (2 rows × 6 cols), matching spec section 4.7.9. */
const CATALOG: CatalogProduct[] = [
  { id: "p1", name: "MY3007", price: 850_000 },
  { id: "p2", name: "AKCV19837", price: 1_650_000 },
  { id: "p3", name: "MY63652", price: 695_000 },
  { id: "p4", name: "CTH64982", price: 780_000 },
  { id: "p5", name: "TM05", price: 265_000 },
  { id: "p6", name: "DUG02030", price: 585_000 },
  { id: "p7", name: "Dây thắt lưng DD650", price: 650_000 },
  { id: "p8", name: "MTYJ538", price: 780_000 },
  { id: "p9", name: "MY35315", price: 750_000 },
  { id: "p10", name: "PGIA222", price: 695_000 },
  { id: "p11", name: "AK6HD22", price: 1_395_000 },
  { id: "p12", name: "MY280038", price: 850_000 },
];

const datetimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDateTime(d: Date): string {
  // "05/05/2026 - 22:11" — manual join because Intl uses ", " between date+time.
  const parts = datetimeFormatter.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} - ${get("hour")}:${get("minute")}`;
}

function buildSuggestions(amountDue: number): CashSuggestion[] {
  if (amountDue <= 0) return [];
  return [
    { id: "exact", amount: amountDue },
    { id: "plus-1k", amount: amountDue + 1_000 },
    { id: "plus-10k", amount: amountDue + 10_000 },
  ];
}

export function CheckoutPageV2() {
  const productSearchRef = useRef<HTMLInputElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);

  // ----- Tabs ------------------------------------------------------------
  const [tabs, setTabs] = useState<InvoiceTabItem[]>(INITIAL_TABS);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0]?.id ?? "");

  const handleAddTab = useCallback(() => {
    setTabs((prev) => {
      const next = prev.filter((t) => !t.isDraft);
      const newId = `tab-${Date.now()}`;
      const drafts = prev.filter((t) => t.isDraft);
      const newTab: InvoiceTabItem = {
        id: newId,
        label: `Hóa đơn ${next.length + 1}`,
      };
      setActiveTabId(newId);
      return [...next, newTab, ...drafts];
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

  // ----- Toolbar ---------------------------------------------------------
  const [toolbar, setToolbar] = useState({
    query: "",
    qty: 1,
    splitLine: false,
    salesperson: undefined as string | undefined,
    priceBook: undefined as string | undefined,
  });

  // ----- Invoice lines ---------------------------------------------------
  const [lines, setLines] = useState<InvoiceLineItem[]>(INITIAL_LINES);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(
    INITIAL_LINES[0]?.id ?? null,
  );

  const handleSelectLine = useCallback(
    (id: string) => setSelectedLineId(id),
    [],
  );
  const handleRemoveLine = useCallback(
    (id: string) => {
      setLines((prev) => prev.filter((l) => l.id !== id));
      if (selectedLineId === id) setSelectedLineId(null);
    },
    [selectedLineId],
  );
  const handleChangeQty = useCallback(
    (id: string, qty: number) =>
      setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qty } : l))),
    [],
  );

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0),
    [lines],
  );
  const itemCount = lines.length;

  // ----- Catalog ---------------------------------------------------------
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogGroup, setCatalogGroup] = useState<string | undefined>(
    undefined,
  );
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);

  const filteredCatalog = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    if (!q) return CATALOG;
    return CATALOG.filter((p) => p.name.toLowerCase().includes(q));
  }, [catalogQuery]);

  const handleAddProduct = useCallback(
    (product: CatalogProduct) => {
      setLines((prev) => {
        const existing = prev.find((l) => l.sku === product.name);
        if (existing) {
          return prev.map((l) =>
            l.id === existing.id ? { ...l, qty: l.qty + toolbar.qty } : l,
          );
        }
        const newLine: InvoiceLineItem = {
          id: `line-${Date.now()}`,
          sku: product.name,
          name: product.name,
          qty: toolbar.qty,
          unit: "Đôi",
          unitPrice: product.price,
        };
        setSelectedLineId(newLine.id);
        return [...prev, newLine];
      });
    },
    [toolbar.qty],
  );

  // ----- Payment panel ---------------------------------------------------
  const [paymentState, setPaymentState] = useState({
    customerQuery: "",
    saleMode: "Tại cửa hàng",
    deposit: 0,
    paymentMethod: PAYMENT_METHOD_CASH,
    paidAmount: 0,
    debt: false,
    debtAmount: 0,
    note: "",
    printInvoice: true,
    preorder: false,
    selectedSuggestionId: null as string | null,
  });

  const amountDue = Math.max(0, total - paymentState.deposit);
  const suggestions = useMemo(
    () => buildSuggestions(amountDue),
    [amountDue],
  );
  const changeAmount = Math.max(0, paymentState.paidAmount - amountDue);

  const datetime = useMemo(() => formatDateTime(new Date()), []);

  const handleCustomerQueryChange = useCallback(
    (customerQuery: string) =>
      setPaymentState((p) => ({ ...p, customerQuery })),
    [],
  );
  const handleNoteChange = useCallback(
    (note: string) => setPaymentState((p) => ({ ...p, note })),
    [],
  );
  const handleDebtChange = useCallback(
    (debt: boolean) => setPaymentState((p) => ({ ...p, debt })),
    [],
  );
  const handlePrintInvoiceChange = useCallback(
    (printInvoice: boolean) =>
      setPaymentState((p) => ({ ...p, printInvoice })),
    [],
  );
  const handlePreorderChange = useCallback(
    (preorder: boolean) => setPaymentState((p) => ({ ...p, preorder })),
    [],
  );
  const handlePickSuggestion = useCallback(
    (s: CashSuggestion) =>
      setPaymentState((p) => ({
        ...p,
        selectedSuggestionId: s.id,
        paidAmount: s.amount,
      })),
    [],
  );
  const handleSaveDraft = useCallback(() => {
    // UI-only: convert the active tab into a draft tab.
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId ? { ...t, isDraft: true, label: "HĐ lưu tạm" } : t,
      ),
    );
  }, [activeTabId]);
  const handleCollect = useCallback(() => {
    // UI-only: clear the cart and reset payment state.
    setLines([]);
    setSelectedLineId(null);
    setPaymentState((p) => ({
      ...p,
      customerQuery: "",
      paidAmount: 0,
      note: "",
      selectedSuggestionId: null,
    }));
  }, []);

  return (
    <div className="flex h-screen w-full flex-col bg-gray-100 text-gray-900">
      <InvoiceTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={handleCloseTab}
        onAddTab={handleAddTab}
        location="Giầy MT Cần Thơ"
        userName="Phan Thanh Hà"
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left column: invoice + catalog */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <POSToolbar
            ref={productSearchRef}
            state={toolbar}
            onQueryChange={(query) =>
              setToolbar((s) => ({ ...s, query }))
            }
            onQtyChange={(qty) => setToolbar((s) => ({ ...s, qty }))}
            onSplitLineChange={(splitLine) =>
              setToolbar((s) => ({ ...s, splitLine }))
            }
          />

          <InvoiceLineItemTable
            lines={lines}
            selectedId={selectedLineId}
            onSelect={handleSelectLine}
            onRemove={handleRemoveLine}
            onChangeQty={handleChangeQty}
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
              <ProductCatalogGrid
                products={filteredCatalog}
                onSelect={handleAddProduct}
              />
            </>
          )}
        </div>

        {/* Right column: payment panel */}
        <PaymentSummaryPanel
          ref={customerInputRef}
          datetime={datetime}
          state={{
            customerQuery: paymentState.customerQuery,
            saleMode: paymentState.saleMode,
            itemCount,
            total,
            deposit: paymentState.deposit,
            paymentMethod: paymentState.paymentMethod,
            paidAmount: paymentState.paidAmount || amountDue,
            changeAmount,
            debt: paymentState.debt,
            debtAmount: paymentState.debtAmount,
            note: paymentState.note,
            printInvoice: paymentState.printInvoice,
            preorder: paymentState.preorder,
            selectedSuggestionId: paymentState.selectedSuggestionId,
          }}
          suggestions={suggestions}
          onCustomerQueryChange={handleCustomerQueryChange}
          onDebtChange={handleDebtChange}
          onNoteChange={handleNoteChange}
          onPrintInvoiceChange={handlePrintInvoiceChange}
          onPreorderChange={handlePreorderChange}
          onPickSuggestion={handlePickSuggestion}
          onSaveDraft={handleSaveDraft}
          onCollect={handleCollect}
          collectDisabled={lines.length === 0}
        />
      </div>
    </div>
  );
}
