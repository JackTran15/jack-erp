import type { LedgerCashVoucherDetail } from "./ledger-cash/ledger-cash.types";
import {
  CashReceiptPurpose,
  CashPaymentPurpose,
  type CreateCashPaymentBody,
  type CreateCashReceiptBody,
  type CreateDebtCollectionBody,
  type CreateSupplierDebtPaymentBody,
} from "./cash-vouchers.types";
import { toIsoDate } from "./documents/_shared/voucher-dialog.utils";
import { lookupTypeToPartnerType } from "./documents/_shared/voucher-partner.constants";

function mapPartnerFields(detail: LedgerCashVoucherDetail) {
  const partnerType =
    detail.partnerType ??
    (detail.partnerId && detail.partnerKind
      ? lookupTypeToPartnerType(detail.partnerKind)
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
): CreateCashReceiptBody {
  const lines = detail.lines.map((l) => ({
    description: l.description,
    amount: Number(l.amount) || 0,
    categoryId: l.categoryId || undefined,
  }));
  const totalAmount = lines.reduce((s, l) => s + l.amount, 0);
  return {
    documentNumber: detail.voucherNo || undefined,
    voucherDate: toIsoDate(detail.voucherDate),
    purpose:
      detail.purpose === "debt_collection"
        ? CashReceiptPurpose.DEBT_COLLECTION
        : CashReceiptPurpose.OTHER,
    payerName: detail.payerName ?? detail.counterpartyName,
    reason: detail.reason,
    ...mapPartnerFields(detail),
    cashAccountId,
    // contraAccountId omitted — resolved server-side from the purpose.
    totalAmount,
    lines,
  };
}

/**
 * Build the debt-collection payload from a "Thu nợ" receipt detail: each picked
 * invoice (documentLines) becomes an allocation {invoiceDebtId, amount}. The
 * backend settles each debt + credits the cash fund atomically (saga).
 */
export function ledgerDetailToDebtCollectionBody(
  detail: LedgerCashVoucherDetail,
  cashAccountId: string,
): CreateDebtCollectionBody {
  const allocations = (detail.documentLines ?? [])
    .filter((d) => d.debtId && Number(d.collectAmount) > 0)
    .map((d) => ({
      invoiceDebtId: d.debtId as string,
      amount: Number(d.collectAmount) || 0,
    }));
  return {
    voucherDate: toIsoDate(detail.voucherDate),
    payerName: detail.payerName ?? detail.counterpartyName,
    reason: detail.reason,
    ...mapPartnerFields(detail),
    cashAccountId,
    allocations,
  };
}

export function ledgerDetailToCreatePaymentBody(
  detail: LedgerCashVoucherDetail,
  cashAccountId: string,
): CreateCashPaymentBody {
  const lines = detail.lines.map((l) => ({
    description: l.description,
    amount: Number(l.amount) || 0,
    categoryId: l.categoryId || undefined,
  }));
  const totalAmount = lines.reduce((s, l) => s + l.amount, 0);
  return {
    documentNumber: detail.voucherNo || undefined,
    voucherDate: toIsoDate(detail.voucherDate),
    purpose: detail.paymentPurpose ?? CashPaymentPurpose.OTHER,
    payeeName: detail.payerName ?? detail.counterpartyName,
    reason: detail.reason,
    ...mapPartnerFields(detail),
    cashAccountId,
    // contraAccountId omitted — resolved server-side from the purpose. NOTE:
    // transfer sub-options (cash→bank, branch transfer) currently resolve by
    // purpose too; booking them against the destination account is follow-up.
    totalAmount,
    lines,
  };
}

export function ledgerDetailToSupplierDebtPaymentBody(
  detail: LedgerCashVoucherDetail,
  cashAccountId: string,
): CreateSupplierDebtPaymentBody {
  const allocations = (detail.documentLines ?? [])
    .filter((d) => d.debtId && Number(d.collectAmount) > 0)
    .map((d) => ({
      supplierDebtId: d.debtId as string,
      amount: Number(d.collectAmount) || 0,
    }));
  return {
    voucherDate: toIsoDate(detail.voucherDate),
    payeeName: detail.payerName ?? detail.counterpartyName,
    reason: detail.reason,
    ...mapPartnerFields(detail),
    cashAccountId,
    allocations,
  };
}
