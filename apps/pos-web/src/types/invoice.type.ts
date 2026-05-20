/** Phương thức thanh toán API hỗ trợ — khác với UI enum (TRANSFER ↔ bank_transfer). */
export type ApiPaymentMethod = "cash" | "bank_transfer" | "card";

export type InvoiceStatus =
  | "draft"
  | "pending"
  | "paid"
  | "debt"
  | "partial_debt"
  | "cancelled";
