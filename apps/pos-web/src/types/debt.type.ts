/**
 * Category of a debt-ledger document (BE value). The first three are debt-raising
 * rows from `invoice_debts`; the `collect_debt_*` values are collections (Phiếu
 * thu) surfaced from `debt_payments`.
 */
export type DebtDocumentType =
  | "credit_invoice"
  | "payment_receipt"
  | "adjustment"
  | "collect_debt_cash"
  | "collect_debt_bank";

/** Collection status of a debt record (BE enum value). */
export type DebtStatus = "open" | "paid" | "overdue";
