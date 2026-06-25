/** One line item on an invoice, for the detail dialog. */
export interface InvoiceDetailLine {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  /** quantity × unitPrice, before line discount. */
  lineAmount: number;
  /** Per-line discount amount. */
  discount: number;
  /** Final line amount (lineAmount − discount). */
  lineTotal: number;
  note: string | null;
}

/** One payment tendered against the invoice. `method` is the raw InvoicePaymentMethod value. */
export interface InvoiceDetailPayment {
  method: string;
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
  /** Σ line totals before invoice-level discounts ("Tiền hàng"). */
  subtotal: number;
  /** Final amount the customer owes ("Tổng thanh toán"). */
  totalAmount: number;
  /** Total collected across all payment lines ("Khách trả"). */
  totalPaid: number;
  /** Outstanding debt = totalAmount − totalPaid ("Công nợ"). */
  debt: number;
  payments: InvoiceDetailPayment[];
}
