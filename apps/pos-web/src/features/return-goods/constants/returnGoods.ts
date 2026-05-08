export const RETURN_GOODS_TITLE = "Đổi trả hàng";

export const RETURN_GOODS_DEFAULT_PAGE_SIZE = 100;

export enum ReturnInvoiceColumnKey {
  InvoiceNumber = "invoiceNumber",
  CreatedAt = "createdAt",
  CustomerName = "customerName",
  CustomerPhone = "customerPhone",
  TotalAmount = "totalAmount",
  BranchName = "branchName",
  Action = "action",
}

export const EMPTY_RETURN_INVOICE_FILTERS = {
  invoiceNumber: "",
  createdAt: "",
  customerName: "",
  customerPhone: "",
  totalAmount: "",
  branchName: "",
} as const;
