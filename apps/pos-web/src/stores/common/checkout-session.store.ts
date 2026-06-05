import { create } from "zustand";
import { persist } from "zustand/middleware";
import { POINT_REDEMPTION_VALUE_VND } from "@erp/pos/constants/loyalty.constant";
import {
  createPaymentLine,
  type PaymentLine,
} from "@erp/pos/components/common/PosPaymentMethodRow/PosPaymentMethodRow";
import type {
  CartLine,
  CashSuggestion,
  CheckoutCatalogDraft,
  CheckoutCustomerDraft,
  CheckoutDraft,
  CheckoutLabelsDraft,
  CheckoutMetaDraft,
  CheckoutPaymentDraft,
  CheckoutPromotionDraft,
  DraftInvoice,
} from "@erp/pos/interfaces/checkout.interface";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";
import { CheckoutVariantEnum } from "@erp/pos/types/checkout.type";
import { coerceCheckoutVariant } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import {
  computeChangedPaymentLines,
  computeFirstLineAuto,
  computePickSuggestionLines,
  ensureDraftShape,
  initialCheckoutDraft,
} from "@erp/pos/lib/page-libs/checkout/checkoutDraft";
import { netSessionGrandTotal } from "@erp/pos/lib/page-libs/checkout/checkoutSessionTotals";
import { getOversellSaleLines } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";

const STORAGE_KEY = "pos-checkout-sessions";
// v2: thêm `InvoiceSession.draft` (state soạn thảo per-tab). Session lưu ở v1
// (chưa có draft) được `ensureDraftShape` backfill trong `merge`.
const STORE_VERSION = 2;

export enum CheckoutPane {
  RETURN = "return",
  PURCHASE = "purchase",
}

export function coerceCheckoutPane(value: unknown): CheckoutPane {
  if (value === CheckoutPane.PURCHASE || value === "purchase") {
    return CheckoutPane.PURCHASE;
  }
  return CheckoutPane.RETURN;
}

export interface InvoiceSession {
  id: string;
  label: string;
  checkoutVariant: CheckoutVariantEnum;
  purchaseCart: CartLine[];
  returnCart: CartLine[];
  activeCheckoutPane: CheckoutPane;
  selectedLinePurchaseId: string | null;
  selectedLineReturnId: string | null;
  /**
   * Khi tab được mở từ một draft đã lưu (restore), đây là id của draft đó.
   * Lưu/thanh toán lại sẽ ghi đè (PATCH/checkout) chính draft này thay vì tạo mới.
   */
  sourceInvoiceId?: string;
  /**
   * Đơn trả/đổi `regular` (mở từ trang return-goods): id hóa đơn bán gốc. Dùng
   * làm `originalInvoiceId` khi gọi `POST /invoices/returns|exchanges`. Bỏ trống
   * ở đơn trả `quick` (Đổi trả nhanh — không có hóa đơn gốc).
   */
  originalInvoiceId?: string;
  /**
   * Toàn bộ state soạn thảo per-tab ngoài giỏ hàng (khách, thanh toán, KM, nhãn
   * đã chọn, NV bán/bảng giá, filter catalog). Mỗi tab giữ riêng → chuyển tab
   * không mất; persist nên reload cũng giữ.
   */
  draft: CheckoutDraft;
}

/** Áp 1 transform lên draft của session đang active, trả về mảng sessions mới. */
function mapActiveDraft(
  activeSessionId: string,
  sessions: InvoiceSession[],
  fn: (draft: CheckoutDraft) => CheckoutDraft,
): InvoiceSession[] {
  return sessions.map((s) =>
    s.id === activeSessionId ? { ...s, draft: fn(s.draft) } : s,
  );
}

/**
 * Số tab kế tiếp = max số "Hóa đơn N" hiện có + 1 (1 nếu không còn tab nào). Quét
 * theo label để không tái dùng số đã đóng: đóng "Hóa đơn 2" của [1,2,3] rồi tạo
 * mới → "Hóa đơn 4". Tab restore từ draft mang label = số hóa đơn nên không tính
 * vào dãy (đúng — chúng không thuộc chuỗi "Hóa đơn N").
 */
