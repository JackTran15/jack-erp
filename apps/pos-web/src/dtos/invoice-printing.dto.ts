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
  /** Receipt number, e.g. "2605010007". */
  invoiceNumber: string;
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
   * Số liên in trong 1 lệnh in (mỗi liên 1 trang, máy in nhiệt cắt giữa các
   * liên). Bỏ trống / ≤ 1 → in 1 liên.
   */
  copies?: number;
  policy: InvoicePolicy;
  /** Last centered line, e.g. "Giày MT hân hạnh phục vụ quý khách!". */
  closingMessage: string;
}
