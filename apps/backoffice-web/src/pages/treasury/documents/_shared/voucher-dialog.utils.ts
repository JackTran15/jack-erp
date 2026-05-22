import {
  LedgerCashVoucherKindEnum,
  LedgerCashVoucherPurposeEnum,
  type LedgerCashVoucherDetail,
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

import type { CashVoucherPartnerType } from "../../cash-vouchers.types";
import {
  partnerKindToBeType,
  type VoucherPartnerKindUi,
} from "./voucher-partner.constants";

export function buildReceiptDetailFromForm(state: {
  purpose: LedgerCashVoucherPurposeEnum;
  partnerKind: VoucherPartnerKindUi;
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
    ? partnerKindToBeType(state.partnerKind)
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
    })),
    documentLines: state.documentLines,
  };
}

export function buildPaymentDetailFromForm(state: {
  purpose: LedgerCashVoucherPurposeEnum;
  partnerKind: VoucherPartnerKindUi;
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
  categoryDefault: string;
}): LedgerCashVoucherDetail {
  const partnerType: CashVoucherPartnerType | undefined = state.partnerId
    ? partnerKindToBeType(state.partnerKind)
    : undefined;
  return {
    kind: LedgerCashVoucherKindEnum.PAYMENT,
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
      category: l.category || state.categoryDefault,
    })),
  };
}
