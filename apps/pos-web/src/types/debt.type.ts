/** Category of the source document that created/adjusted a debt (BE enum value). */
export type DebtDocumentType =
  | "credit_invoice"
  | "payment_receipt"
  | "adjustment";

/** Collection status of a debt record (BE enum value). */
export type DebtStatus = "open" | "paid" | "overdue";
