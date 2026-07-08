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

/**
 * Khối info rows dưới tiêu đề hóa đơn (KH / SĐT / NV Thu ngân / NVBH / Ghi
 * chú…). Mọi field optional — renderer ẩn dòng khi thiếu giá trị, nên các
 * trường chưa có nguồn dữ liệu (slot) cứ để undefined cho tới khi BE nối.
 */
export interface InvoiceInfoData {
  /** "Trả hàng cho hóa đơn: <số HĐ gốc>" — slot, hiện chỉ có UUID nội bộ. */
  returnForInvoiceRef?: string;
  /** "KH:" — tên khách hàng đã chọn. */
  customerName?: string;
  /** "SĐT:" — số điện thoại khách. */
  customerPhone?: string;
  /** "NV Thu ngân:" — user đang đăng nhập. */
  cashierName?: string;
  /** "NVBH:" — nhân viên bán hàng đã chọn. */
  salespersonName?: string;
  /** "Ngày giao hàng:" — slot, chưa có nguồn dữ liệu. */
  deliveryDate?: string;
  /** "Đ/c:" (địa chỉ giao hàng) — slot, chưa có nguồn dữ liệu. */
  deliveryAddress?: string;
  /** "Ghi chú:" — ghi chú hóa đơn từ payment draft. */
  note?: string;
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
  /** "Tiền hàng" — gross line total before any promotion / discount. */
  subtotal: number;
  /**
   * Optional "Khuyến mãi" block: total per-line discount (KM theo mặt hàng).
   * Omitted/undefined when there is no discount → renderer hides the block.
   */
  itemDiscountTotal?: number;
  /** "Tổng thanh toán" — net amount the customer is asked to pay. */
  grandTotal: number;
  /**
   * Optional "Đặt cọc" line: deposit collected upfront, subtracted from the
   * amount due. Omitted/undefined or ≤ 0 → renderer hides the line.
   */
  depositAmount?: number;
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

  // ── Khối trả hàng (return / exchange) ────────────────────────────────────
  /** "Tiền hàng trả lại" — gross hàng trả trước KM (độ lớn dương). */
  returnGross?: number;
  /** "KM:" trong khối trả — tổng KM dòng của hàng trả. */
  returnDiscount?: number;
  /** "Giá trị trả lại" = returnGross − returnDiscount. Khối trả ẩn khi thiếu. */
  returnNet?: number;
  /** "Phí đổi trả" — từ payment draft. */
  returnFee?: number;

  // ── Khuyến mãi hóa đơn / voucher (slot — BE chưa trả amount) ─────────────
  /** "KM theo hóa đơn" — slot, `appliedPromotion` chưa có amount. */
  invoiceDiscountTotal?: number;
  /** "Mã ưu đãi (<code>)" / dòng "Voucher" — slot, voucher chưa có amount. */
  voucherDiscount?: number;

  // ── Điểm tích lũy ────────────────────────────────────────────────────────
  /** Số điểm khách dùng — n trong "Điểm (n)". */
  pointsRedeemed?: number;
  /** Tiền giảm từ điểm (VND) — value của dòng "Điểm (n)". */
  pointsDiscountAmount?: number;

  // ── Slot chưa có nguồn dữ liệu (ẩn cho tới khi BE nối) ───────────────────
  /** "Phí giao hàng". */
  deliveryFee?: number;
  /** "Thuế GTGT". */
  vatAmount?: number;
  /**
   * "Đối trả" — phần giá trị trả cấn vào đơn mua. Lưu ý: bật dòng này đòi hỏi
   * đổi "Tổng thanh toán" sang purchase-only vì grandTotal hiện đã net trừ trả.
   */
  exchangeOffset?: number;
  /** "Thu hộ". */
  collectedOnBehalf?: number;
  /** "Còn phải thu". */
  remainingReceivable?: number;
  /** "Dư nợ trước" — khối dư nợ chỉ render khi field này có giá trị. */
  debtBefore?: number;
  /** "Dư nợ sau". */
  debtAfter?: number;
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
