export const INVOICE_LIST_DEFAULT_PAGE_SIZE = 100;

/** Khóa các cột của bảng "Danh sách hóa đơn" (chỉ giữ cột có dữ liệu từ API). */
export enum InvoiceListColumnKey {
  Code = "code",
  IssuedAt = "issuedAt",
  CreatedAt = "createdAt",
  Status = "status",
  CustomerCode = "customerCode",
  CustomerName = "customerName",
  CustomerPhone = "customerPhone",
  Amount = "amount",
  Note = "note",
}

/** Nhãn tiếng Việt cho từng cột (dùng ở header bảng + modal thiết lập cột). */
export const INVOICE_LIST_COLUMN_LABELS: Record<InvoiceListColumnKey, string> = {
  [InvoiceListColumnKey.Code]: "Số hóa đơn",
  [InvoiceListColumnKey.IssuedAt]: "Ngày hóa đơn",
  [InvoiceListColumnKey.CreatedAt]: "Ngày tạo đơn",
  [InvoiceListColumnKey.Status]: "Trạng thái",
  [InvoiceListColumnKey.CustomerCode]: "Mã khách hàng",
  [InvoiceListColumnKey.CustomerName]: "Khách hàng",
  [InvoiceListColumnKey.CustomerPhone]: "Số điện thoại",
  [InvoiceListColumnKey.Amount]: "Tổng thanh toán",
  [InvoiceListColumnKey.Note]: "Ghi chú",
};

/** Thứ tự cột hiển thị mặc định. */
export const INVOICE_LIST_COLUMN_ORDER: InvoiceListColumnKey[] = [
  InvoiceListColumnKey.Code,
  InvoiceListColumnKey.IssuedAt,
  InvoiceListColumnKey.CreatedAt,
  InvoiceListColumnKey.Status,
  InvoiceListColumnKey.CustomerCode,
  InvoiceListColumnKey.CustomerName,
  InvoiceListColumnKey.CustomerPhone,
  InvoiceListColumnKey.Amount,
  InvoiceListColumnKey.Note,
];

export const EMPTY_INVOICE_LIST_FILTERS = {
  code: "",
  issuedAt: "",
  createdAt: "",
  /** "" = Tất cả; ngược lại là một `InvoiceStatus`. */
  status: "",
  customerCode: "",
  customerName: "",
  customerPhone: "",
  amount: "",
  note: "",
} as const;

/** Trường ngày mà filter khoảng thời gian áp dụng lên. */
export type InvoiceListDateField = "createdAt" | "issuedAt";
