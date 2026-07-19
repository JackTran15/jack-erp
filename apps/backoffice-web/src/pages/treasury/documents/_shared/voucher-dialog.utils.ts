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

/** "BANK - Name - STK" — distinguishes deposit accounts sharing the same bank in a picker. */
export function formatDepositAccountLabel(account: {
  bankName: string;
  name: string;
  accountNo: string;
}): string {
  return `${account.bankName} - ${account.name} - ${account.accountNo}`;
}

import type { CashVoucherPartnerType } from "../../cash-vouchers.types";
import {
  lookupTypeToPartnerType,
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
  const partnerType: CashVoucherPartnerType | undefined = state.partnerId
    ? lookupTypeToPartnerType(state.partnerKind)
    : undefined;
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
  const partnerType: CashVoucherPartnerType | undefined = state.partnerId
    ? lookupTypeToPartnerType(state.partnerKind)
    : undefined;
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
