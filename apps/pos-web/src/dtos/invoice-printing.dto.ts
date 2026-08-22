import type {
  InvoiceInfoData,
  InvoiceLineData,
  InvoicePaymentEntry,
  InvoicePolicy,
  InvoiceStoreInfo,
  InvoiceTotals,
} from "@erp/pos/interfaces/invoice-printing.interface";

export interface InvoicePayload {
  store: InvoiceStoreInfo;
  /**
   * Số hoá đơn do **server** cấp (`invoices.code`), ví dụ "2608210001".
   *
   * Tuỳ chọn vì biên lai được dựng **trước** khi gọi API thanh toán, nên lúc dựng
   * chưa có số; `use-checkout-actions` gán vào sau khi response về. Phiếu tạm
   * tính thì không bao giờ có số. Vắng mặt → renderer ẩn hẳn dòng "Số:".
   * Tuyệt đối không sinh số ở phía client: một con số trông đúng mà tra không ra
   * chính là bug mà trường này tồn tại để chặn.
   */
  invoiceNumber?: string;
  /** When the receipt was issued. Renderer formats to vi-VN DD/MM/YYYY HH:mm. */
  issuedAt: Date;
  /** Info rows dưới tiêu đề (KH/SĐT/NV…). Field rỗng → renderer ẩn dòng. */
  info: InvoiceInfoData;
  /** Mã voucher đã chọn — chỉ in khi `totals.voucherDiscount` có giá trị. */
  voucherCode?: string;
  lines: InvoiceLineData[];
  totals: InvoiceTotals;
  /** Per-method payment breakdown — one row per entry on the receipt. */
  payments: InvoicePaymentEntry[];
  /** Bản tạm tính (chưa checkout) → tiêu đề "HÓA ĐƠN TẠM TÍNH". */
  provisional?: boolean;
  /**
   * Hóa đơn đổi/trả hàng → tiêu đề "HÓA ĐƠN ĐỔI TRẢ" (khi không phải bản
   * tạm tính — `provisional` ưu tiên hơn).
   */
  isReturnExchange?: boolean;
  /**
   * Số liên in trong 1 lệnh in (mỗi liên 1 trang, máy in nhiệt cắt giữa các
   * liên). Bỏ trống / ≤ 1 → in 1 liên.
   */
  copies?: number;
  policy: InvoicePolicy;
  /** Last centered line, e.g. "Giày MT hân hạnh phục vụ quý khách!". */
  closingMessage: string;
  /** Dòng nhắc đậm dưới closing — chỉ hóa đơn tạm tính (provisional). */
  provisionalNote?: string;
}
