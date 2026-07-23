/** Phương thức thanh toán API hỗ trợ — khác với UI enum (TRANSFER ↔ bank_transfer). */
export type ApiPaymentMethod = "cash" | "bank_transfer" | "card";

/** Phương thức thanh toán lưu trên invoice (có thêm "debt" so với ApiPaymentMethod). */
export type InvoicePaymentMethod = "cash" | "bank_transfer" | "card" | "debt";

export type InvoiceStatus =
  | "draft"
  | "pending"
  | "paid"
  | "debt"
  | "partial_debt"
  | "cancelled";

/** Loại hóa đơn — mirror `InvoiceType` ở backend (`invoice.entity.ts`). */
export type InvoiceType = "SALE" | "RETURN" | "EXCHANGE";

/**
 * Chiều của dòng hàng — mirror `ItemDirection` ở backend (`invoice-item.entity.ts`).
 * OUT = hàng bán / mua mới, IN = hàng trả lại (RETURN / phần trả của EXCHANGE).
 */
export type ItemDirection = "OUT" | "IN";

/**
 * Chế độ tạo đơn trả — `quick` không cần hóa đơn gốc, `regular` tham chiếu hóa
 * đơn bán gốc. Mirror `ReturnInvoiceMode` (`create-return-invoice.dto.ts`).
 */
export type ReturnInvoiceMode = "quick" | "regular";

/**
 * Cách hoàn tiền khi tất toán đơn trả/đổi — mirror `RefundMethod`
 * (`invoice.entity.ts`). CASH = chi tiền mặt, BANK = chi qua quỹ tiền gửi/ngân
 * hàng, STORE_CREDIT = ghi có cửa hàng, OFFSET = cấn trừ vào công nợ hóa đơn gốc.
 */
export type RefundMethod = "CASH" | "BANK" | "STORE_CREDIT" | "OFFSET";
