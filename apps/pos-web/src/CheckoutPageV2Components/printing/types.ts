/**
 * Domain types for the invoice / receipt printing pipeline.
 * Shape is decoupled from any specific printer implementation so the same
 * payload can be served to BrowserWindow, thermal, PDF, or 3rd-party
 * printer services interchangeably.
 */

export interface InvoiceStoreInfo {
  /** Display name, e.g. "Giày MT Cần Thơ". */
  name: string;
  /** Address (without "Địa:" prefix — the renderer adds it). */
  address: string;
  /** Phone (without "Sdt:" prefix — the renderer adds it). */
  phone: string;
}

export interface InvoiceLineData {
  /** 1-based row index as it appears on the receipt. */
  index: number;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface InvoiceTotals {
  totalQty: number;
  /** Sub-total before any rounding / promotion. */
  subtotal: number;
  /** Final amount the customer is asked to pay. */
  grandTotal: number;
  /** Amount tendered (e.g. cash given). */
  paid: number;
  /** Change to return; should be max(0, paid - grandTotal). */
  change: number;
}

export interface InvoicePolicy {
  title: string;
  body: string;
}

export interface InvoicePayload {
  store: InvoiceStoreInfo;
  /** Receipt number, e.g. "2605010007". */
  invoiceNumber: string;
  /** When the receipt was issued. Renderer formats to vi-VN DD/MM/YYYY HH:mm. */
  issuedAt: Date;
  lines: InvoiceLineData[];
  totals: InvoiceTotals;
  /** Human-readable label of the payment method, e.g. "Tiền mặt". */
  paymentMethodLabel: string;
  /** Discount note text after totals (empty = "HĐ đã được KM:" with no value). */
  discountNote?: string;
  policy: InvoicePolicy;
  /** Last centered line, e.g. "Giày MT hân hạnh phục vụ quý khách!". */
  closingMessage: string;
}
