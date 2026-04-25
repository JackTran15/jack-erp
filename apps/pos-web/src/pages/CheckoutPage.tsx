import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { CustomerCreateDialog } from "../components/CustomerCreateDialog";
import { CustomerSelectDialog } from "../components/CustomerSelectDialog";
import {
  formatCustomerDisplay,
  phoneNumbersMatch,
  searchCustomers,
  type CustomerRow,
} from "../lib/customerApi";
import { formatCurrencyVnd } from "../lib/formatCurrency";
import { usePosBranchStore } from "../stores/usePosBranchStore";
import { fetchPosCatalog, type PosCatalogLine } from "../lib/posCatalogApi";
import { useAnnounce } from "../hooks/useAnnounce";

const qtyFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 2,
});

function formatOnHand(n: number, unit: string): string {
  return `${qtyFormatter.format(n)} ${unit}`.trim();
}

type CartLine = {
  lineId: string;
  itemId: string;
  name: string;
  code: string;
  unit: string;
  unitPrice: number;
  qty: number;
  locationId: string;
  maxQty: number;
};

type PaymentMethod = "CASH" | "CARD" | "TRANSFER";

const QUICK_AMOUNTS = [500_000, 200_000, 100_000, 50_000] as const;

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

function lineTotal(line: CartLine): number {
  return line.unitPrice * line.qty;
}

function locationQtyFor(product: PosCatalogLine): number {
  return (
    product.locations.find((l) => l.locationId === product.defaultLocationId)
      ?.quantity ?? 0
  );
}