function nextInvoiceLabel(sessions: InvoiceSession[]): string {
  let max = 0;
  for (const s of sessions) {
    const matched = /^Hóa đơn (\d+)$/.exec(s.label);
    if (matched) {
      const n = Number(matched[1]);
      if (n > max) max = n;
    }
  }
  return `Hóa đơn ${max + 1}`;
}

function createSaleSession(id: string, label: string): InvoiceSession {
  return {
    id,
    label,
    checkoutVariant: CheckoutVariantEnum.SALE,
    purchaseCart: [],
    returnCart: [],
    activeCheckoutPane: CheckoutPane.RETURN,
    selectedLinePurchaseId: null,
    selectedLineReturnId: null,
    draft: initialCheckoutDraft(),
  };
}

interface PosCheckoutSessionState {
  version: number;
  /**
   * POS session id cố định cho terminal — dùng làm `session_id` khi tạo/liệt kê
   * draft (`/invoices/drafts`). Tách khỏi id tab (`activeSessionId`) để danh sách
   * HĐ lưu tạm + badge ổn định, không đổi khi chuyển tab / restore.
   */
  posSessionId: string;
  sessions: InvoiceSession[];
  activeSessionId: string;
  cashierDisplayName: string | null;
  draftsDialogOpen: boolean;

  setCashierDisplayName: (name: string | null) => void;
  setDraftsDialogOpen: (open: boolean) => void;
  setActiveSessionId: (id: string) => void;
  setActiveCheckoutPane: (pane: CheckoutPane) => void;
  patchActiveSession: (partial: Partial<InvoiceSession>) => void;

  // --- Per-tab draft (khách / thanh toán / KM / nhãn / meta / catalog) ---
  /** Cập nhật 1 slice của draft active. Wrapper hook spread `prev` với type cụ thể. */
  updateActiveDraftSlice: <K extends keyof CheckoutDraft>(
    slice: K,
    updater: (prev: CheckoutDraft[K]) => CheckoutDraft[K],
  ) => void;
  handleChangePaymentLines: (next: PaymentLine[]) => void;
  handlePickSuggestion: (suggestion: CashSuggestion) => void;
  setFirstLineAmountAuto: (amount: number) => void;
  pickCustomer: (customer: CustomerRow) => void;
  clearCustomer: () => void;

  updatePurchaseCart: (
    sessionId: string,
    updater: (prev: CartLine[]) => CartLine[],
  ) => void;
  updateReturnCart: (
    sessionId: string,
    updater: (prev: CartLine[]) => CartLine[],
  ) => void;
  setSelectedLinePurchaseId: (id: string | null) => void;
  setSelectedLineReturnId: (id: string | null) => void;

  addSession: () => void;
  removeSession: (id: string) => void;

  /** New invoice tab in quick-exchange mode (empty carts). */
  enterQuickExchange: () => void;
  /**
   * New invoice tab with return lines from an existing sale invoice
   * (`invoice_return`). `customer` (nếu có) = khách của hóa đơn gốc → tự điền
   * vào draft (sẽ bị khóa, không cho đổi ở checkout).
   */
  enterInvoiceReturnWithLines: (
    lines: CartLine[],
    originalInvoiceId?: string,
    customer?: CustomerRow | null,
  ) => void;

  /** Hydration helper — ensure at least one sale session exists. */
  ensureHydratedShape: () => void;

  /** After successful payment or draft save — clear lines, back to sale. */
  resetActiveSessionAfterCheckout: () => void;

  /** Open a draft on a new invoice tab; leaves the previously active tab unchanged. */
  openDraftInNewSession: (draft: DraftInvoice) => void;
}

// const initialId = `s-${crypto.randomUUID()}`;
const initialId = `section-1`;

