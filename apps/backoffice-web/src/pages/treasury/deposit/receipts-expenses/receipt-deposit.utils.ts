import {
  BankVoucherStatus,
  type BankPayment,
  type BankReceipt,
} from "../../bank-vouchers.types";
import { RECEIPT_DEPOSIT_DOCUMENT_TYPE_LABEL } from "./receipt-deposit.constants";
import { ReceiptDepositKind, type ReceiptDepositListItem } from "./receipt-deposit.types";

function num(v: unknown): number {
  return Number(v) || 0;
}

export function toReceiptDepositListItem(r: BankReceipt): ReceiptDepositListItem {
  return {
    kind: ReceiptDepositKind.RECEIPT,
    id: r.id,
    docDate: r.docDate,
    documentNumber: r.documentNumber ?? "",
    status: r.status,
    totalAmount: num(r.totalAmount),
    counterparty: (r.payerName?.trim() || r.partnerNameSnapshot?.trim()) ?? "",
    reason: r.reason ?? "",
    depositAccountId: r.depositAccountId,
    referenceType: r.referenceType,
    isReversed: r.status === BankVoucherStatus.REVERSED,
    receipt: r,
  };
}

export function toPaymentDepositListItem(p: BankPayment): ReceiptDepositListItem {
  return {
    kind: ReceiptDepositKind.PAYMENT,
    id: p.id,
    docDate: p.docDate,
    documentNumber: p.documentNumber ?? "",
    status: p.status,
    totalAmount: num(p.totalAmount),
    counterparty: (p.payeeName?.trim() || p.partnerNameSnapshot?.trim()) ?? "",
    reason: p.reason ?? "",
    depositAccountId: p.depositAccountId,
    referenceType: p.referenceType,
    isReversed: p.status === BankVoucherStatus.REVERSED,
    payment: p,
  };
}

export function mergeReceiptDepositLists(
  receipts: BankReceipt[],
  payments: BankPayment[],
): ReceiptDepositListItem[] {
  const merged = [
    ...receipts.map(toReceiptDepositListItem),
    ...payments.map(toPaymentDepositListItem),
  ];
  merged.sort((a, b) => {
    const d = b.docDate.localeCompare(a.docDate);
    if (d !== 0) return d;
    return b.id.localeCompare(a.id);
  });
  return merged;
}

export function receiptDepositDocumentTypeLabel(kind: ReceiptDepositKind): string {
  return kind === ReceiptDepositKind.RECEIPT
    ? RECEIPT_DEPOSIT_DOCUMENT_TYPE_LABEL.RECEIPT
    : RECEIPT_DEPOSIT_DOCUMENT_TYPE_LABEL.PAYMENT;
}