export function CheckoutPage() {
  const searchId = useId();
  const customerPhoneId = useId();
  const liveTotalId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const customerPhoneRef = useRef<HTMLInputElement>(null);
  const cashInputRef = useRef<HTMLInputElement>(null);
  const branchId = usePosBranchStore((s) => s.branchId)!;

  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [catalog, setCatalog] = useState<PosCatalogLine[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");

  const { message: announcement, announce } = useAnnounce();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("CASH");
  const [cartError, setCartError] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(
    null,
  );
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [createDefaultPhone, setCreateDefaultPhone] = useState("");
  const [customerPhoneQuery, setCustomerPhoneQuery] = useState("");
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerFieldError, setCustomerFieldError] = useState("");
  const [customerMatchCandidates, setCustomerMatchCandidates] = useState<
    CustomerRow[]
  >([]);
  const [customerPhoneFocused, setCustomerPhoneFocused] = useState(false);
  const [customerHighlightIdx, setCustomerHighlightIdx] = useState(-1);
  const customerPhoneWrapRef = useRef<HTMLDivElement>(null);
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q),
    );
  }, [catalog, query]);

  const showSuggestions = searchFocused && query.trim().length > 0;
  const suggestions = showSuggestions ? filteredProducts.slice(0, 8) : [];

  useEffect(() => {
    setHighlightIdx(-1);
  }, [query]);

  useEffect(() => {
    if (!showSuggestions) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        searchWrapRef.current &&
        !searchWrapRef.current.contains(e.target as Node)
      ) {
        setSearchFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSuggestions]);

  const handleSearchKeyDownRef = useRef<
    ((e: React.KeyboardEvent<HTMLInputElement>) => void) | null
  >(null);

  const grandTotal = useMemo(
    () => cart.reduce((sum, line) => sum + lineTotal(line), 0),
    [cart],
  );

  const cashReceivedNum = Number.parseFloat(cashReceived) || 0;
  const changeAmount = cashReceivedNum - grandTotal;

  const pickCustomer = useCallback(
    (c: CustomerRow, announceMessage?: string) => {
      setSelectedCustomer(c);
      setCustomerMatchCandidates([]);
      setCustomerFieldError("");
      setCustomerPhoneFocused(false);
      setCustomerHighlightIdx(-1);
      setCustomerPhoneQuery(c.phone?.trim() ?? "");
      announce(
        announceMessage ?? `Đã chọn khách ${formatCustomerDisplay(c)}.`,
      );
    },
    [announce],
  );

  // Live-search customers as user types (debounced 350ms)
  const runCustomerLiveSearch = useCallback(
    async (q: string) => {
      if (q.length < 2) {
        setCustomerMatchCandidates([]);
        return;
      }
      try {
        const res = await searchCustomers(q);
        setCustomerMatchCandidates(res.data.slice(0, 8));
      } catch {
        setCustomerMatchCandidates([]);
      }
    },
    [],
  );

  const handleCustomerPhoneChange = useCallback(
    (value: string) => {
      setCustomerPhoneQuery(value);
      setCustomerFieldError("");
      setCustomerHighlightIdx(-1);
      setCustomerPhoneFocused(true);
      if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
      const q = value.trim();
      if (q.length < 2) {
        setCustomerMatchCandidates([]);
        return;
      }
      customerDebounceRef.current = setTimeout(() => {
        void runCustomerLiveSearch(q);
      }, 350);
    },
    [runCustomerLiveSearch],
  );

  useEffect(() => {
    return () => {
      if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
    };
  }, []);

  const showCustomerSuggestions =
    customerPhoneFocused &&
    customerPhoneQuery.trim().length >= 2 &&
    customerMatchCandidates.length > 0;

  useEffect(() => {
    if (!showCustomerSuggestions) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        customerPhoneWrapRef.current &&
        !customerPhoneWrapRef.current.contains(e.target as Node)
      ) {
        setCustomerPhoneFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showCustomerSuggestions]);

  const handleCustomerPhoneKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (showCustomerSuggestions) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setCustomerHighlightIdx((i) =>
            (i + 1) % customerMatchCandidates.length,
          );
          return;
        case "ArrowUp":
          e.preventDefault();
          setCustomerHighlightIdx((i) =>
            i <= 0 ? customerMatchCandidates.length - 1 : i - 1,
          );
          return;
        case "Escape":
          e.preventDefault();
          setCustomerPhoneFocused(false);
          return;
        case "Enter":
          if (
            customerHighlightIdx >= 0 &&
            customerHighlightIdx < customerMatchCandidates.length
          ) {
            e.preventDefault();
            pickCustomer(customerMatchCandidates[customerHighlightIdx]!);
            return;
          }
          break;
      }
    }
  };

  const handleCustomerPhoneSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const raw = customerPhoneQuery.trim();
      setCustomerFieldError("");
      setCustomerMatchCandidates([]);
      if (raw.length < 2) {
        setCustomerFieldError("Nhập ít nhất 2 ký tự.");
        return;
      }
      setCustomerSearchLoading(true);
      try {
        const res = await searchCustomers(raw);
        const rows = res.data;

        const exactByPhone = rows.filter((c) =>
          phoneNumbersMatch(c.phone, raw),
        );

        if (exactByPhone.length === 1) {
          pickCustomer(exactByPhone[0]!);
          return;
        }
        if (exactByPhone.length > 1) {
          setCustomerMatchCandidates(exactByPhone.slice(0, 8));
          setCustomerFieldError(
            "Nhiều khách trùng SĐT — chọn một dòng bên dưới.",
          );
          return;
        }

        if (rows.length === 1 && rows[0]!.phone && phoneNumbersMatch(rows[0]!.phone, raw)) {
          pickCustomer(rows[0]!);
          return;
        }

        setCreateDefaultPhone(raw);
        setCreateCustomerOpen(true);
      } catch (err) {
        setCustomerFieldError(customerSearchErrorMessage(err));
      } finally {
        setCustomerSearchLoading(false);
      }
    },
    [customerPhoneQuery, pickCustomer],
  );

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
        return [
          ...prev,
          {
            lineId: crypto.randomUUID(),
            itemId: product.itemId,
            name: product.name,
            code: product.code,
            unit: product.unit,
            unitPrice: product.sellingPrice ?? 0,
            qty: 1,
            locationId: product.defaultLocationId,
            maxQty: atLocation,
          },
        ];
      });
      announce(`Đã thêm ${product.name} vào giỏ hàng.`);
    },
    [announce],
  );

  const selectSuggestion = useCallback(
    (p: PosCatalogLine) => {
      const atDef = locationQtyFor(p);
      if (atDef >= 1) {
        addProduct(p);
        setQuery("");
        setSearchFocused(false);
        searchRef.current?.focus();
      } else {
        setCartError("Hết tồn.");
      }
    },
    [addProduct],
  );

  handleSearchKeyDownRef.current = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((i) => (i + 1) % suggestions.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        break;
      case "Enter":
        if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
          e.preventDefault();
          selectSuggestion(suggestions[highlightIdx]!);
        }
        break;
      case "Escape":
        e.preventDefault();
        setSearchFocused(false);
        break;
    }
  };

  const updateUnitPrice = (lineId: string, raw: string) => {
    const n = Math.max(0, Number.parseFloat(raw.replace(",", ".")) || 0);
    setCart((prev) =>
      prev.map((l) => (l.lineId === lineId ? { ...l, unitPrice: n } : l)),
    );
  };

  const updateQty = (lineId: string, raw: string) => {
    const n = Math.floor(Number.parseFloat(raw.replace(",", ".")) || 0);
    setCart((prev) => {
      const line = prev.find((l) => l.lineId === lineId);
      if (!line) return prev;
      const cap = line.maxQty;
      const safe = Math.max(1, Math.min(cap, n));
      return prev.map((l) => (l.lineId === lineId ? { ...l, qty: safe } : l));
    });
  };

  const bumpQty = (lineId: string, delta: number) => {
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
  };

  const removeLine = (line: CartLine) => {
    setCart((prev) => prev.filter((l) => l.lineId !== line.lineId));
    announce(`Đã xóa ${line.name} khỏi giỏ hàng.`);
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (filteredProducts.length === 1) {
      addProduct(filteredProducts[0]!);
      setQuery("");
      searchRef.current?.focus();
    } else if (filteredProducts.length === 0) {
      setCartError("Không tìm thấy hàng phù hợp.");
    } else {
      setCartError("Nhiều kết quả — chọn hàng bên dưới hoặc thu hẹp từ khóa.");
    }
  };

  const handleCheckout = (e: FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      setCartError("Giỏ hàng trống.");
      return;
    }
    if (cart.some((l) => l.unitPrice <= 0)) {
      setCartError("Nhập đơn giá > 0 cho từng dòng hàng.");
      return;
    }
    if (payment === "CASH" && cashReceivedNum > 0 && cashReceivedNum < grandTotal) {
      setCartError("Tiền khách đưa chưa đủ.");
      return;
    }
    setCartError("");
    const who = selectedCustomer
      ? ` cho ${formatCustomerDisplay(selectedCustomer)}`
      : " (khách lẻ)";
    announce(
      `Đã ghi nhận thanh toán${who}, ${formatCurrencyVnd(grandTotal)}, ${paymentLabel(payment)}.`,
    );
    setCart([]);
    setSelectedCustomer(null);
    setCustomerPhoneQuery("");
    setCustomerMatchCandidates([]);
    setCustomerFieldError("");
    setCustomerPhoneFocused(false);
    setCustomerHighlightIdx(-1);
    setCashReceived("");
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "F1") {
          e.preventDefault();
          searchRef.current?.focus();
        }
        return;
      }

      switch (e.key) {
        case "F1":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "F9":
          e.preventDefault();
          if (cart.length > 0) {
            const fakeEvent = { preventDefault: () => {} } as FormEvent;
            handleCheckout(fakeEvent);
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <>
      <div
        className="pos-live-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>

      {cartError ? (
        <div className="pos-alert" role="alert">{cartError}</div>
      ) : null}

      <CustomerCreateDialog
        open={createCustomerOpen}
        onClose={() => setCreateCustomerOpen(false)}
        defaultPhone={createDefaultPhone}
        onCreated={(c) => {
          setCreateCustomerOpen(false);
          pickCustomer(
            c,
            `Đã tạo và chọn khách ${formatCustomerDisplay(c)}.`,
          );
        }}
      />

      <CustomerSelectDialog
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        onSelected={(c) => {
          pickCustomer(c);
          setCustomerDialogOpen(false);
        }}
      />

      <div className="pos-checkout-grid">
        {/* ====== CỘT TRÁI: Tìm kiếm + Sản phẩm ====== */}
        <div className="pos-left-col">
          {/* Ô tìm kiếm + autocomplete */}
          <section className="pos-panel pos-search-panel" aria-labelledby="pos-search-heading">
            <div ref={searchWrapRef} className="pos-autocomplete">
              <form onSubmit={handleSearchSubmit} className="pos-search-bar">
                <input
                  ref={searchRef}
                  id={searchId}
                  className="pos-input pos-search-bar__input"
                  type="search"
                  autoComplete="off"
                  placeholder="Tìm tên hoặc mã hàng… (F1)"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setCartError("");
                    setSearchFocused(true);
                  }}
                  onFocus={() => setSearchFocused(true)}
                  onKeyDown={(e) => handleSearchKeyDownRef.current?.(e)}
                  disabled={catalogLoading}
                  role="combobox"
                  aria-expanded={showSuggestions && suggestions.length > 0}
                  aria-autocomplete="list"
                  aria-controls="pos-search-listbox"
                  aria-activedescendant={
                    highlightIdx >= 0 ? `pos-sg-${highlightIdx}` : undefined
                  }
                />
                <button
                  type="submit"
                  className="pos-btn pos-btn--primary"
                  disabled={catalogLoading}
                >
                  Thêm
                </button>
              </form>

              {showSuggestions && suggestions.length > 0 ? (
                <ul
                  id="pos-search-listbox"
                  className="pos-autocomplete__list"
                  role="listbox"
                >
                  {suggestions.map((p, idx) => {
                    const atDef = locationQtyFor(p);
                    const canAdd = atDef >= 1;
                    return (
                      <li
                        key={p.itemId}
                        id={`pos-sg-${idx}`}
                        role="option"
                        aria-selected={idx === highlightIdx}
                        className={`pos-autocomplete__item${idx === highlightIdx ? " pos-autocomplete__item--active" : ""}${!canAdd ? " pos-autocomplete__item--disabled" : ""}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectSuggestion(p);
                        }}
                        onMouseEnter={() => setHighlightIdx(idx)}
                      >
                        <span className="pos-autocomplete__name">{p.name}</span>
                        <span className="pos-autocomplete__meta">
                          {p.code} · Tồn {formatOnHand(p.quantityOnHand, p.unit)}
                          {!canAdd && " · Hết"}
                        </span>
                      </li>
                    );
                  })}
                  {filteredProducts.length > 8 && (
                    <li className="pos-autocomplete__more">
                      +{filteredProducts.length - 8} kết quả khác
                    </li>
                  )}
                </ul>
              ) : null}

              {showSuggestions && query.trim().length > 0 && suggestions.length === 0 ? (
                <div className="pos-autocomplete__list pos-autocomplete__empty">
                  Không tìm thấy hàng phù hợp.
                </div>
              ) : null}
            </div>
          </section>

          {/* Product grid */}
          <section className="pos-panel" aria-labelledby="pos-products-heading">
            <h3 id="pos-products-heading" className="pos-section-title">
              Hàng bán
              <span className="pos-badge">{catalog.length}</span>
            </h3>

            {catalogError ? (
              <div className="pos-alert pos-mb-sm">
                {catalogError}
                <button
                  type="button"
                  className="pos-btn pos-btn--secondary"
                  onClick={() => void loadCatalog()}
                  style={{ marginLeft: "0.5rem" }}
                >
                  Tải lại
                </button>
              </div>
            ) : null}

            {catalogLoading ? (
              <p className="pos-hint pos-mt-0" aria-live="polite">Đang tải…</p>
            ) : !catalogError && catalog.length === 0 ? (
              <p className="pos-hint pos-mt-0" role="status">Chưa có tồn kho.</p>
            ) : (
              <div className="pos-products-grid">
                {catalog.map((p) => {
                  const onHand = p.quantityOnHand;
                  const atDef = locationQtyFor(p);
                  const canAdd = atDef >= 1;
                  return (
                    <button
                      key={p.itemId}
                      type="button"
                      className={`pos-product-card${canAdd ? "" : " pos-product-card--disabled"}`}
                      onClick={() => canAdd && addProduct(p)}
                      disabled={!canAdd || catalogLoading}
                      aria-label={`Thêm ${p.name}, tồn ${formatOnHand(onHand, p.unit)}`}
                    >
                      <div className="pos-product-card__img" aria-hidden="true">
                        <span className="pos-product-card__placeholder">
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="pos-product-card__body">
                        <span className="pos-product-card__name">{p.name}</span>
                        <span className="pos-product-card__code">{p.code}</span>
                      </div>
                      <span className="pos-product-card__stock">
                        Tồn: {formatOnHand(onHand, p.unit)}
                      </span>
                      {!canAdd && (
                        <span className="pos-product-card__oos">Hết</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ====== CỘT PHẢI: Khách + Giỏ + Thanh toán ====== */}
        <div className="pos-right-col">
          {/* Khách hàng: SĐT + Enter */}
          <section
            className="pos-panel pos-sidebar-section"
            aria-labelledby="pos-customer-label"
          >
            <h3 id="pos-customer-label" className="pos-section-title">
              Khách hàng
            </h3>
            <form
              onSubmit={handleCustomerPhoneSubmit}
              className="pos-customer-phone-block"
            >
              <label className="pos-cash-section__label" htmlFor={customerPhoneId}>
                Số điện thoại
              </label>
              <div ref={customerPhoneWrapRef} className="pos-autocomplete">
                <div className="pos-customer-phone-row">
                  <input
                    ref={customerPhoneRef}
                    id={customerPhoneId}
                    className="pos-input"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Nhập SĐT…"
                    value={customerPhoneQuery}
                    onChange={(e) => handleCustomerPhoneChange(e.target.value)}
                    onFocus={() => {
                      setCustomerPhoneFocused(true);
                      if (customerPhoneQuery.trim().length >= 2 && customerMatchCandidates.length === 0) {
                        void runCustomerLiveSearch(customerPhoneQuery.trim());
                      }
                    }}
                    onKeyDown={handleCustomerPhoneKeyDown}
                    role="combobox"
                    aria-expanded={showCustomerSuggestions}
                    aria-autocomplete="list"
                    aria-controls="pos-customer-listbox"
                    aria-activedescendant={
                      customerHighlightIdx >= 0 ? `pos-cust-${customerHighlightIdx}` : undefined
                    }
                  />
                  <button
                    type="submit"
                    className="pos-btn pos-btn--secondary pos-btn--sm"
                    disabled={customerSearchLoading}
                  >
                    {customerSearchLoading ? "…" : "Tìm"}
                  </button>
                </div>

                {showCustomerSuggestions ? (
                  <ul
                    id="pos-customer-listbox"
                    className="pos-autocomplete__list"
                    role="listbox"
                  >
                    {customerMatchCandidates.map((c, idx) => (
                      <li
                        key={c.id}
                        id={`pos-cust-${idx}`}
                        role="option"
                        aria-selected={idx === customerHighlightIdx}
                        className={`pos-autocomplete__item${idx === customerHighlightIdx ? " pos-autocomplete__item--active" : ""}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickCustomer(c);
                        }}
                        onMouseEnter={() => setCustomerHighlightIdx(idx)}
                      >
                        <span className="pos-autocomplete__name">
                          {formatCustomerDisplay(c)}
                        </span>
                        <span className="pos-autocomplete__meta">
                          {c.phone ?? "—"}
                          {c.email ? ` · ${c.email}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <p id="pos-customer-phone-hint" className="pos-hint" style={{ marginTop: "0.25rem" }}>
                Gõ để tìm · Enter: chọn hoặc tạo mới.
              </p>
              {customerFieldError ? (
                <p className="pos-customer-field-error" role="alert">
                  {customerFieldError}
                </p>
              ) : null}
            </form>

            {selectedCustomer ? (
              <div className="pos-customer-selected">
                <span className="pos-customer-selected__name">
                  {formatCustomerDisplay(selectedCustomer)}
                </span>
                {selectedCustomer.email ? (
                  <span className="pos-hint pos-mt-0 pos-customer-selected__email">
                    {selectedCustomer.email}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="pos-hint pos-mt-0">Chưa chọn — bán lẻ.</p>
            )}

            <div className="pos-customer-secondary-actions">
              <button
                type="button"
                className="pos-btn pos-btn--secondary pos-btn--sm"
                onClick={() => setCustomerDialogOpen(true)}
              >
                Tìm theo tên / nâng cao
              </button>
              {selectedCustomer ? (
                <button
                  type="button"
                  className="pos-btn pos-btn--secondary pos-btn--sm"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerPhoneQuery("");
                    setCustomerMatchCandidates([]);
                    setCustomerFieldError("");
                    setCustomerPhoneFocused(false);
                    setCustomerHighlightIdx(-1);
                    announce("Khách lẻ.");
                  }}
                >
                  Bỏ khách
                </button>
              ) : null}
            </div>
          </section>

          {/* Giỏ hàng */}
          <section className="pos-panel pos-sidebar-section" aria-labelledby="pos-cart-heading">
            <h3 id="pos-cart-heading" className="pos-section-title">
              Giỏ hàng
              <span className="pos-badge">{cart.length}</span>
            </h3>

            <div className="pos-sidebar-cart">
              {cart.length === 0 ? (
                <p className="pos-hint pos-mt-0 pos-sidebar-cart__empty">
                  Chọn hàng từ danh sách bên trái.
                </p>
              ) : (
                cart.map((line) => (
                  <div key={line.lineId} className="pos-sidebar-cart__item">
                    <div className="pos-sidebar-cart__row1">
                      <strong className="pos-sidebar-cart__name">{line.name}</strong>
                      <button
                        type="button"
                        className="pos-btn pos-btn--danger pos-btn--xs"
                        aria-label={`Xóa ${line.name}`}
                        onClick={() => removeLine(line)}
                      >
                        ✕
                      </button>
                    </div>
                    <div className="pos-sidebar-cart__row2">
                      <input
                        className="pos-input pos-sidebar-cart__price-input"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={1000}
                        value={line.unitPrice || ""}
                        onChange={(e) => updateUnitPrice(line.lineId, e.target.value)}
                        placeholder="Đơn giá"
                        aria-label={`Đơn giá ${line.name}`}
                      />
                      <div className="pos-qty-wrap">
                        <button
                          type="button"
                          className="pos-btn pos-btn--secondary pos-btn--xs"
                          aria-label={`Giảm ${line.name}`}
                          onClick={() => bumpQty(line.lineId, -1)}
                          disabled={line.qty <= 1}
                        >
                          −
                        </button>
                        <input
                          className="pos-qty-input"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={line.maxQty}
                          value={line.qty}
                          onChange={(e) => updateQty(line.lineId, e.target.value)}
                          aria-label={`Số lượng ${line.name}`}
                        />
                        <button
                          type="button"
                          className="pos-btn pos-btn--secondary pos-btn--xs"
                          aria-label={`Tăng ${line.name}`}
                          onClick={() => bumpQty(line.lineId, 1)}
                          disabled={line.qty >= line.maxQty}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="pos-sidebar-cart__subtotal">
                      {formatCurrencyVnd(lineTotal(line))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Thanh toán */}
          <form
            className="pos-panel pos-sidebar-section pos-checkout-form"
            onSubmit={handleCheckout}
            noValidate
          >
            {/* Tổng cộng */}
            <div className="pos-total-block">
              <div className="pos-total-row">
                <span>Tổng cộng</span>
                <span id={liveTotalId} aria-live="polite" aria-atomic="true">
                  {formatCurrencyVnd(grandTotal)}
                </span>
              </div>
            </div>

            {/* Phương thức */}
            <fieldset className="pos-fieldset--inline">
              <legend className="pos-visually-hidden">Hình thức thanh toán</legend>
              {(
                [
                  ["CASH", "Tiền mặt"],
                  ["CARD", "Thẻ"],
                  ["TRANSFER", "CK"],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`pos-chip${payment === value ? " pos-chip--active" : ""}`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value={value}
                    checked={payment === value}
                    onChange={() => setPayment(value)}
                    className="pos-visually-hidden"
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            {/* Tiền khách đưa (chỉ hiện khi tiền mặt) */}
            {payment === "CASH" && (
              <div className="pos-cash-section">
                <label htmlFor="cash-received" className="pos-cash-section__label">
                  Khách đưa
                </label>
                <input
                  ref={cashInputRef}
                  id="cash-received"
                  className="pos-input pos-cash-section__input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="0"
                />
                <div className="pos-quick-amounts">
                  {QUICK_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className="pos-btn pos-btn--secondary pos-btn--sm"
                      onClick={() => setCashReceived(String(amt))}
                    >
                      {(amt / 1000).toLocaleString("vi-VN")}k
                    </button>
                  ))}
                  {grandTotal > 0 && (
                    <button
                      type="button"
                      className="pos-btn pos-btn--secondary pos-btn--sm"
                      onClick={() => setCashReceived(String(grandTotal))}
                    >
                      Đủ
                    </button>
                  )}
                </div>

                {cashReceivedNum > 0 && (
                  <div className={`pos-change-row${changeAmount < 0 ? " pos-change-row--short" : ""}`}>
                    <span>Trả lại</span>
                    <span>{formatCurrencyVnd(Math.max(0, changeAmount))}</span>
                  </div>
                )}
                {cashReceivedNum > 0 && changeAmount < 0 && (
                  <div className="pos-change-row pos-change-row--short">
                    <span>Còn thiếu</span>
                    <span>{formatCurrencyVnd(Math.abs(changeAmount))}</span>
                  </div>
                )}
              </div>
            )}

            {/* Nút thanh toán */}
            <button
              type="submit"
              className="pos-btn pos-btn--primary pos-btn--checkout"
              disabled={cart.length === 0}
            >
              Thu tiền
              <kbd className="pos-kbd">F9</kbd>
            </button>
          </form>
        </div>
      </div>
    </>
  );
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
