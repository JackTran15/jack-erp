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
