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
  /**
   * "Trả lại khách" on the receipt — the *signed* delta:
   *   • positive → change to hand back to the customer
   *   • negative → customer still owes the shop (printed if the cashier
   *     prints with an unresolved shortage)
   *   • zero     → exact payment, or the cashier opted to forgive the
   *     residual via "Khách không lấy tiền thừa" / "Bớt tiền lẻ cho khách"
   */
  change: number;
  /**
   * "Khách không lấy tiền thừa" — set when the cashier forgave a positive
   * overpayment. Carries the raw kept amount so the receipt can echo it
   * alongside the zeroed `change` line.
   */
  keptChange?: number;
  /**
   * "Bớt tiền lẻ cho khách" — set when the cashier forgave a shortage.
   * Carries the raw written-off amount so the receipt can echo it
   * alongside the zeroed `change` line.
   */
  forgivenShortage?: number;
}

export interface InvoicePolicy {
  title: string;
  body: string;
}

/**
 * One payment line on the receipt — mirrors a row from `PaymentMethodList`.
 * The renderer prints one summary row per entry (label on the left, amount
 * on the right). Always non-empty by construction; when the user hasn't
 * entered any amount, the page synthesises a single fallback entry of the
 * primary method covering the grand total.
 */
export interface InvoicePaymentEntry {
  /** Human label shown on the receipt, e.g. "Tiền mặt". */
  label: string;
  amount: number;
}

export interface InvoicePayload {
  store: InvoiceStoreInfo;
  /** Receipt number, e.g. "2605010007". */
  invoiceNumber: string;
  /** When the receipt was issued. Renderer formats to vi-VN DD/MM/YYYY HH:mm. */
  issuedAt: Date;
  lines: InvoiceLineData[];
  totals: InvoiceTotals;
  /** Per-method payment breakdown — one row per entry on the receipt. */
  payments: InvoicePaymentEntry[];
  /** Discount note text after totals (empty = "HĐ đã được KM:" with no value). */
  discountNote?: string;
  policy: InvoicePolicy;
  /** Last centered line, e.g. "Giày MT hân hạnh phục vụ quý khách!". */
  closingMessage: string;
}
