import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CartLine,
  DraftInvoice,
  DraftInvoicePayment,
} from "@erp/pos/interfaces/checkout.interface";
import { CheckoutVariantEnum } from "@erp/pos/types/checkout.type";
import { coerceCheckoutVariant } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { netSessionGrandTotal } from "@erp/pos/lib/page-libs/checkout/checkoutSessionTotals";
import { getOversellSaleLines } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";

const STORAGE_KEY = "pos-checkout-sessions";
const STORE_VERSION = 1;

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
  };
}

interface PosCheckoutSessionState {
  version: number;
  sessions: InvoiceSession[];
  activeSessionId: string;
  cashierDisplayName: string | null;
  draftsDialogOpen: boolean;
  pendingDraftPaymentLines: DraftInvoicePayment[] | null;

  setCashierDisplayName: (name: string | null) => void;
  setDraftsDialogOpen: (open: boolean) => void;
  setPendingDraftPaymentLines: (value: DraftInvoicePayment[] | null) => void;
  setActiveSessionId: (id: string) => void;
  setActiveCheckoutPane: (pane: CheckoutPane) => void;
  patchActiveSession: (partial: Partial<InvoiceSession>) => void;

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
  /** New invoice tab with return lines from an existing sale invoice (`invoice_return`). */
  enterInvoiceReturnWithLines: (lines: CartLine[]) => void;

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
      sessions: [createSaleSession(initialId, "Hóa đơn 1")],
      activeSessionId: initialId,
      cashierDisplayName: null,
      draftsDialogOpen: false,
      pendingDraftPaymentLines: null,

      setCashierDisplayName: (name) => set({ cashierDisplayName: name }),

      setDraftsDialogOpen: (open) => set({ draftsDialogOpen: open }),

      setPendingDraftPaymentLines: (value) =>
        set({ pendingDraftPaymentLines: value }),

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
        const idx = sessions.length + 1;
        const next = createSaleSession(newId, `Hóa đơn ${idx}`);
        set({
          sessions: [...sessions, next],
          activeSessionId: newId,
        });
      },

      removeSession: (id) => {
        const { sessions, activeSessionId } = get();
        const real = sessions.filter((s) => s.id !== id);
        if (real.length === 0) return;
        let nextActive = activeSessionId;
        if (id === activeSessionId) {
          nextActive = real[real.length - 1]!.id;
        }
        set({ sessions: real, activeSessionId: nextActive });
      },

      enterQuickExchange: () => {
        const { sessions } = get();
        const newId = `s-${Date.now()}`;
        const nextIdx = sessions.length + 1;
        const newSession: InvoiceSession = {
          id: newId,
          label: `Hóa đơn ${nextIdx}`,
          checkoutVariant: CheckoutVariantEnum.QUICK_EXCHANGE,
          purchaseCart: [],
          returnCart: [],
          activeCheckoutPane: CheckoutPane.RETURN,
          selectedLinePurchaseId: null,
          selectedLineReturnId: null,
        };
        set({
          sessions: [...sessions, newSession],
          activeSessionId: newId,
        });
      },

      enterInvoiceReturnWithLines: (lines) => {
        const { sessions } = get();
        const newId = `s-${Date.now()}`;
        const nextIdx = sessions.length + 1;
        const newSession: InvoiceSession = {
          id: newId,
          label: `Hóa đơn ${nextIdx}`,
          checkoutVariant: CheckoutVariantEnum.INVOICE_RETURN,
          purchaseCart: lines.map((l) => ({ ...l })),
          returnCart: [],
          activeCheckoutPane: CheckoutPane.RETURN,
          selectedLinePurchaseId: null,
          selectedLineReturnId: null,
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
          sessions: get().sessions.map((s) =>
            s.id === id
              ? {
                  ...s,
                  checkoutVariant: CheckoutVariantEnum.SALE,
                  purchaseCart: [],
                  returnCart: [],
                  activeCheckoutPane: CheckoutPane.RETURN,
                  selectedLinePurchaseId: null,
                  selectedLineReturnId: null,
                }
              : s,
          ),
        });
      },

      openDraftInNewSession: (draft) => {
        const { sessions } = get();
        const newId = `s-${Date.now()}`;
        const nextIdx = sessions.length + 1;
        const label = `Hóa đơn ${nextIdx}`;
        const variant = coerceCheckoutVariant(draft.checkoutVariant);

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
          };
        }

        set({
          sessions: [...sessions, newSession],
          activeSessionId: newId,
          pendingDraftPaymentLines: draft.payments ?? null,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: STORE_VERSION,
      partialize: (s) => ({
        version: s.version,
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
                };
              })
            : current.sessions;
        const activeOk =
          p.activeSessionId && sessions.some((s) => s.id === p.activeSessionId);
        return {
          ...(current as PosCheckoutSessionState),
          version: typeof p.version === "number" ? p.version : STORE_VERSION,
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
