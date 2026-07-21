import type { V2SearchConfig } from "../../../../components/crud/crudV2Search";
import { CASH_VOUCHER_STATUS_LABEL } from "../../cash-vouchers.labels";
import {
  CashVoucherDocumentKind,
  CashVoucherStatus,
} from "../../cash-vouchers.types";

/**
 * Column keys are deliberately named after the `POST /v2/cash-vouchers/search`
 * request fields so `buildV2Body` can map the filter state straight onto the
 * body without a translation table.
 */
export const RECEIPT_CASH_FILTER_KEYS = [
  "createdAt",
  "documentNumber",
  "documentKind",
  "status",
  "totalAmount",
  "counterparty",
  "reason",
] as const;

export type ReceiptCashFilterKey = (typeof RECEIPT_CASH_FILTER_KEYS)[number];

export const RECEIPT_CASH_DOCUMENT_TYPE_LABEL: Record<
  CashVoucherDocumentKind,
  string
> = {
  [CashVoucherDocumentKind.CASH_RECEIPT]: "Phiếu thu tiền mặt",
  [CashVoucherDocumentKind.CASH_PAYMENT]: "Phiếu chi tiền mặt",
  [CashVoucherDocumentKind.GOODS_RECEIPT_PAYMENT]: "Phiếu nhập hàng - Tiền mặt",
};

/** Options carry the enum VALUE now that the filter is evaluated server-side. */
export const RECEIPT_CASH_DOCUMENT_TYPE_FILTER_OPTIONS = Object.values(
  CashVoucherDocumentKind,
).map((value) => ({ value, label: RECEIPT_CASH_DOCUMENT_TYPE_LABEL[value] }));

export const RECEIPT_CASH_STATUS_FILTER_OPTIONS = Object.values(
  CashVoucherStatus,
).map((value) => ({ value, label: CASH_VOUCHER_STATUS_LABEL[value] }));

/** Only these keys are ever sent — the API runs forbidNonWhitelisted. */
export const RECEIPT_CASH_SEARCH: V2SearchConfig = {
  path: "/v2/cash-vouchers/search",
  fields: {
    createdAt: "date-range",
    documentNumber: "string",
    documentKind: "enum",
    status: "enum",
    totalAmount: "compare",
    counterparty: "string",
    reason: "string",
  },
};
