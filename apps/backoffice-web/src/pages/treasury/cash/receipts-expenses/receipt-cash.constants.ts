import { LedgerCashDocumentTypeEnum } from "../../ledger-cash/ledger-cash.types";

export const RECEIPT_CASH_FILTER_KEYS = [
  "documentDate",
  "voucherNo",
  "documentTypeLabel",
  "totalAmount",
  "counterparty",
  "reason",
] as const;

export type ReceiptCashFilterKey = (typeof RECEIPT_CASH_FILTER_KEYS)[number];

export const RECEIPT_CASH_DOCUMENT_TYPE_LABEL: Record<
  | LedgerCashDocumentTypeEnum.CASH_RECEIPT
  | LedgerCashDocumentTypeEnum.CASH_PAYMENT
  | LedgerCashDocumentTypeEnum.GOODS_RECEIPT_PAYMENT,
  string
> = {
  [LedgerCashDocumentTypeEnum.CASH_RECEIPT]: "Phiếu thu tiền mặt",
  [LedgerCashDocumentTypeEnum.CASH_PAYMENT]: "Phiếu chi tiền mặt",
  [LedgerCashDocumentTypeEnum.GOODS_RECEIPT_PAYMENT]:
    "Phiếu nhập hàng - Tiền mặt",
};

export const RECEIPT_CASH_DOCUMENT_TYPE_FILTER_OPTIONS = Object.entries(
  RECEIPT_CASH_DOCUMENT_TYPE_LABEL,
).map(([value, label]) => ({ value, label }));
