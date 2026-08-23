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
   * "Loại" — chứng từ gốc là hóa đơn bán hay hóa đơn đổi. Hóa đơn đổi trả được
   * theo phần "Mua thêm" của nó, nên lưới trộn cả hai; `RETURN` không bao giờ
   * lọt vào đây (không có dòng bán ra nào để trả).
   */
  type: "SALE" | "EXCHANGE";
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
  /** "Đơn giá" — original sale unit price (giá niêm yết, dùng để hiển thị). */
  unitPrice: number;
  /**
   * Giá trị hoàn lại cho MỘT đơn vị: `unitPrice` đã trừ khuyến mãi phân bổ cho
   * dòng đó trên hóa đơn gốc. Bằng `unitPrice` khi hóa đơn gốc không giảm giá.
   *
   * Tiền trả/đổi phải tính trên số này — BE hoàn đúng số khách đã trả, nên lấy
   * giá niêm yết sẽ thu thiếu đúng phần khuyến mãi và đẻ ra công nợ ảo.
   */
  refundableUnitPrice: number;
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
  /** Giá trị hoàn cho 1 đơn vị, đã trừ khuyến mãi phân bổ (xem `ReturnableItem`). */
  refundableUnitPrice: number;
  lineDiscount: number;
  locationId?: string;
  soldQuantity: number;
  returnedQuantity: number;
  maxReturnable: number;
}

/**
 * Dư nợ còn lại của hóa đơn gốc (`GET /invoices/:id/outstanding-debt`).
 *
 * Khoản hoàn của phiếu trả luôn trừ dư nợ này trước, phần còn lại mới chi ra
 * quỹ — màn hình thanh toán dùng số này để hiện trước hai dòng đó.
 */
export interface OutstandingDebtRow {
  remainingDebt: number;
}
