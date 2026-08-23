export const RETURN_GOODS_DEFAULT_PAGE_SIZE = 100;

export enum ReturnInvoiceColumnKey {
  InvoiceNumber = "invoiceNumber",
  CreatedAt = "createdAt",
  Type = "type",
  CustomerName = "customerName",
  CustomerPhone = "customerPhone",
  TotalAmount = "totalAmount",
  BranchName = "branchName",
  Action = "action",
}

export const EMPTY_RETURN_INVOICE_FILTERS = {
  invoiceNumber: "",
  createdAt: "",
  type: "",
  customerName: "",
  customerPhone: "",
  totalAmount: "",
  branchName: "",
} as const;

/**
 * Nhãn cột "Loại". Lưới đổi trả nay trộn hoá đơn bán và hoá đơn đổi, nên nhãn
 * dùng ở cả ô hiển thị lẫn ô lọc — giữ một nguồn để hai chỗ không trôi lệch.
 */
export const RETURN_INVOICE_TYPE_LABELS = {
  SALE: "Bán hàng",
  EXCHANGE: "Đổi trả",
} as const;

/**
 * Lựa chọn cho ô lọc cột "Loại". Chuỗi rỗng = không gửi `type` lên server, tức
 * là cả hai loại chứng từ — không phải một loại thứ ba.
 */
export const RETURN_INVOICE_TYPE_FILTER_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "SALE", label: RETURN_INVOICE_TYPE_LABELS.SALE },
  { value: "EXCHANGE", label: RETURN_INVOICE_TYPE_LABELS.EXCHANGE },
] as const;
