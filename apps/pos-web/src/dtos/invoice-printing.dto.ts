import type {
  InvoiceLineData,
  InvoicePaymentEntry,
  InvoicePolicy,
  InvoiceStoreInfo,
  InvoiceTotals,
} from "@erp/pos/interfaces/invoice-printing.interface";

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
