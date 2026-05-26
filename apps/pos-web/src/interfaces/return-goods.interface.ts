/**
 * Domain types for the "Đổi trả hàng" page (`/return-goods`). Rows come from
 * `GET /invoices` (hóa đơn đã thanh toán); the per-line returnable list is
 * fetched lazily from `GET /invoices/:id/eligible-returns` when the dialog opens.
 */

export interface ReturnInvoiceRow {
  /** Original SALE invoice id (UUID) — dùng làm `originalInvoiceId` khi tạo đơn trả. */
  id: string;
  /** "Số hóa đơn" — mã hóa đơn, e.g. "INV-2605-00001". */
  invoiceNumber: string;
  /** "Ngày tạo" — thời điểm phát hành hóa đơn gốc. */
  createdAt: Date;
  /**
   * Customer id (UUID) của hóa đơn gốc — `null` khi khách lẻ. Dùng để tự điền +
   * khóa khách trên tab `invoice_return` ở checkout.
   */
  customerId: string | null;
  /** "Khách hàng" — display name; empty string when walk-in. */
  customerName: string;
  /** "Số điện thoại" — empty string when not provided. */
  customerPhone: string;
  /** "Tổng thanh toán" — VND. */
  totalAmount: number;
  /** "Chi nhánh" — branch name. */
  branchName: string;
  /**
   * Items eligible to be returned/exchanged. Chỉ được nạp khi mở dialog
   * (`GET /invoices/:id/eligible-returns`) — listing không kèm.
   */
  items?: ReturnableItem[];
}

/**
 * Một dòng hàng có thể trả, dựng từ `EligibleReturnLine`. `id` =
 * `originalInvoiceItemId` (dùng làm key chọn + truy ngược dòng gốc).
 */
export interface ReturnableItem {
  /** = `originalInvoiceItemId` của dòng hóa đơn bán gốc. */
  id: string;
  /** Product id (UUID) gửi lên BE khi tạo đơn trả. */
  itemId: string;
  /** Internal SKU/code shown above the descriptive name. */
  code: string;
  /** "Tên hàng hóa". */
  name: string;
  /** Đơn vị tính (gửi nguyên về BE). */
  unit: string;
  /** Kho/vị trí xuất gốc (UUID) — BE yêu cầu khi nhập trả. */
  locationId?: string;
  /** "Đơn giá" — original sale unit price. */
  unitPrice: number;
  /** "SL được trả" — max quantity still eligible to return (`maxReturnable`). */
  allowedQty: number;
}

/**
 * Phản hồi `GET /invoices/:id/eligible-returns` — mirror `EligibleLine`
 * (`apps/api/src/modules/pos/services/return-eligibility.service.ts`).
 * Các cột numeric có thể về dạng string (Postgres) nên consumer cần `Number(...)`.
 */
export interface EligibleReturnLine {
  originalInvoiceItemId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  unitPrice: number;
  lineDiscount: number;
  locationId?: string;
  soldQuantity: number;
  returnedQuantity: number;
  maxReturnable: number;
}
