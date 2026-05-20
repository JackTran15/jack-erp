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
