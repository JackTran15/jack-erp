/**
 * Shared types for CheckoutPageV2.
 * Kept framework-agnostic so the components can be reused outside the page.
 *
 * `CartLine` and `PaymentMethod` mirror the shapes used by the legacy
 * CheckoutPage — keeping the shapes identical means handlers/validators
 * port over without translation. Only field renames or additions are made
 * when the V2 UI genuinely needs them.
 */

export interface InvoiceTabItem {
  id: string;
  label: string;
  isDraft?: boolean;
  /**
   * Optional count badge rendered at the top-right of the tab. Hidden when
   * undefined or `<= 0`. Used by the "HĐ lưu tạm" tab to surface the number
   * of saved drafts; reusable for any future per-tab counters.
   */
  badgeCount?: number;
}

export type PaymentMethod = "CASH" | "CARD" | "TRANSFER";

/** Single line in the active invoice cart. Identical to legacy CheckoutPage. */
export interface CartLine {
  lineId: string;
  itemId: string;
  name: string;
  code: string;
  unit: string;
  unitPrice: number;
  qty: number;
  locationId: string;
  maxQty: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
}

export interface PaymentMethodOption {
  value: PaymentMethod;
  label: string;
}

export interface CashSuggestion {
  id: string;
  amount: number;
}

/**
 * A snapshot of an invoice saved via "Lưu tạm" (Draft Invoice). Shows up in
 * the "HĐ lưu tạm" picker dialog and can be restored back into the active
 * cart. Kept self-contained — `lines` is a deep-cloned copy of the `CartLine`s
 * at save time, so subsequent edits to the live cart don't mutate the draft.
 */
export interface DraftInvoice {
  id: string;
  /** Display number — e.g. "2605010010". */
  invoiceNumber: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  /** When the draft was created. */
  createdAt: Date;
  /** Snapshot of cart lines at save time. */
  lines: CartLine[];
  /** Pre-computed total (= sum of qty × unitPrice). */
  total: number;
}
