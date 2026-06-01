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
  /**
   * Net total dòng (đã trừ KM, đã xử lý dấu âm cho hàng trả). Renderer ưu tiên
   * dùng giá trị này; bỏ trống → fallback `qty * unitPrice`.
   */
  lineTotal?: number;
  /** Nhãn KM in dưới tên hàng, vd "KM 10 % (10.000) - Khách quen". */
  discountLabel?: string;
  /** Ghi chú dòng in dưới tên hàng. */
  note?: string;
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
   * Net change line on the receipt (positive = return to customer, negative = still owed to shop).
   * Zero when exact, or when keepChange / debt options clear the residual per checkout rules.
   */
  change: number;
  /**
   * Optional line: excess tender not returned / refund remainder waived by cashier toggle.
   */
  keptChange?: number;
  /**
   * Optional line: small shortage forgiven on sale (keepChange, no debt).
   */
  forgivenShortage?: number;
  /** Optional line: excess tender applied to reduce customer balance (sale + debt). */
  debtReduction?: number;
  /** Optional line: unpaid balance booked to customer debt (sale + debt). */
  customerDebtIssued?: number;
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
