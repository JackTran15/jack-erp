import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type CartLine,
  CheckoutVariantEnum,
  coerceCheckoutVariant,
  type DraftInvoice,
  type DraftInvoicePayment,
} from "@erp/pos/lib/checkout/checkout.types";

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

function reviveDraft(d: DraftInvoice): DraftInvoice {
  return {
    ...d,
    createdAt:
      d.createdAt instanceof Date
        ? d.createdAt
        : new Date(d.createdAt as unknown as string),
    lines: d.lines.map((l) => ({ ...l })),
    quickExchangePurchase: d.quickExchangePurchase?.map((l) => ({ ...l })),
    quickExchangeReturn: d.quickExchangeReturn?.map((l) => ({ ...l })),
    checkoutVariant:
      d.checkoutVariant !== undefined
        ? coerceCheckoutVariant(d.checkoutVariant)
        : undefined,
  };
}

interface PosCheckoutSessionState {
  version: number;
  sessions: InvoiceSession[];
  activeSessionId: string;
  draftInvoices: DraftInvoice[];
  draftSeq: number;
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

  addDraft: (draft: DraftInvoice) => void;
  removeDraft: (id: string) => void;
  nextDraftSeq: () => number;

  /** Hydration helper — ensure at least one sale session exists. */
  ensureHydratedShape: () => void;

  /** After successful payment or draft save — clear lines, back to sale. */
  resetActiveSessionAfterCheckout: () => void;

  /** Open a draft on a new invoice tab; leaves the previously active tab unchanged. */
  openDraftInNewSession: (draft: DraftInvoice) => void;
}

const initialId = `s-${crypto.randomUUID()}`;

export const usePosCheckoutSessionStore = create<PosCheckoutSessionState>()(
  persist(
    (set, get) => ({
      version: STORE_VERSION,
      sessions: [createSaleSession(initialId, "Hóa đơn 1")],
      activeSessionId: initialId,
      draftInvoices: [],
      draftSeq: 1,
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

      addDraft: (draft) =>
        set((s) => ({
          draftInvoices: [draft, ...s.draftInvoices],
        })),

      removeDraft: (id) =>
        set((s) => ({
          draftInvoices: s.draftInvoices.filter((d) => d.id !== id),
        })),

      nextDraftSeq: () => {
        const n = get().draftSeq;
        set({ draftSeq: n + 1 });
        return n;
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
          draftInvoices: get().draftInvoices.filter((d) => d.id !== draft.id),
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
        draftInvoices: s.draftInvoices,
        draftSeq: s.draftSeq,
        cashierDisplayName: s.cashierDisplayName,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<PosCheckoutSessionState> | undefined;
        if (!p || typeof p !== "object")
          return current as PosCheckoutSessionState;
        const drafts = (p.draftInvoices ?? []).map((d) =>
          reviveDraft(d as DraftInvoice),
        );
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
          draftInvoices: drafts,
          draftSeq: typeof p.draftSeq === "number" ? p.draftSeq : 1,
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
