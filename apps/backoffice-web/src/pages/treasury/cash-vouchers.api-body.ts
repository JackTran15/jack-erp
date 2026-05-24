import type { LedgerCashVoucherDetail } from "./ledger-cash/ledger-cash.types";
import {
  CashReceiptPurpose,
  CashPaymentPurpose,
  type CreateCashPaymentBody,
  type CreateCashReceiptBody,
} from "./cash-vouchers.types";
import { toIsoDate } from "./documents/_shared/voucher-dialog.utils";
import { partnerKindToBeType } from "./documents/_shared/voucher-partner.constants";

function mapPartnerFields(detail: LedgerCashVoucherDetail) {
  const partnerType =
    detail.partnerType ??
    (detail.partnerId && detail.partnerKind
      ? partnerKindToBeType(detail.partnerKind)
      : undefined);
  return {
    partnerType,
    partnerId: detail.partnerId,
    staffId: detail.staffId,
  };
}

export function ledgerDetailToCreateReceiptBody(
  detail: LedgerCashVoucherDetail,
  cashAccountId: string,
  contraAccountId: string,
): CreateCashReceiptBody {
  const lines = detail.lines.map((l) => ({
    description: l.description,
    amount: Number(l.amount) || 0,
  }));
  const totalAmount = lines.reduce((s, l) => s + l.amount, 0);
  return {
    voucherDate: toIsoDate(detail.voucherDate),
    purpose:
      detail.purpose === "debt_collection"
        ? CashReceiptPurpose.DEBT_COLLECTION
        : CashReceiptPurpose.OTHER,
    payerName: detail.payerName ?? detail.counterpartyName,
    reason: detail.reason,
    ...mapPartnerFields(detail),
    cashAccountId,
    contraAccountId,
    totalAmount,
    lines,
  };
}

export function ledgerDetailToCreatePaymentBody(
  detail: LedgerCashVoucherDetail,
  cashAccountId: string,
  contraAccountId: string,
): CreateCashPaymentBody {
  const lines = detail.lines.map((l) => ({
    description: l.description,
    amount: Number(l.amount) || 0,
  }));
  const totalAmount = lines.reduce((s, l) => s + l.amount, 0);
  return {
    voucherDate: toIsoDate(detail.voucherDate),
    purpose: CashPaymentPurpose.OTHER,
    payeeName: detail.payerName ?? detail.counterpartyName,
    reason: detail.reason,
    ...mapPartnerFields(detail),
    cashAccountId,
    contraAccountId,
    totalAmount,
    lines,
  };
}
