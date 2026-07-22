import type {
  InvoicePaymentMethod,
  InvoiceStatus,
  InvoiceType,
  ItemDirection,
  RefundMethod,
} from "@erp/pos/types/invoice.type";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";

export interface InvoiceItemRow {
  id: string;
  itemId: string;
  locationId?: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  /** OUT = mua/bán, IN = trả lại. Phân biệt dòng trả trong đơn đổi/trả. */
  direction?: ItemDirection;
  unitPrice: number;
  lineDiscount: number;
  /** KM thủ công per-line (null = legacy chỉ có `lineDiscount` amount). */
  lineDiscountType?: "percent" | "amount";
  /** Giá trị KM thô (numeric → API trả string, `Number()` khi dùng). */
  lineDiscountValue?: number;
  lineDiscountReason?: string;
  lineTotal: number;
  note?: string;
  sortOrder?: number;
}

/**
 * Bản ghi invoice trả về từ `POST /invoices`, `GET /invoices/:id`, `GET /invoices/drafts`
 * và `POST /invoices/:id/checkout`. `items` chỉ có ở endpoint chi tiết.
 */
export interface InvoiceRow {
  id: string;
  code: string;
  status: InvoiceStatus;
  /** SALE | RETURN | EXCHANGE — chỉ SALE mới đổi/trả được (lọc ở trang return-goods). */
  type?: InvoiceType;
  isDraft: boolean;
  draftLabel?: string;
  sessionId: string;
  customerId?: string;
  /** Customer nhúng ở `GET /invoices/drafts`. Các endpoint khác có thể bỏ trống. */
  customer?: CustomerRow | null;
  /** Branch nhúng ở các endpoint search v2 mới (returnable/purchase-history/drafts). */
  branch?: { id: string; name: string } | null;
  staffId: string;
  subtotal: number;
  discountAmount: number;
  depositAmount: number;
  amountDue: number;
  totalPaid: number;
  /** Net = newSubtotal - returnSubtotal; âm = hoàn tiền khách (RETURN/EXCHANGE). 0 cho SALE. */
  netAmount: number;
  /** Cách hoàn tiền BE đã áp dụng cho đơn trả/đổi (có thể khác giá trị FE gửi khi BE fallback). */
  refundMethod?: RefundMethod | null;
  /** Số điểm khách dùng để thanh toán (chỉ có ở chi tiết hoá đơn). */
  pointsRedeemed?: number;
  /** Giá trị VND quy đổi từ điểm đã dùng. */
  pointsDiscountAmount?: number;
  /** Số điểm được tích từ hóa đơn (chỉ có ở chi tiết hoá đơn). */
  pointsEarned?: number;
  /** Số điểm bị thu hồi khi trả/đổi hàng (chỉ có ở chi tiết hoá đơn). */
  pointsReversed?: number;
  note?: string;
  issuedAt?: string;
  createdAt: string;
  updatedAt?: string;
  items?: InvoiceItemRow[];
  // Chỉ có ở `GET /invoices/:id` (sau checkout) — phục vụ biên lai chi tiết.
  paymentMethod?: InvoicePaymentMethod | null;
  cashTendered?: number | null;
  changeAmount?: number | null;
  /** Chi tiết thanh toán theo từng phương thức (Tiền mặt / Chuyển khoản / Thẻ). */
  payments?: InvoicePaymentRow[];
  /** Công nợ còn lại của hoá đơn (invoice_debts.remainingAmount); null khi không có nợ. */
  remainingDebt?: number | null;
}

/** Một dòng thanh toán theo phương thức, dùng để dựng biên lai chi tiết. */
export interface InvoicePaymentRow {
  paymentMethod: InvoicePaymentMethod;
  amount: number;
  reference?: string | null;
}

/**
 * Dòng hiển thị trên trang "Danh sách hóa đơn" (`/invoices`). Dựng từ `InvoiceRow`
 * (`GET /invoices`) + enrich thông tin khách (mã/tên/SĐT) qua `customerService.get`
 * vì endpoint danh sách chỉ trả `customerId`.
 */
export interface InvoiceListRow {
  id: string;
  /** "Số hóa đơn". */
  code: string;
  type?: InvoiceType;
  status: InvoiceStatus;
  /** "Ngày hóa đơn" — thời điểm phát hành (null khi chưa phát hành). */
  issuedAt: string | null;
  /** "Ngày tạo đơn". */
  createdAt: string;
  customerId: string | null;
  /** "Mã khách hàng" — empty khi khách lẻ / chưa lấy được. */
  customerCode: string;
  /** "Khách hàng". */
  customerName: string;
  /** "Số điện thoại". */
  customerPhone: string;
  /** "Tổng thanh toán" — VND, âm cho đơn trả (quy ước hiển thị). */
  amount: number;
  /** "Ghi chú". */
  note: string;
}
