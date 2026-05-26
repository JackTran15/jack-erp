import {
  CashCountStatus,
  CashPaymentReferenceType,
  CashReceiptReferenceType,
  CashVoucherStatus,
  type ReceiptPaymentKind,
} from "./cash-vouchers.types";

export const CASH_VOUCHER_STATUS_LABEL: Record<CashVoucherStatus, string> = {
  [CashVoucherStatus.DRAFT]: "Nháp",
  [CashVoucherStatus.POSTED]: "Đã ghi sổ",
  [CashVoucherStatus.REVERSED]: "Đã đảo",
};

export const CASH_COUNT_STATUS_LABEL: Record<CashCountStatus, string> = {
  [CashCountStatus.DRAFT]: "Chưa xử lý",
  [CashCountStatus.POSTED]: "Đã xử lý",
};

export function receiptPaymentDocumentTypeLabel(
  kind: ReceiptPaymentKind,
  referenceType?: CashReceiptReferenceType | CashPaymentReferenceType,
): string {
  if (kind === "RECEIPT") return "Phiếu thu tiền mặt";
  if (referenceType === CashPaymentReferenceType.GOODS_RECEIPT) {
    return "Phiếu nhập hàng - Tiền mặt";
  }
  return "Phiếu chi tiền mặt";
}

export function isAutoVoucherReference(
  referenceType?: CashReceiptReferenceType | CashPaymentReferenceType,
): boolean {
  if (!referenceType) return false;
  return (
    referenceType !== CashReceiptReferenceType.MANUAL &&
    referenceType !== CashReceiptReferenceType.REVERSAL &&
    referenceType !== CashPaymentReferenceType.MANUAL &&
    referenceType !== CashPaymentReferenceType.REVERSAL
  );
}
