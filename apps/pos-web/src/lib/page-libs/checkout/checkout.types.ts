/**
 * Shared types for CheckoutPageV2.
 * Kept framework-agnostic so the components can be reused outside the page.
 *
 * `CartLine` and `PaymentMethod` mirror the shapes used by the legacy
 * CheckoutPage — keeping the shapes identical means handlers/validators
 * port over without translation. Only field renames or additions are made
 * when the V2 UI genuinely needs them.
 */

import type { PaymentMethod } from "@erp/pos/constants/checkout.constant";

export {
  PaymentMethodEnum,
  type PaymentMethod,
} from "@erp/pos/constants/checkout.constant";

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

/** Checkout mode per open invoice tab (Zustand session). String values for JSON persist. */
export enum CheckoutVariantEnum {
  SALE = "sale",
  QUICK_EXCHANGE = "quick_exchange",
  INVOICE_RETURN = "invoice_return",
}

/** Normalize persisted / loose string into {@link CheckoutVariantEnum}. */
export function coerceCheckoutVariant(raw: unknown): CheckoutVariantEnum {
  if (raw === CheckoutVariantEnum.QUICK_EXCHANGE || raw === "quick_exchange") {
    return CheckoutVariantEnum.QUICK_EXCHANGE;
  }
  if (raw === CheckoutVariantEnum.INVOICE_RETURN || raw === "invoice_return") {
    return CheckoutVariantEnum.INVOICE_RETURN;
  }
  return CheckoutVariantEnum.SALE;
}

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
  /**
   * When true (invoice_return): qty is a positive count of units returned;
   * monetary effect is negative (refund credit). UI shows negative qty / pink row.
   */
  isReturnCredit?: boolean;
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
 * One payment entry inside a saved draft. Denormalized by design — we capture
 * the human label at save time so a draft keeps its display string even if
 * the live `PAYMENT_METHODS` table is later renamed.
 */
export interface DraftInvoicePayment {
  method: PaymentMethod;
  /** Human label, e.g. "Tiền mặt". */
  label: string;
  amount: number;
}

/**
 * Snapshot of a cart saved as a draft invoice. Listed in the draft picker
 * and opened on a **new** invoice tab when the user confirms.
 * Self-contained: `lines` and `payments` are deep-cloned at save time so
 * later edits to the live cart do not mutate the draft.
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
  /**
   * Snapshot of the multi-line payment state (`PaymentMethodList`) at save
   * time. Optional so older snapshots without payment data still load.
   */
  payments?: DraftInvoicePayment[];
  /** When set, restore splits carts for quick_exchange. */
  checkoutVariant?: CheckoutVariantEnum;
  quickExchangePurchase?: CartLine[];
  quickExchangeReturn?: CartLine[];
}
