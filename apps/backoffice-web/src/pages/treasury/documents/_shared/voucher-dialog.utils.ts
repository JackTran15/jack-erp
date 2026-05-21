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

export function buildReceiptDetailFromForm(state: {
  purpose: LedgerCashVoucherPurposeEnum;
  counterpartyCode: string;
  counterpartyName: string;
  payerName: string;
  address: string;
  reason: string;
  employeeCode: string;
  employeeName: string;
  reference: string;
  voucherNo: string;
  voucherDate: string;
  lines: VoucherFormLine[];
  documentLines?: LedgerCashVoucherDetail["documentLines"];
}): LedgerCashVoucherDetail {
  return {
    kind: LedgerCashVoucherKindEnum.RECEIPT,
    purpose: state.purpose,
    voucherNo: state.voucherNo,
    voucherDate: new Date(state.voucherDate),
    counterpartyCode: state.counterpartyCode,
    counterpartyName: state.counterpartyName,
    payerName: state.payerName,
    address: state.address,
    reason: state.reason,
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
  counterpartyCode: string;
  counterpartyName: string;
  payerName: string;
  address: string;
  reason: string;
  employeeCode: string;
  employeeName: string;
  reference: string;
  voucherNo: string;
  voucherDate: string;
  lines: VoucherFormLine[];
  categoryDefault: string;
}): LedgerCashVoucherDetail {
  return {
    kind: LedgerCashVoucherKindEnum.PAYMENT,
    purpose: state.purpose,
    voucherNo: state.voucherNo,
    voucherDate: new Date(state.voucherDate),
    counterpartyCode: state.counterpartyCode,
    counterpartyName: state.counterpartyName,
    payerName: state.payerName,
    address: state.address,
    reason: state.reason,
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
