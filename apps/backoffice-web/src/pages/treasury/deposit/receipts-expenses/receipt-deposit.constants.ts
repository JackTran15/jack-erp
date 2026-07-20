import type { V2SearchConfig } from "../../../../components/crud/crudV2Search";
import { BANK_VOUCHER_STATUS_LABEL } from "../../bank-vouchers.labels";
import { BankVoucherStatus } from "../../bank-vouchers.types";
import { ReceiptDepositKind } from "./receipt-deposit.types";

/**
 * Column keys are deliberately named after the `POST /v2/deposit-vouchers/search`
 * request fields so `buildV2Body` can map the filter state straight onto the
 * body without a translation table.
 */
export const RECEIPT_DEPOSIT_FILTER_KEYS = [
  "docDate",
  "documentNumber",
  "kind",
  "status",
  "totalAmount",
  "accountLabel",
  "counterparty",
  "reason",
] as const;

export type ReceiptDepositFilterKey = (typeof RECEIPT_DEPOSIT_FILTER_KEYS)[number];

export const RECEIPT_DEPOSIT_DOCUMENT_TYPE_LABEL = {
  RECEIPT: "Phiếu thu tiền gửi",
  PAYMENT: "Phiếu chi tiền gửi",
} as const;

/** Options carry the enum VALUE now that the filter is evaluated server-side. */
export const RECEIPT_DEPOSIT_DOCUMENT_TYPE_FILTER_OPTIONS = [
  {
    value: ReceiptDepositKind.RECEIPT,
    label: RECEIPT_DEPOSIT_DOCUMENT_TYPE_LABEL.RECEIPT,
  },
  {
    value: ReceiptDepositKind.PAYMENT,
    label: RECEIPT_DEPOSIT_DOCUMENT_TYPE_LABEL.PAYMENT,
  },
];

export const RECEIPT_DEPOSIT_STATUS_FILTER_OPTIONS = Object.values(
  BankVoucherStatus,
).map((value) => ({ value, label: BANK_VOUCHER_STATUS_LABEL[value] }));

/** Only these keys are ever sent — the API runs forbidNonWhitelisted. */
export const RECEIPT_DEPOSIT_SEARCH: V2SearchConfig = {
  path: "/v2/deposit-vouchers/search",
  fields: {
    docDate: "date-range",
    documentNumber: "string",
    kind: "enum",
    status: "enum",
    totalAmount: "compare",
    accountLabel: "string",
    counterparty: "string",
    reason: "string",
  },
};
