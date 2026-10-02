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
  /**
   * Per-line discount amount, always positive — it is a magnitude. It moves the
   * line towards zero: subtract it from a sale, add it back on a returned line
   * (which is negative to begin with).
   */
  discount: number;
  /** Final line amount (lineAmount − discount). Negative on a returned line. */
  lineTotal: number;
  note: string | null;
}

/**
 * One tender against the invoice. `method` is the raw InvoicePaymentMethod value
 * (`cash`, `bank_transfer`, `card`), or on a refund `store_credit` / `offset`
 * (set against the customer's debt).
 */
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
   * Σ of the lines' `lineTotal` ("Tiền hàng"), before invoice-level discounts,
   * signed: negative for a RETURN, and the net (new − returned) for an EXCHANGE.
   */
  subtotal: number;
  /**
   * Discount on the whole bill ("Khuyến mại"): bill-level programmes
   * (INVOICE_DISCOUNT, TIERED_DISCOUNT), voucher, a manual header discount. An
   * item-level programme's discount is in that line's "Tiền KM" instead.
   * Negative on a RETURN.
   */
  discountAmount: number;
  /** Delivery fee ("Phí giao hàng"). Negative on a RETURN. */
  shippingFee: number;
  /**
   * The bill ("Tổng thanh toán") = subtotal − discountAmount + shippingFee, i.e.
   * BEFORE points and deposit, which settle it like tenders. On a refund it is
   * minus the amount handed back.
   */
  totalAmount: number;
  /**
   * What settled the bill ("Khách trả"): payments + debtCollected + pointsAmount
   * + depositAmount. On a refund it is minus the amount handed back.
   */
  totalPaid: number;
  /** Loyalty points redeemed against the bill ("Điểm thanh toán"). Negative on a RETURN. */
  pointsAmount: number;
  /** Deposit taken before checkout ("Đặt cọc"). Negative on a RETURN. */
  depositAmount: number;
  /** Collected after checkout against the invoice's debt ("Thu nợ"); part of totalPaid. */
  debtCollected: number;
  /** Outstanding debt = totalAmount − totalPaid ("Công nợ"). */
  debt: number;
  payments: InvoiceDetailPayment[];
}
