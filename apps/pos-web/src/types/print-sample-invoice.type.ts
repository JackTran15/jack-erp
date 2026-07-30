import type {
  InvoiceInfoData,
  InvoiceStoreInfo,
  InvoiceTotals,
} from "@erp/pos/interfaces/invoice-printing.interface";

/** Loại hóa đơn — quyết định tiêu đề bill (`provisional` / `isReturnExchange`). */
export type SampleDocType = "SALE" | "PROVISIONAL" | "RETURN_EXCHANGE";

/** Kiểu ô nhập của một field trong editor nội dung. */
export type SampleFieldKind = "text" | "textarea" | "datetime" | "money" | "int";

/**
 * Khóa field dạng dotted, DẪN XUẤT từ chính shape của `InvoicePayload` — thêm
 * field vào `InvoiceTotals`/`InvoiceInfoData` là TypeScript bắt phải khai báo
 * giá trị mặc định tương ứng, không trôi lệch âm thầm.
 *
 * Tách text/number vì mọi field của `InvoiceTotals` là số, còn lại là chuỗi —
 * nhờ vậy draft không cần union `string | number` rồi ép kiểu lúc dựng payload.
 */
export type SampleTextFieldKey =
  | `store.${keyof InvoiceStoreInfo}`
  | `info.${keyof InvoiceInfoData}`
  | "invoiceNumber"
  /** ISO string — `Date` không serialize được xuống localStorage. */
  | "issuedAt"
  | "voucherCode"
  | "provisionalNote"
  | "policy.title"
  | "policy.body"
  | "closingMessage";

export type SampleNumberFieldKey = `totals.${keyof InvoiceTotals}`;

export type SampleFieldKey = SampleTextFieldKey | SampleNumberFieldKey;

/** Field do hệ thống tự tính từ hàng hóa / thanh toán. */
export type SampleDerivedFieldKey =
  | "totals.totalQty"
  | "totals.subtotal"
  | "totals.grandTotal"
  | "totals.paid"
  | "totals.change";
