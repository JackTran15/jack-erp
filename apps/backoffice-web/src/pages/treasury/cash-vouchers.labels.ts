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

/**
 * Whether a voucher may be edited or deleted in place.
 *
 * Mirrors `assertEditable` on the server, deliberately and narrowly: only a
 * voucher the user created by hand (`referenceType === MANUAL`) and that is
 * still posted. Everything else — POS sales, debt collection, supplier payments,
 * fund swaps, transfers, and reversals — stays reversal-only.
 *
 * This is NOT `!isAutoVoucherReference(...)`. That helper counts REVERSAL as
 * "not auto" because a reversal is shown like a normal voucher in the grid, but
 * a reversal is machine-written and the server refuses to edit it. Reusing it
 * here would light up a button that can only ever produce a 400.
 */
export function isEditableVoucherReference(
  referenceType?: CashReceiptReferenceType | CashPaymentReferenceType,
): boolean {
  return (
    referenceType === CashReceiptReferenceType.MANUAL ||
    referenceType === CashPaymentReferenceType.MANUAL
  );
}