export const usePosCheckoutSessionStore = create<PosCheckoutSessionState>()(
  persist(
    (set, get) => ({
      version: STORE_VERSION,
      posSessionId: crypto.randomUUID(),
      sessions: [createSaleSession(initialId, "Hóa đơn 1")],
      activeSessionId: initialId,
      cashierDisplayName: null,
      draftsDialogOpen: false,

      setCashierDisplayName: (name) => set({ cashierDisplayName: name }),

      setDraftsDialogOpen: (open) => set({ draftsDialogOpen: open }),

      setActiveSessionId: (id) => {
        const { sessions } = get();
        if (!sessions.some((s) => s.id === id)) return;
        set({ activeSessionId: id });
      },

      setActiveCheckoutPane: (pane) => {
        const { activeSessionId, sessions } = get();
        set({
          sessions: sessions.map((s) =>
            s.id === activeSessionId ? { ...s, activeCheckoutPane: pane } : s,
          ),
        });
      },

      patchActiveSession: (partial) => {
        const { activeSessionId, sessions } = get();
        set({
          sessions: sessions.map((s) =>
            s.id === activeSessionId ? { ...s, ...partial } : s,
          ),
        });
      },

      updateActiveDraftSlice: (slice, updater) => {
        const { activeSessionId, sessions } = get();
        set({
          sessions: mapActiveDraft(activeSessionId, sessions, (d) => ({
            ...d,
            [slice]: updater(d[slice]),
          })),
        });
      },

      handleChangePaymentLines: (next) => {
        const { activeSessionId, sessions } = get();
        set({
          sessions: mapActiveDraft(activeSessionId, sessions, (d) => ({
            ...d,
            payment: {
              ...d.payment,
              ...computeChangedPaymentLines(d.payment, next),
            },
          })),
        });
      },

      handlePickSuggestion: (suggestion) => {
        const { activeSessionId, sessions } = get();
        set({
          sessions: mapActiveDraft(activeSessionId, sessions, (d) => ({
            ...d,
            payment: {
              ...d.payment,
              ...computePickSuggestionLines(d.payment, suggestion),
            },
          })),
        });
      },

      setFirstLineAmountAuto: (amount) => {
        const { activeSessionId, sessions } = get();
        set({
          sessions: mapActiveDraft(activeSessionId, sessions, (d) => ({
            ...d,
            payment: { ...d.payment, ...computeFirstLineAuto(d.payment, amount) },
          })),
        });
      },

      pickCustomer: (customer) => {
        const { activeSessionId, sessions } = get();
        set({
          sessions: mapActiveDraft(activeSessionId, sessions, (d) => ({
            ...d,
            customer: {
              selectedCustomer: customer,
              customerQuery: customer.name?.trim() ?? "",
            },
          })),
        });
      },

      clearCustomer: () => {
        const { activeSessionId, sessions } = get();
        set({
          sessions: mapActiveDraft(activeSessionId, sessions, (d) => ({
            ...d,
            customer: { selectedCustomer: null, customerQuery: "" },
          })),
        });
      },

      updatePurchaseCart: (sessionId, updater) => {
        set({
          sessions: get().sessions.map((s) =>
            s.id === sessionId
              ? { ...s, purchaseCart: updater(s.purchaseCart) }
              : s,
          ),
        });
      },

      updateReturnCart: (sessionId, updater) => {
        set({
          sessions: get().sessions.map((s) =>
            s.id === sessionId
              ? { ...s, returnCart: updater(s.returnCart) }
              : s,
          ),
        });
      },

      setSelectedLinePurchaseId: (id) => {
        const { activeSessionId, sessions } = get();
        set({
          sessions: sessions.map((s) =>
            s.id === activeSessionId ? { ...s, selectedLinePurchaseId: id } : s,
          ),
        });
      },

      setSelectedLineReturnId: (id) => {
        const { activeSessionId, sessions } = get();
        set({
          sessions: sessions.map((s) =>
            s.id === activeSessionId ? { ...s, selectedLineReturnId: id } : s,
          ),
        });
      },

      addSession: () => {
        const { sessions } = get();
        const newId = `s-${Date.now()}`;
        const next = createSaleSession(newId, nextInvoiceLabel(sessions));
        set({
          sessions: [...sessions, next],
          activeSessionId: newId,
        });
      },

      removeSession: (id) => {
        const { sessions, activeSessionId } = get();
        const real = sessions.filter((s) => s.id !== id);
        // Đóng tab cuối cùng → tạo lại 1 tab bán hàng "Hóa đơn 1" với id mới, để
        // watcher activeSessionId (use-checkout-bootstrap) fire và reset draft
        // toàn cục — trạng thái return của tab vừa đóng vì thế cũng bị xóa.
        if (real.length === 0) {
          const freshId = `s-${Date.now()}`;
          set({
            sessions: [createSaleSession(freshId, "Hóa đơn 1")],
            activeSessionId: freshId,
          });
          return;
        }
        let nextActive = activeSessionId;
        if (id === activeSessionId) {
          nextActive = real[real.length - 1]!.id;
        }
        set({ sessions: real, activeSessionId: nextActive });
      },

      enterQuickExchange: () => {
        const { sessions } = get();
        const newId = `s-${Date.now()}`;
        const newSession: InvoiceSession = {
          id: newId,
          label: nextInvoiceLabel(sessions),
          checkoutVariant: CheckoutVariantEnum.QUICK_EXCHANGE,
          purchaseCart: [],
          returnCart: [],
          activeCheckoutPane: CheckoutPane.RETURN,
          selectedLinePurchaseId: null,
          selectedLineReturnId: null,
          draft: initialCheckoutDraft(),
        };
        set({
          sessions: [...sessions, newSession],
          activeSessionId: newId,
        });
      },

      enterInvoiceReturnWithLines: (lines, originalInvoiceId, customer) => {
        const { sessions } = get();
        const newId = `s-${Date.now()}`;
        const base = initialCheckoutDraft();
        // Tự điền khách của hóa đơn gốc (nếu có) — checkout sẽ khóa, không cho đổi.
        const draft: CheckoutDraft = customer
          ? {
              ...base,
              customer: {
                selectedCustomer: customer,
                customerQuery: customer.name?.trim() ?? "",
              },
            }
          : base;
        const newSession: InvoiceSession = {
          id: newId,
          label: nextInvoiceLabel(sessions),
          checkoutVariant: CheckoutVariantEnum.INVOICE_RETURN,
          purchaseCart: lines.map((l) => ({ ...l })),
          returnCart: [],
          activeCheckoutPane: CheckoutPane.RETURN,
          selectedLinePurchaseId: null,
          selectedLineReturnId: null,
          originalInvoiceId,
          draft,
        };
        set({
          sessions: [...sessions, newSession],
          activeSessionId: newId,
        });
      },

      ensureHydratedShape: () => {
        const { sessions } = get();
        if (sessions.length === 0) {
          const id = `s-${crypto.randomUUID()}`;
          set({
            sessions: [createSaleSession(id, "Hóa đơn 1")],
            activeSessionId: id,
          });
        } else if (!sessions.some((s) => s.id === get().activeSessionId)) {
          set({ activeSessionId: sessions[0]!.id });
        }
      },

      resetActiveSessionAfterCheckout: () => {
        const id = get().activeSessionId;
        set({
          sessions: get().sessions.map((s, idx) =>
            s.id === id
              ? {
                  ...s,
                  // Tab từng gắn với 1 draft (restore) → trả tên về mặc định.
                  label: s.sourceInvoiceId ? `Hóa đơn ${idx + 1}` : s.label,
                  sourceInvoiceId: undefined,
                  originalInvoiceId: undefined,
                  checkoutVariant: CheckoutVariantEnum.SALE,
                  purchaseCart: [],
                  returnCart: [],
                  activeCheckoutPane: CheckoutPane.RETURN,
                  selectedLinePurchaseId: null,
                  selectedLineReturnId: null,
                  draft: initialCheckoutDraft(),
                }
              : s,
          ),
        });
      },

      openDraftInNewSession: (draft) => {
        const { sessions } = get();
        const newId = `s-${Date.now()}`;
        // Tab restore mang tên = số hóa đơn của draft, và gắn với draft đó.
        const label = draft.invoiceNumber;
        const variant = coerceCheckoutVariant(draft.checkoutVariant);

        // Dựng thẳng draft per-tab từ bản lưu tạm: khách + dòng thanh toán đã lưu.
        // Nếu chỉ còn 1 dòng, số tiền sẽ tự bám theo "Còn phải thu" khi giỏ đổi.
        const base = initialCheckoutDraft();
        const restoredDraft: CheckoutDraft = {
          ...base,
          customer: {
            selectedCustomer: draft.customerId
              ? {
                  id: draft.customerId,
                  name: draft.customerName ?? "",
                  phone: draft.customerPhone ?? null,
                }
              : null,
            customerQuery: draft.customerName?.trim() ?? "",
          },
          payment:
            draft.payments && draft.payments.length > 0
              ? {
                  ...base.payment,
                  paymentLines: draft.payments.map((row) =>
                    createPaymentLine(row.method, row.amount),
                  ),
                }
              : base.payment,
        };

        let newSession: InvoiceSession;

        if (
          variant === CheckoutVariantEnum.QUICK_EXCHANGE &&
          draft.quickExchangePurchase &&
          draft.quickExchangeReturn
        ) {
          newSession = {
            id: newId,
            label,
            checkoutVariant: CheckoutVariantEnum.QUICK_EXCHANGE,
            purchaseCart: draft.quickExchangePurchase.map((l) => ({ ...l })),
            returnCart: draft.quickExchangeReturn.map((l) => ({ ...l })),
            activeCheckoutPane: CheckoutPane.RETURN,
            selectedLinePurchaseId: null,
            selectedLineReturnId: null,
            sourceInvoiceId: draft.id,
            draft: restoredDraft,
          };
        } else {
          newSession = {
            id: newId,
            label,
            checkoutVariant:
              variant === CheckoutVariantEnum.INVOICE_RETURN
                ? CheckoutVariantEnum.INVOICE_RETURN
                : CheckoutVariantEnum.SALE,
            purchaseCart: draft.lines.map((l) => ({ ...l })),
            returnCart: [],
            activeCheckoutPane: CheckoutPane.RETURN,
            selectedLinePurchaseId: null,
            selectedLineReturnId: null,
            sourceInvoiceId: draft.id,
            draft: restoredDraft,
          };
        }

        set({
          sessions: [...sessions, newSession],
          activeSessionId: newId,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: STORE_VERSION,
      partialize: (s) => ({
        version: s.version,
        posSessionId: s.posSessionId,
        sessions: s.sessions,
        activeSessionId: s.activeSessionId,
        cashierDisplayName: s.cashierDisplayName,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<PosCheckoutSessionState> | undefined;
        if (!p || typeof p !== "object")
          return current as PosCheckoutSessionState;
        const sessionsRaw = p.sessions ?? [];
        const sessions: InvoiceSession[] =
          sessionsRaw.length > 0
            ? sessionsRaw.map((sess) => {
                const raw = sess as InvoiceSession & {
                  activeExchangePane?: unknown;
                };
                return {
                  id: raw.id,
                  label: raw.label,
                  checkoutVariant: coerceCheckoutVariant(raw.checkoutVariant),
                  purchaseCart: (raw.purchaseCart ?? []).map((l: CartLine) => ({
                    ...l,
                  })),
                  returnCart: (raw.returnCart ?? []).map((l: CartLine) => ({
                    ...l,
                  })),
                  activeCheckoutPane: coerceCheckoutPane(
                    raw.activeCheckoutPane ?? raw.activeExchangePane,
                  ),
                  selectedLinePurchaseId: raw.selectedLinePurchaseId ?? null,
                  selectedLineReturnId: raw.selectedLineReturnId ?? null,
                  sourceInvoiceId: raw.sourceInvoiceId,
                  originalInvoiceId: raw.originalInvoiceId,
                  // v1 → v2: session cũ chưa có `draft` → backfill mặc định.
                  draft: ensureDraftShape(raw.draft),
                };
              })
            : current.sessions;
        const activeOk =
          p.activeSessionId && sessions.some((s) => s.id === p.activeSessionId);
        return {
          ...(current as PosCheckoutSessionState),
          version: STORE_VERSION,
          posSessionId: p.posSessionId ?? current.posSessionId,
          sessions,
          activeSessionId: activeOk ? p.activeSessionId! : sessions[0]!.id,
          cashierDisplayName:
            p.cashierDisplayName !== undefined
              ? p.cashierDisplayName
              : current.cashierDisplayName,
        };
      },
    },
  ),
);

export function selectActiveSession(
  state: PosCheckoutSessionState,
): InvoiceSession | undefined {
  return state.sessions.find((s) => s.id === state.activeSessionId);
}

export function selectCheckoutVariant(
  state: PosCheckoutSessionState,
): CheckoutVariantEnum {
  return selectActiveSession(state)?.checkoutVariant ?? CheckoutVariantEnum.SALE;
}

export function selectActiveCheckoutPane(
  state: PosCheckoutSessionState,
): CheckoutPane {
  return selectActiveSession(state)?.activeCheckoutPane ?? CheckoutPane.RETURN;
}

const EMPTY_CART: CartLine[] = [];

export function selectPurchaseCart(state: PosCheckoutSessionState): CartLine[] {
  return selectActiveSession(state)?.purchaseCart ?? EMPTY_CART;
}

export function selectReturnCart(state: PosCheckoutSessionState): CartLine[] {
  return selectActiveSession(state)?.returnCart ?? EMPTY_CART;
}

export function selectHasAnyCartLines(state: PosCheckoutSessionState): boolean {
  const session = selectActiveSession(state);
  if (!session) return false;
  if (session.checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE) {
    return session.purchaseCart.length + session.returnCart.length > 0;
  }
  return session.purchaseCart.length > 0;
}

export function selectIsReturnExchangeInvoice(
  state: PosCheckoutSessionState,
): boolean {
  const variant = selectCheckoutVariant(state);
  return (
    variant === CheckoutVariantEnum.QUICK_EXCHANGE ||
    variant === CheckoutVariantEnum.INVOICE_RETURN
  );
}

export function selectInvoiceTableCheckoutPane(
  state: PosCheckoutSessionState,
): CheckoutPane {
  const session = selectActiveSession(state);
  if (
    session?.checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE &&
    session.activeCheckoutPane === CheckoutPane.RETURN
  ) {
    return CheckoutPane.RETURN;
  }
  return CheckoutPane.PURCHASE;
}

export function selectItemCountForPayment(
  state: PosCheckoutSessionState,
): number {
  const session = selectActiveSession(state);
  if (!session) return 0;
  if (session.checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE) {
    return session.purchaseCart.length + session.returnCart.length;
  }
  return session.purchaseCart.length;
}

export function selectGrandTotal(state: PosCheckoutSessionState): number {
  const session = selectActiveSession(state);
  if (!session) return 0;
  return netSessionGrandTotal(
    session.checkoutVariant,
    session.purchaseCart,
    session.returnCart,
  );
}

/**
 * Selectors below return new arrays/objects on every call. Use inside `useMemo`
 * or call via `useStore.getState()` inside event handlers — không subscribe trực tiếp
 * (subscribe sẽ trigger re-render mỗi lần state đổi vì reference identity khác).
 */

export function computeReceiptLines(
  state: PosCheckoutSessionState,
): CartLine[] {
  const session = selectActiveSession(state);
  if (!session) return [];
  if (session.checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE) {
    return [...session.returnCart, ...session.purchaseCart];
  }
  return session.purchaseCart;
}

export function computeVoucherLineSource(
  state: PosCheckoutSessionState,
): CartLine[] {
  const session = selectActiveSession(state);
  if (!session) return [];
  if (session.checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE) {
    return [...session.purchaseCart, ...session.returnCart];
  }
  return session.purchaseCart;
}

export function computeLinesForDraftSingle(
  state: PosCheckoutSessionState,
): CartLine[] {
  const session = selectActiveSession(state);
  if (!session) return [];
  if (session.checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE) {
    return [...session.returnCart, ...session.purchaseCart];
  }
  return session.purchaseCart;
}

export interface QuickExchangeBadgesValue {
  returnQuantity: number;
  purchaseQuantity: number;
}

export function computeQuickExchangeBadges(
  state: PosCheckoutSessionState,
): QuickExchangeBadgesValue | null {
  const session = selectActiveSession(state);
  if (!session) return null;
  if (session.checkoutVariant === CheckoutVariantEnum.QUICK_EXCHANGE) {
    return {
      returnQuantity: session.returnCart.reduce((s, l) => s + l.qty, 0),
      purchaseQuantity: session.purchaseCart.reduce((s, l) => s + l.qty, 0),
    };
  }
  if (session.checkoutVariant === CheckoutVariantEnum.INVOICE_RETURN) {
    return {
      returnQuantity: session.purchaseCart
        .filter((l) => l.isReturnCredit)
        .reduce((s, l) => s + l.qty, 0),
      purchaseQuantity: session.purchaseCart
        .filter((l) => !l.isReturnCredit)
        .reduce((s, l) => s + l.qty, 0),
    };
  }
  return null;
}

export function computeOversellLines(
  state: PosCheckoutSessionState,
): CartLine[] {
  return getOversellSaleLines(selectPurchaseCart(state));
}

// ---------------------------------------------------------------------------
// Per-tab draft selectors. Trả về object slice đã lưu (reference ổn định theo
// session) → an toàn để subscribe trực tiếp. KHÔNG dựng object/array mới ở đây
// (xem chú thích "Selectors below return new arrays..." phía trên).
// ---------------------------------------------------------------------------

/** Draft của session không tồn tại (hiếm) — fallback ổn định, chỉ để đọc. */
const FALLBACK_DRAFT: CheckoutDraft = initialCheckoutDraft();

export function selectActiveDraft(
  state: PosCheckoutSessionState,
): CheckoutDraft {
  return selectActiveSession(state)?.draft ?? FALLBACK_DRAFT;
}

export function selectCustomerDraft(
  state: PosCheckoutSessionState,
): CheckoutCustomerDraft {
  return selectActiveDraft(state).customer;
}

export function selectPaymentDraft(
  state: PosCheckoutSessionState,
): CheckoutPaymentDraft {
  return selectActiveDraft(state).payment;
}

export function selectPromotionDraft(
  state: PosCheckoutSessionState,
): CheckoutPromotionDraft {
  return selectActiveDraft(state).promotion;
}

export function selectLabelsDraft(
  state: PosCheckoutSessionState,
): CheckoutLabelsDraft {
  return selectActiveDraft(state).labels;
}

export function selectMetaDraft(
  state: PosCheckoutSessionState,
): CheckoutMetaDraft {
  return selectActiveDraft(state).meta;
}

export function selectCatalogDraft(
  state: PosCheckoutSessionState,
): CheckoutCatalogDraft {
  return selectActiveDraft(state).catalog;
}

/**
 * Số điểm khách dùng — chỉ có hiệu lực ở luồng SALE. RETURN/EXCHANGE force 0
 * (BE không cho redeem trên non-SALE; cũng đúng nghiệp vụ).
 */
export function selectEffectivePointsRedeemed(
  state: PosCheckoutSessionState,
): number {
  const session = selectActiveSession(state);
  if (!session) return 0;
  if (session.checkoutVariant !== CheckoutVariantEnum.SALE) return 0;
  return selectActiveDraft(state).promotion.pointsRedeemed ?? 0;
}

/** Tiền giảm từ điểm (VND) = `pointsRedeemed × 1.000`, chỉ ở SALE. */
export function selectPointsDiscountAmount(
  state: PosCheckoutSessionState,
): number {
  return selectEffectivePointsRedeemed(state) * POINT_REDEMPTION_VALUE_VND;
}

export function selectSelectedLabelIds(
  state: PosCheckoutSessionState,
): string[] {
  return selectActiveDraft(state).labels.selectedLabelIds;
}
