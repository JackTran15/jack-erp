import {
  BankPaymentReferenceType as BankVoucherReferenceType,
  BankVoucherStatus,
} from "../../bank-vouchers.types";
import { RECEIPT_DEPOSIT_DOCUMENT_TYPE_LABEL } from "./receipt-deposit.constants";
import {
  ReceiptDepositKind,
  type DepositVoucherRow,
  type ReceiptDepositListItem,
} from "./receipt-deposit.types";

/**
 * Server row → list row. The merge, sort and account lookup that used to happen
 * here now run in SQL; this only normalises nullable columns and derives the
 * reversed flag.
 */
export function toReceiptDepositListItem(
  row: DepositVoucherRow,
): ReceiptDepositListItem {
  return {
    kind: row.kind,
    id: row.id,
    docDate: row.docDate,
    documentNumber: row.documentNumber ?? "",
    status: row.status,
    totalAmount: Number(row.totalAmount) || 0,
    counterparty: row.counterparty ?? "",
    reason: row.reason ?? "",
    depositAccountId: row.depositAccountId,
    depositAccountName: row.depositAccountName ?? "",
    depositAccountNo: row.depositAccountNo ?? "",
    referenceType: row.referenceType ?? undefined,
    isReversed: row.status === BankVoucherStatus.REVERSED,
    // The reversal voucher itself stays POSTED — only its referenceType marks it.
    isReversal: row.referenceType === BankVoucherReferenceType.REVERSAL,
  };
}

export function receiptDepositDocumentTypeLabel(kind: ReceiptDepositKind): string {
  return kind === ReceiptDepositKind.RECEIPT
    ? RECEIPT_DEPOSIT_DOCUMENT_TYPE_LABEL.RECEIPT
    : RECEIPT_DEPOSIT_DOCUMENT_TYPE_LABEL.PAYMENT;
}
