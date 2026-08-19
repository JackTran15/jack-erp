/**
 * One line item on an invoice, for the detail dialog.
 *
 * Quantity and money are SIGNED by movement direction: the leg the customer
 * hands back (a RETURN, or the returned half of an EXCHANGE) is negative, so a
 * two-legged exchange shows at a glance which item went which way. `unitPrice`
 * is the exception — it is a rate, and stays positive.
 */
export interface InvoiceDetailLine {
  sku: string;
  name: string;
  unit: string;
  /** Negative on an inbound (returned) line. */
  quantity: number;
  /** Always positive — a per-unit rate, not an amount. */
  unitPrice: number;
  /** quantity × unitPrice, before line discount. Negative on a returned line. */
  lineAmount: number;
  /** Per-line discount amount. Negative on a returned line. */
  discount: number;
  /** Final line amount (lineAmount − discount). Negative on a returned line. */
  lineTotal: number;
  note: string | null;
}

/** One payment tendered against the invoice. `method` is the raw InvoicePaymentMethod value. */
export interface InvoiceDetailPayment {
  method: string;
  /** Negative on a RETURN — money refunded out of the drawer. */
  amount: number;
}

/** Full invoice detail powering the "Chi tiết hóa đơn" dialog (looked up by invoice code). */
export interface InvoiceDetailView {
  code: string;
  /** ISO timestamp; null while in draft. */
  issuedAt: string | null;
  status: string;
  type: string;
  cashier: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerGroup: string | null;
  /** Placeholder until marketplace channels exist (e.g. "Tại cửa hàng"). */
  salesChannel: string | null;
  lines: InvoiceDetailLine[];
  /**
   * Σ line totals before invoice-level discounts ("Tiền hàng"), signed: negative
   * for a RETURN, and the net (new − returned) for an EXCHANGE.
   */
  subtotal: number;
  /** Final amount the customer owes ("Tổng thanh toán"); negative on a RETURN. */
  totalAmount: number;
  /** Total collected across all payment lines ("Khách trả"); negative on a RETURN. */
  totalPaid: number;
  /** Outstanding debt = totalAmount − totalPaid ("Công nợ"). */
  debt: number;
  payments: InvoiceDetailPayment[];
}
