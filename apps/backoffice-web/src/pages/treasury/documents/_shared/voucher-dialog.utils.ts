import {
  LedgerCashVoucherKindEnum,
  LedgerCashVoucherPurposeEnum,
  type LedgerCashVoucherDetail,
  type LedgerCashVoucherDocumentLine,
} from "../../ledger-cash/ledger-cash.types";
import type { VoucherFormLine } from "./voucher-dialog.constants";

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function voucherLineTotal(lines: { amount: number }[]): number {
  return lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
}

/**
 * Copies "Lý do thu"/"Lý do chi" down into the first detail line's "Diễn giải",
 * but only while that cell is still empty — a line the user has typed into is
 * never overwritten.
 *
 * Called from the reason field's own handler, never from an effect watching
 * `reason`. An effect would also fire while a dialog hydrates an existing
 * voucher in EDIT mode and would quietly rewrite a saved description; it would
 * also need a per-line dirty flag to know what "still empty" meant after the
 * first keystroke. The same reasoning is spelled out on `handleSubOptionChange`
 * in PaymentVoucherDialog, which is the existing precedent for copying a header
 * value into a line.
 *
 * Returns a new array when it changes something and the original array when it
 * does not, so callers can pass the result straight to `setLines` without
 * forcing a re-render for a no-op.
 */
export function applyReasonToFirstLine(
  lines: VoucherFormLine[],
  reason: string,
): VoucherFormLine[] {
  const text = reason.trim();
  if (!text) return lines;
  const first = lines[0];
  if (!first || first.description.trim()) return lines;
  return [{ ...first, description: text }, ...lines.slice(1)];
}

/** "BANK - Name - STK" — distinguishes deposit accounts sharing the same bank in a picker. */
export function formatDepositAccountLabel(account: {
  bankName: string;
  name: string;
  accountNo: string;
}): string {
  return `${account.bankName} - ${account.name} - ${account.accountNo}`;
}

import {
  resolvePartyFields,
  type PartnerLookupType,
} from "./voucher-partner.constants";

export function buildReceiptDetailFromForm(state: {
  purpose: LedgerCashVoucherPurposeEnum;
  partnerKind: PartnerLookupType;
  partnerId: string;
  counterpartyCode: string;
  counterpartyName: string;
  payerName: string;
  address: string;
  reason: string;
  staffId: string;
  employeeCode: string;
  employeeName: string;
  reference: string;
  voucherNo: string;
  voucherDate: string;
  lines: VoucherFormLine[];
  documentLines?: LedgerCashVoucherDetail["documentLines"];
}): LedgerCashVoucherDetail {
  // Delegate to `resolvePartyFields` instead of re-deriving the rule here: it
  // is the one place (ADR-04) both cash and bank voucher dialogs decide
  // `partnerType`, so a hand-typed name always resolves to `OTHER` even when
  // `partnerKind` still carries a stale catalogue value.
  const { partnerType } = resolvePartyFields({
    partnerId: state.partnerId,
    partnerKind: state.partnerKind,
    partnerName: state.counterpartyName,
  });
  return {
    kind: LedgerCashVoucherKindEnum.RECEIPT,
    purpose: state.purpose,
    voucherNo: state.voucherNo,
    voucherDate: new Date(state.voucherDate),
    partnerKind: state.partnerKind,
    partnerType,
    partnerId: state.partnerId || undefined,
    counterpartyCode: state.counterpartyCode,
    counterpartyName: state.counterpartyName,
    payerName: state.payerName,
    address: state.address,
    reason: state.reason,
    staffId: state.staffId || undefined,
    employeeCode: state.employeeCode,
    employeeName: state.employeeName,
    reference: state.reference || undefined,
    lines: state.lines.map((l) => ({
      description: l.description,
      amount: Number(l.amount) || 0,
      category: l.category,
      categoryId: l.categoryId,
    })),
    documentLines: state.documentLines,
  };
}

import type { CashPaymentPurpose } from "../../cash-vouchers.types";

export function buildPaymentDetailFromForm(state: {
  purpose: LedgerCashVoucherPurposeEnum;
  paymentPurpose: CashPaymentPurpose;
  partnerKind: PartnerLookupType;
  partnerId: string;
  counterpartyCode: string;
  counterpartyName: string;
  payerName: string;
  address: string;
  reason: string;
  staffId: string;
  employeeCode: string;
  employeeName: string;
  reference: string;
  voucherNo: string;
  voucherDate: string;
  lines: VoucherFormLine[];
  documentLines?: LedgerCashVoucherDocumentLine[];
  transferAccountId?: string;
}): LedgerCashVoucherDetail {
  // Delegate to `resolvePartyFields` instead of re-deriving the rule here: it
  // is the one place (ADR-04) both cash and bank voucher dialogs decide
  // `partnerType`, so a hand-typed name always resolves to `OTHER` even when
  // `partnerKind` still carries a stale catalogue value.
  const { partnerType } = resolvePartyFields({
    partnerId: state.partnerId,
    partnerKind: state.partnerKind,
    partnerName: state.counterpartyName,
  });
  return {
    kind: LedgerCashVoucherKindEnum.PAYMENT,
    purpose: state.purpose,
    paymentPurpose: state.paymentPurpose,
    voucherNo: state.voucherNo,
    voucherDate: new Date(state.voucherDate),
    partnerKind: state.partnerKind,
    partnerType,
    partnerId: state.partnerId || undefined,
    counterpartyCode: state.counterpartyCode,
    counterpartyName: state.counterpartyName,
    payerName: state.payerName,
    address: state.address,
    reason: state.reason,
    staffId: state.staffId || undefined,
    employeeCode: state.employeeCode,
    employeeName: state.employeeName,
    reference: state.reference || undefined,
    lines: state.lines.map((l) => ({
      description: l.description,
      amount: Number(l.amount) || 0,
      category: l.category,
      categoryId: l.categoryId,
    })),
    documentLines: state.documentLines,
    transferAccountId: state.transferAccountId || undefined,
  };
}
