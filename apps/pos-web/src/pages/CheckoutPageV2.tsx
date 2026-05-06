import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CustomerCreateDialog } from "../components/CustomerCreateDialog";
import { CustomerSelectDialog } from "../components/CustomerSelectDialog";
import { useAnnounce } from "../hooks/useAnnounce";
import {
  formatCustomerDisplay,
  searchCustomers,
  type CustomerRow,
} from "../lib/customerApi";
import { fetchPosCatalog, type PosCatalogLine } from "../lib/posCatalogApi";
import { usePosBranchStore } from "../stores/usePosBranchStore";

import { AlertBar } from "../CheckoutPageV2Components/common/AlertBar";
import type { SearchSuggestion } from "../CheckoutPageV2Components/common/SearchPopover";
import { PanelCollapseHandle } from "../CheckoutPageV2Components/catalog/PanelCollapseHandle";
import { ProductCatalogGrid } from "../CheckoutPageV2Components/catalog/ProductCatalogGrid";
import { ProductCatalogHeader } from "../CheckoutPageV2Components/catalog/ProductCatalogHeader";
import { InvoiceLineItemTable } from "../CheckoutPageV2Components/invoice/InvoiceLineItemTable";
import { PaymentSummaryPanel } from "../CheckoutPageV2Components/payment/PaymentSummaryPanel";
import { POSToolbar } from "../CheckoutPageV2Components/toolbar/POSToolbar";
import { InvoiceTabBar } from "../CheckoutPageV2Components/topbar/InvoiceTabBar";
import type { PromoMenuOption } from "../CheckoutPageV2Components/payment/PromoMenu";
import type { PromotionItem } from "../CheckoutPageV2Components/payment/promotion/types";
import type { InvoicePayload } from "../CheckoutPageV2Components/printing/types";
import type {
  CartLine,
  CashSuggestion,
  CatalogProduct,
  InvoiceTabItem,
  PaymentMethod,
  PaymentMethodOption,
} from "../CheckoutPageV2Components/types";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const PAYMENT_METHODS: readonly PaymentMethodOption[] = [
  { value: "CASH", label: "Tiền mặt" },
  { value: "CARD", label: "Thẻ" },
  { value: "TRANSFER", label: "Chuyển khoản" },
];

const qtyFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 2,
});

function formatOnHand(n: number, unit: string): string {
  return `${qtyFormatter.format(n)} ${unit}`.trim();
}

function locationQtyFor(product: PosCatalogLine): number {
  return (
    product.locations.find((l) => l.locationId === product.defaultLocationId)
      ?.quantity ?? 0
  );
}

function lineTotal(line: CartLine): number {
  return line.unitPrice * line.qty;
}

function paymentLabel(m: PaymentMethod): string {
  switch (m) {
    case "CASH":
      return "tiền mặt";
    case "CARD":
      return "thẻ";
    case "TRANSFER":
      return "chuyển khoản";
    default:
      return m;
  }
}

function promoOptionLabel(option: PromoMenuOption): string {
  switch (option) {
    case "promo":
      return "mã ưu đãi";
    case "voucher":
      return "voucher";
    case "discount":
      return "khuyến mãi";
    default:
      return option;
  }
}

function customerSearchErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (m.startsWith("HTTP 403")) {
      return "Không có quyền tìm khách (customer.read).";
    }
    if (m.startsWith("HTTP 401")) {
      return "Phiên hết hạn. Đăng nhập lại.";
    }
    return m.replace(/^HTTP \d+: /, "").slice(0, 300) || "Đã xảy ra lỗi.";
  }
  return "Lỗi không xác định.";
}

const datetimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDateTime(d: Date): string {
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

/** Receipt number generator: YYMMDD + 4 random digits — e.g. "2605050007". */
function generateInvoiceNumber(d: Date): string {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
  return `${yy}${mm}${dd}${seq}`;
}

/** Static store info — receipts always print under this branch identity. */
const STORE_INFO = {
  name: "Giày MT Cần Thơ",
  address: "95-97 Nguyễn Trãi, Ninh Kiều, Cần Thơ",
  phone: "0834561317",
} as const;

const RETURN_POLICY = {
  title: "QUY ĐỊNH ĐỔI TRẢ",
  body: "Đổi giày đẹp trong 7 ngày (giá trị đổi phải bằng hoặc cao hơn giá sản phẩm trước). Riêng mẫu vớ kiên tất xách, vớ, dây đã không đổi trả. Sản phẩm đổi trả phải còn tem và chưa qua sử dụng.",
} as const;

const CLOSING_MESSAGE = "Giày MT hân hạnh phục vụ quý khách!";

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

  // Catalog
  const [catalog, setCatalog] = useState<PosCatalogLine[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");

  // Toolbar
  const [toolbar, setToolbar] = useState({
    query: "",
    qty: 1,
    splitLine: false,
    salesperson: undefined as string | undefined,
    priceBook: undefined as string | undefined,
  });

  // Catalog filter (the "Tư vấn bán hàng" search)
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogGroup, setCatalogGroup] = useState<string | undefined>(
    undefined,
  );
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);

  // Cart
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [cartError, setCartError] = useState("");

  // Customer
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(
    null,
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerFieldError, setCustomerFieldError] = useState("");
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [createDefaultQuery, setCreateDefaultQuery] = useState("");
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [cashReceived, setCashReceived] = useState("");
  const [keepChange, setKeepChange] = useState(false);
  const [debt, setDebt] = useState(false);
  const [note, setNote] = useState("");
  const [printInvoice, setPrintInvoice] = useState(true);
  const [preorder, setPreorder] = useState(false);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<
    string | null
  >(null);

  // Promotion / voucher selection — backend wiring lands later, so the page
  // currently exposes an empty list (modal renders its empty state).
  const [appliedPromotion, setAppliedPromotion] = useState<PromotionItem | null>(
    null,
  );
  const promotions = useMemo<PromotionItem[]>(() => [], []);

  const { message: announcement, announce } = useAnnounce();

  // ---- Catalog loading ----
  const loadCatalog = useCallback(async () => {
    setCatalogError("");
    setCatalogLoading(true);
    try {
      const rows = await fetchPosCatalog(branchId);
      setCatalog(rows);
    } catch (e) {
      setCatalog([]);
      setCatalogError(
        e instanceof Error
          ? `Không tải được tồn kho: ${e.message}`
          : "Không tải được tồn kho.",
      );
    } finally {
      setCatalogLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // ---- Derived data ----
  const filteredProducts = useMemo(() => {
    const q = toolbar.query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q),
    );
  }, [catalog, toolbar.query]);

  const catalogProducts: CatalogProduct[] = useMemo(() => {
    const cq = catalogQuery.trim().toLowerCase();
    const filtered = cq
      ? catalog.filter(
          (p) =>
            p.name.toLowerCase().includes(cq) ||
            p.code.toLowerCase().includes(cq),
        )
      : catalog;
    return filtered.map((p) => ({
      id: p.itemId,
      name: p.name,
      price: p.sellingPrice ?? 0,
    }));
  }, [catalog, catalogQuery]);

  const grandTotal = useMemo(
    () => cart.reduce((sum, line) => sum + lineTotal(line), 0),
    [cart],
  );

  const cashReceivedNum = Number.parseFloat(cashReceived) || 0;
  const rawChangeAmount = Math.max(0, cashReceivedNum - grandTotal);
  // "Khách không lấy tiền thừa" — when checked, change owed is forfeited.
  const changeAmount = keepChange ? 0 : rawChangeAmount;
  const shortageAmount = Math.max(0, grandTotal - cashReceivedNum);
  const isCashShort =
    paymentMethod === "CASH" && cashReceivedNum > 0 && shortageAmount > 0;

  const suggestions = useMemo(
    () => buildSuggestions(grandTotal),
    [grandTotal],
  );

  const datetime = useMemo(() => formatDateTime(new Date()), []);

  const currentMethod = useMemo(
    () =>
      PAYMENT_METHODS.find((m) => m.value === paymentMethod) ??
      PAYMENT_METHODS[0]!,
    [paymentMethod],
  );

  // ---- Search adapters for SearchPopover ----
  const productSearchAdapter = useCallback(
    async (q: string): Promise<SearchSuggestion<PosCatalogLine>[]> => {
      const lower = q.toLowerCase();
      const matched = catalog.filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          p.code.toLowerCase().includes(lower),
      );
      return matched.slice(0, 8).map((p) => ({
        item: p,
        disabled: locationQtyFor(p) < 1,
      }));
    },
    [catalog],
  );

  const customerSearchAdapter = useCallback(
    async (q: string): Promise<SearchSuggestion<CustomerRow>[]> => {
      const res = await searchCustomers(q);
      return res.data.slice(0, 8).map((c) => ({ item: c }));
    },
    [],
  );

  // ---- Customer handlers ----
  const pickCustomer = useCallback(
    (c: CustomerRow, announceMessage?: string) => {
      setSelectedCustomer(c);
      setCustomerFieldError("");
      setCustomerQuery(c.name?.trim() ?? "");
      // "Khách không lấy tiền thừa" is hidden when a customer is selected;
      // reset the flag so it doesn't silently affect change calculation.
      setKeepChange(false);
      announce(
        announceMessage ?? `Đã chọn khách ${formatCustomerDisplay(c)}.`,
      );
    },
    [announce],
  );

  const handleCustomerSubmitQuery = useCallback(
    (raw: string): boolean => {
      if (raw.length < 2) {
        setCustomerFieldError("Nhập ít nhất 2 ký tự.");
        return true;
      }
      setCustomerFieldError("");
      void (async () => {
        try {
          const res = await searchCustomers(raw);
          const rows = res.data;
          if (rows.length === 1) {
            pickCustomer(rows[0]!);
            return;
          }
          if (rows.length > 1) {
            setCustomerFieldError("Nhiều kết quả — chọn từ gợi ý bên dưới.");
            return;
          }
          setCreateDefaultQuery(raw);
          setCreateCustomerOpen(true);
        } catch (err) {
          setCustomerFieldError(customerSearchErrorMessage(err));
        }
      })();
      return true;
    },
    [pickCustomer],
  );

  const handleClearCustomer = useCallback(() => {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerFieldError("");
    announce("Khách lẻ.");
  }, [announce]);

  const handleAddCustomer = useCallback(() => {
    setCreateDefaultQuery(customerQuery.trim());
    setCreateCustomerOpen(true);
  }, [customerQuery]);

  // ---- Cart handlers ----
  const addProduct = useCallback(
    (product: PosCatalogLine) => {
      const atLocation = locationQtyFor(product);
      if (atLocation < 1) {
        setCartError("Hết tồn tại vị trí ưu tiên bán. Kiểm tra kho hàng.");
        return;
      }
      setCart((prev) => {
        const existing = prev.find((l) => l.itemId === product.itemId);
        if (existing) {
          if (existing.qty + 1 > existing.maxQty) {
            setCartError("Đã đạt tối đa tồn tại vị trí bán cho mặt hàng này.");
            return prev;
          }
          setCartError("");
          return prev.map((l) =>
            l.itemId === product.itemId ? { ...l, qty: l.qty + 1 } : l,
          );
        }
        setCartError("");
        const newLine: CartLine = {
          lineId: crypto.randomUUID(),
          itemId: product.itemId,
          name: product.name,
          code: product.code,
          unit: product.unit,
          unitPrice: product.sellingPrice ?? 0,
          qty: 1,
          locationId: product.defaultLocationId,
          maxQty: atLocation,
        };
        setSelectedLineId(newLine.lineId);
        return [...prev, newLine];
      });
      announce(`Đã thêm ${product.name} vào giỏ hàng.`);
    },
    [announce],
  );

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
      const found = catalog.find((p) => p.itemId === product.id);
      if (!found) return;
      addProduct(found);
    },
    [addProduct, catalog],
  );

  const updateUnitPrice = useCallback((lineId: string, raw: string) => {
    const n = Math.max(0, Number.parseFloat(raw.replace(",", ".")) || 0);
    setCart((prev) =>
      prev.map((l) => (l.lineId === lineId ? { ...l, unitPrice: n } : l)),
    );
  }, []);

  const updateQty = useCallback((lineId: string, raw: string) => {
    const n = Math.floor(Number.parseFloat(raw.replace(",", ".")) || 0);
    setCart((prev) => {
      const line = prev.find((l) => l.lineId === lineId);
      if (!line) return prev;
      const safe = Math.max(1, Math.min(line.maxQty, n));
      return prev.map((l) => (l.lineId === lineId ? { ...l, qty: safe } : l));
    });
  }, []);

  const bumpQty = useCallback((lineId: string, delta: number) => {
    setCart((prev) => {
      const l = prev.find((x) => x.lineId === lineId);
      if (!l) return prev;
      const next = l.qty + delta;
      if (next < 1) return prev;
      if (next > l.maxQty) {
        setCartError("Số lượng vượt tồn kho.");
        return prev;
      }
      setCartError("");
      return prev.map((x) => (x.lineId === lineId ? { ...x, qty: next } : x));
    });
  }, []);

  const removeLine = useCallback(
    (lineId: string) => {
      setCart((prev) => {
        const target = prev.find((l) => l.lineId === lineId);
        if (target) announce(`Đã xóa ${target.name} khỏi giỏ hàng.`);
        return prev.filter((l) => l.lineId !== lineId);
      });
      setSelectedLineId((id) => (id === lineId ? null : id));
    },
    [announce],
  );

  const isLineWarning = useCallback(
    (l: CartLine) => l.qty >= l.maxQty || l.unitPrice <= 0,
    [],
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
      if (
        paymentMethod === "CASH" &&
        cashReceivedNum > 0 &&
        cashReceivedNum < grandTotal
      ) {
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
        }).format(grandTotal)}, ${paymentLabel(paymentMethod)}.`,
      );
      // reset
      setCart([]);
      setSelectedLineId(null);
      setSelectedCustomer(null);
      setCustomerQuery("");
      setCustomerFieldError("");
      setCashReceived("");
      setSelectedSuggestionId(null);
      setNote("");
      setKeepChange(false);
      setDebt(false);
    },
    [
      announce,
      cart,
      cashReceivedNum,
      grandTotal,
      paymentMethod,
      selectedCustomer,
    ],
  );

  const handleSaveDraft = useCallback(() => {
    if (cart.length === 0) return;
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId
          ? { ...t, isDraft: true, label: "HĐ lưu tạm" }
          : t,
      ),
    );
    announce("Đã lưu tạm hóa đơn.");
    setCart([]);
    setSelectedLineId(null);
  }, [activeTabId, announce, cart.length]);

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
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const inField =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;
      if (inField) {
        if (e.key === "F3") {
          e.preventDefault();
          productSearchRef.current?.focus();
        }
        if (e.key === "F4") {
          e.preventDefault();
          customerSearchRef.current?.focus();
        }
        return;
      }
      switch (e.key) {
        case "F3":
          e.preventDefault();
          productSearchRef.current?.focus();
          break;
        case "F4":
          e.preventDefault();
          customerSearchRef.current?.focus();
          break;
        case "F9":
          e.preventDefault();
          if (cart.length > 0) handleCheckout({ preventDefault: () => {} });
          break;
        case "F10":
          e.preventDefault();
          handleSaveDraft();
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart.length, handleCheckout, handleSaveDraft]);

  // ---- Cash suggestion / amount handlers ----
  const handlePickSuggestion = useCallback((s: CashSuggestion) => {
    setSelectedSuggestionId(s.id);
    setCashReceived(String(s.amount));
  }, []);

  const handleChangePaidAmount = useCallback((raw: string) => {
    setCashReceived(raw);
    setSelectedSuggestionId(null);
  }, []);

  const debtAmount = debt ? shortageAmount : 0;

  // ---- Invoice payload factory (printed on "Thu tiền") ----
  // Closure captures the *current* render's state so the receipt reflects
  // the cart/customer/totals before `handleCheckout` clears them.
  const buildInvoicePayload = (): InvoicePayload | null => {
    if (!printInvoice) return null;
    if (cart.length === 0) return null;
    const totalQty = cart.reduce((sum, l) => sum + l.qty, 0);
    const subtotal = grandTotal;
    const paid =
      paymentMethod === "CASH"
        ? cashReceivedNum > 0
          ? cashReceivedNum
          : grandTotal
        : grandTotal;
    return {
      store: STORE_INFO,
      invoiceNumber: generateInvoiceNumber(new Date()),
      issuedAt: new Date(),
      lines: cart.map((l, i) => ({
        index: i + 1,
        name: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
      })),
      totals: {
        totalQty,
        subtotal,
        grandTotal,
        paid,
        change: Math.max(0, paid - grandTotal),
      },
      paymentMethodLabel: currentMethod.label,
      policy: RETURN_POLICY,
      closingMessage: CLOSING_MESSAGE,
    };
  };

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
          pickCustomer(
            c,
            `Đã tạo và chọn khách ${formatCustomerDisplay(c)}.`,
          );
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
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
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

          {cartError ? (
            <AlertBar variant="error">{cartError}</AlertBar>
          ) : null}
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
                <p className="px-3 py-6 text-[13px] text-gray-500">
                  Đang tải…
                </p>
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
            announce(p ? `Đã áp dụng ${p.name}.` : "Đã bỏ chương trình khuyến mãi.");
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
            onSearchVoucher: (code) =>
              announce(`Đang tìm mã ưu đãi ${code}.`),
          }}
          onEditCustomer={() => setEditCustomerOpen(true)}
          itemCount={cart.length}
          total={grandTotal}
          deposit={0}
          methods={PAYMENT_METHODS}
          paymentMethod={currentMethod}
          paidAmount={cashReceivedNum}
          amountReadOnly={paymentMethod !== "CASH"}
          onChangeMethod={(m) => {
            setPaymentMethod(m);
            if (m !== "CASH") setCashReceived("");
          }}
          onChangePaidAmount={handleChangePaidAmount}
          changeAmount={changeAmount}
          shortageAmount={isCashShort ? shortageAmount : 0}
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
    </div>
  );
}
