/** UI filter values entered into the per-column header row. */
export interface ReturnInvoiceFilters {
  invoiceNumber: string;
  createdAt: string;
  /** "" = tất cả; ngoài ra là `SALE` / `EXCHANGE` gửi thẳng lên server. */
  type: string;
  customerName: string;
  customerPhone: string;
  totalAmount: string;
  branchName: string;
}
