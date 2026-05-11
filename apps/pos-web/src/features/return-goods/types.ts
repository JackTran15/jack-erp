/**
 * Domain types for the "Đổi trả hàng" page (`/return-goods`). The feature
 * is presentational/mock-data only at this stage — types describe the shape
 * a real API layer would feed into the page.
 */

export interface ReturnInvoiceRow {
  id: string;
  /** "Số hóa đơn" — display id, e.g. "2605010015". */
  invoiceNumber: string;
  /** "Ngày tạo" — invoice creation timestamp. */
  createdAt: Date;
  /** "Khách hàng" — display name; empty string when walk-in. */
  customerName: string;
  /** "Số điện thoại" — empty string when not provided. */
  customerPhone: string;
  /** "Tổng thanh toán" — VND. */
  totalAmount: number;
  /** "Chi nhánh" — branch name. */
  branchName: string;
  /** Items eligible to be returned/exchanged from this invoice. */
  items: ReturnableItem[];
}

export interface ReturnableItem {
  id: string;
  /** Internal SKU/code shown above the descriptive name. */
  code: string;
  /** "Tên hàng hóa". */
  name: string;
  /** "Đơn giá" — original sale unit price. */
  unitPrice: number;
  /** "SL được trả" — max quantity still eligible to return. */
  allowedQty: number;
}

/** UI filter values entered into the per-column header row. */
export interface ReturnInvoiceFilters {
  invoiceNumber: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  totalAmount: string;
  branchName: string;
}
