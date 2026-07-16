export const RECEIPT_DEPOSIT_FILTER_KEYS = [
  "documentDate",
  "voucherNo",
  "documentTypeLabel",
  "totalAmount",
  "counterparty",
  "reason",
] as const;

export type ReceiptDepositFilterKey = (typeof RECEIPT_DEPOSIT_FILTER_KEYS)[number];

export const RECEIPT_DEPOSIT_DOCUMENT_TYPE_LABEL = {
  RECEIPT: "Phiếu thu tiền gửi",
  PAYMENT: "Phiếu chi tiền gửi",
} as const;

export const RECEIPT_DEPOSIT_DOCUMENT_TYPE_FILTER_OPTIONS = Object.values(
  RECEIPT_DEPOSIT_DOCUMENT_TYPE_LABEL,
).map((label) => ({ value: label, label }));
