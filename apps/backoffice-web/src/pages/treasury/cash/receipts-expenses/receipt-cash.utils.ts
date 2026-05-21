import {
  LedgerCashDetailTypeEnum,
  LedgerCashDocumentTypeEnum,
  type LedgerCashRow,
  type LedgerCashVoucherDetail,
} from "../../ledger-cash/ledger-cash.types";
import { RECEIPT_CASH_DOCUMENT_TYPE_LABEL } from "./receipt-cash.constants";
import type { ReceiptCashListRow } from "./receipt-cash.types";

const VOUCHER_DOCUMENT_TYPES = new Set<LedgerCashDocumentTypeEnum>([
  LedgerCashDocumentTypeEnum.CASH_RECEIPT,
  LedgerCashDocumentTypeEnum.CASH_PAYMENT,
  LedgerCashDocumentTypeEnum.GOODS_RECEIPT_PAYMENT,
]);

export function isReceiptCashVoucherRow(row: LedgerCashRow): boolean {
  return VOUCHER_DOCUMENT_TYPES.has(row.documentType);
}

export function getReceiptCashVoucherNo(row: LedgerCashRow): string {
  return row.receiptNo ?? row.paymentNo ?? "";
}

export function getReceiptCashTotalAmount(row: LedgerCashRow): number {
  return row.amountIn > 0 ? row.amountIn : row.amountOut;
}

export function getReceiptCashDocumentTypeLabel(
  documentType: LedgerCashRow["documentType"],
): string {
  if (
    documentType === LedgerCashDocumentTypeEnum.CASH_RECEIPT ||
    documentType === LedgerCashDocumentTypeEnum.CASH_PAYMENT ||
    documentType === LedgerCashDocumentTypeEnum.GOODS_RECEIPT_PAYMENT
  ) {
    return RECEIPT_CASH_DOCUMENT_TYPE_LABEL[documentType];
  }
  return "";
}

export function toReceiptCashListRow(row: LedgerCashRow): ReceiptCashListRow {
  return {
    ...row,
    voucherNo: getReceiptCashVoucherNo(row),
    totalAmount: getReceiptCashTotalAmount(row),
    documentTypeLabel: getReceiptCashDocumentTypeLabel(row.documentType),
  };
}

export function getVoucherDetailFromRow(
  row: LedgerCashRow | null,
): LedgerCashVoucherDetail | null {
  if (!row || row.detail.type !== LedgerCashDetailTypeEnum.VOUCHER) {
    return null;
  }
  return row.detail.data;
}

export function isGoodsReceiptPaymentRow(row: LedgerCashRow | null): boolean {
  return row?.documentType === LedgerCashDocumentTypeEnum.GOODS_RECEIPT_PAYMENT;
}

export function isSimplePaymentRow(row: LedgerCashRow | null): boolean {
  return row?.documentType === LedgerCashDocumentTypeEnum.CASH_PAYMENT;
}

export function isReceiptRow(row: LedgerCashRow | null): boolean {
  return row?.documentType === LedgerCashDocumentTypeEnum.CASH_RECEIPT;
}

export function voucherLineTotal(lines: { amount: number }[]): number {
  return lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
}

export function cloneLedgerCashRow(row: LedgerCashRow): LedgerCashRow {
  return JSON.parse(JSON.stringify(row)) as LedgerCashRow;
}

/** Rehydrate Date fields after JSON clone. */
export function hydrateLedgerCashRowDates(row: LedgerCashRow): LedgerCashRow {
  row.documentDate = new Date(row.documentDate);
  if (row.detail.type === LedgerCashDetailTypeEnum.VOUCHER) {
    const d = row.detail.data;
    d.voucherDate = new Date(d.voucherDate);
    d.documentLines?.forEach((dl) => {
      dl.documentDate = new Date(dl.documentDate);
    });
    if (d.goodsReceipt) {
      d.goodsReceipt.receiptDate = new Date(d.goodsReceipt.receiptDate);
    }
  }
  if (row.detail.type === LedgerCashDetailTypeEnum.INVOICE) {
    row.detail.data.issuedAt = new Date(row.detail.data.issuedAt);
  }
  return row;
}

export function parseVoucherNumberSuffix(
  voucherNo: string,
  prefix: "PT" | "PC",
): number {
  const m = voucherNo.match(new RegExp(`^${prefix}(\\d+)$`, "i"));
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

export function formatVoucherNumber(prefix: "PT" | "PC", seq: number): string {
  return `${prefix}${String(seq).padStart(6, "0")}`;
}

export function nextReceiptVoucherNo(existingNos: string[]): string {
  let max = 0;
  for (const no of existingNos) {
    const m = no.match(/^PT(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return formatVoucherNumber("PT", max + 1);
}

export function nextPaymentVoucherNo(existingNos: string[]): string {
  let max = 0;
  for (const no of existingNos) {
    const m = no.match(/^PC(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return formatVoucherNumber("PC", max + 1);
}
