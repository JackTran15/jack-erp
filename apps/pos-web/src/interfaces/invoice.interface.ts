import type {
  InvoicePaymentMethod,
  InvoiceStatus,
  InvoiceType,
  ItemDirection,
  RefundMethod,
} from "@erp/pos/types/invoice.type";
import type { CustomerRow } from "@erp/pos/interfaces/customer.interface";
import type { PromotionProgramType } from "@erp/shared-interfaces";

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
  /**
   * Dòng trả (`direction = IN`): phần khuyến mãi của hóa đơn gốc phân bổ cho
   * dòng này — khoản khách chưa từng trả nên cũng không được hoàn. Giá trị hoàn
   * thực tế = `lineTotal - promotionDiscount`.
   *
   * Chỉ có trên phiếu trả/đổi lập sau khi tính năng này lên; phiếu cũ = 0.
   */
  promotionDiscount?: number;
  /** Dòng trả lập theo hóa đơn gốc: trỏ về dòng hàng của hóa đơn bán gốc. */
  originalInvoiceItemId?: string;
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
  /** Phiếu trả/đổi lập theo hóa đơn gốc: id hóa đơn bán gốc (trống ở luồng nhanh). */
  originalInvoiceId?: string;
  isDraft: boolean;
  draftLabel?: string;
  /**
   * Ảnh chụp dòng thanh toán lúc lưu tạm (`invoices.draft_payments`, jsonb).
   * `unknown` là cố ý: cột jsonb không có ràng buộc ở DB, và plugin swagger cũng
   * chỉ sinh ra `Record<string, never>[]` — nên nơi duy nhất được tin là bộ thu
   * hẹp trong `mapInvoiceRowToDraftInvoice`, không phải kiểu khai ở đây.
   */
  draftPayments?: unknown;
  sessionId: string;
  customerId?: string;
  /** Customer nhúng ở `GET /invoices/drafts`. Các endpoint khác có thể bỏ trống. */
  customer?: CustomerRow | null;
  /** Branch nhúng ở các endpoint search v2 mới (returnable/purchase-history/drafts). */
  branch?: { id: string; name: string } | null;
  staffId: string;
  /** Tên thu ngân đã resolve từ `staffId` — chỉ có ở `GET /invoices/:id`. */
  staffName?: string | null;
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
  /**
   * Số điểm còn lại sau hóa đơn này (chỉ có ở chi tiết hoá đơn). `null` = không
   * rõ (khách vãng lai / chưa có thẻ / hóa đơn cũ) → ẩn dòng; `0` vẫn hiển thị.
   */
  pointsBalanceAfter?: number | null;
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
  /**
   * CTKM đã chạy lúc checkout, đọc từ snapshot `invoice_checkout_promotions`
   * (T-08-01) — chỉ có ở `GET /invoices/:id`. Dùng cho breakdown "KM theo hoá
   * đơn"/"KM theo mặt hàng" khi in lại (T-08-04), qua `groupPromotionsForPrint`.
   */
  appliedPromotions?: { type: PromotionProgramType; discountAmount: number }[];
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
