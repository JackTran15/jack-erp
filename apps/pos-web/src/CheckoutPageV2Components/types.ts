/**
 * Shared types for CheckoutPageV2.
 * Kept framework-agnostic so the components can be reused outside the page.
 */

export interface InvoiceTabItem {
  id: string;
  label: string;
  isDraft?: boolean;
}

export interface InvoiceLineItem {
  id: string;
  sku: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  hasWarning?: boolean;
}

export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
}

export interface PaymentMethodOption {
  value: string;
  label: string;
}

export interface CustomerInfo {
  id: string;
  name: string;
  phone?: string;
}

export interface CashSuggestion {
  id: string;
  amount: number;
}
