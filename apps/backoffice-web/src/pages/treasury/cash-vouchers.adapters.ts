import {
  LedgerCashDetailTypeEnum,
  LedgerCashVoucherKindEnum,
  LedgerCashVoucherPurposeEnum,
  type LedgerCashRow,
  type LedgerCashVoucherDetail,
  type LedgerCashVoucherLine,
} from "./ledger-cash/ledger-cash.types";
import {
  CashPayment,
  CashPaymentReferenceType,
  CashReceipt,
  CashReceiptReferenceType,
  CashLedgerRow,
  ReceiptPaymentKind,
  type CashPaymentLine,
  type CashReceiptLine,
  type ReceiptPaymentListItem,
} from "./cash-vouchers.types";
import { inferLookupType } from "./documents/_shared/voucher-partner.constants";
import {
  isAutoVoucherReference,
  receiptPaymentDocumentTypeLabel,
} from "./cash-vouchers.labels";

function num(v: unknown): number {
  return Number(v) || 0;
}

function counterpartyFromReceipt(r: CashReceipt): string {
  return (
    r.payerName?.trim() ||
    r.partnerNameSnapshot?.trim() ||
    ""
  );
}

function counterpartyFromPayment(p: CashPayment): string {
  return (
    p.payeeName?.trim() ||
    p.partnerNameSnapshot?.trim() ||
    ""
  );
}

export function toReceiptListItem(r: CashReceipt): ReceiptPaymentListItem {
  return {
    kind: ReceiptPaymentKind.RECEIPT,
    id: r.id,
    voucherDate: r.voucherDate,
    documentNumber: r.documentNumber ?? "",
    status: r.status,
    totalAmount: num(r.totalAmount),
    counterparty: counterpartyFromReceipt(r),
    reason: r.reason ?? "",
    referenceType: r.referenceType,
    isGoodsReceiptPayment: false,
    isAutoVoucher: isAutoVoucherReference(r.referenceType),
    receipt: r,
  };
}

export function toPaymentListItem(p: CashPayment): ReceiptPaymentListItem {
  const isGr = p.referenceType === CashPaymentReferenceType.GOODS_RECEIPT;
  return {
    kind: ReceiptPaymentKind.PAYMENT,
    id: p.id,
    voucherDate: p.voucherDate,
    documentNumber: p.documentNumber ?? "",
    status: p.status,
    totalAmount: num(p.totalAmount),
    counterparty: counterpartyFromPayment(p),
    reason: p.reason ?? "",
    referenceType: p.referenceType,
    isGoodsReceiptPayment: isGr,
    isAutoVoucher: isAutoVoucherReference(p.referenceType),
    payment: p,
  };
}

export function mergeReceiptPaymentLists(
  receipts: CashReceipt[],
  payments: CashPayment[],
): ReceiptPaymentListItem[] {
  const merged = [
    ...receipts.map(toReceiptListItem),
    ...payments.map(toPaymentListItem),
  ];
  merged.sort((a, b) => {
    const d = b.voucherDate.localeCompare(a.voucherDate);
    if (d !== 0) return d;
    return b.id.localeCompare(a.id);
  });
  return merged;
}

export function filterReceiptPaymentByPeriod(
  rows: ReceiptPaymentListItem[],
  fromIso: string | undefined,
  toIso: string | undefined,
): ReceiptPaymentListItem[] {
  if (!fromIso || !toIso) return rows;
  return rows.filter((r) => r.voucherDate >= fromIso && r.voucherDate <= toIso);
}

function mapVoucherLines(
  lines: CashReceiptLine[] | CashPaymentLine[] | undefined,
  categoryNames: Map<string, string>,
): LedgerCashVoucherLine[] {
  return (lines ?? []).map((l) => ({
    description: l.description,
    amount: num(l.amount),
    categoryId: l.categoryId,
    category: l.categoryId
      ? (categoryNames.get(l.categoryId) ?? l.categoryId)
      : "",
  }));
}

/** Bridge BE voucher → existing dialog shape (minimal mapper at UI boundary). */
export function cashReceiptToVoucherDetail(
  r: CashReceipt,
  categoryNames: Map<string, string> = new Map(),
): LedgerCashVoucherDetail {
  return {
    kind: LedgerCashVoucherKindEnum.RECEIPT,
    purpose:
      r.purpose === "DEBT_COLLECTION"
        ? LedgerCashVoucherPurposeEnum.DEBT_COLLECTION
        : LedgerCashVoucherPurposeEnum.OTHER,
    voucherNo: r.documentNumber ?? "",
    voucherDate: new Date(`${r.voucherDate}T12:00:00`),
    partnerType: r.partnerType,
    partnerId: r.partnerId,
    partnerKind: inferLookupType(r.partnerType),
    counterpartyCode: "",
    counterpartyName: r.partnerNameSnapshot ?? "",
    payerName: r.payerName,
    address: r.partnerAddressSnapshot,
    reason: r.reason ?? "",
    staffId: r.staffId,
    employeeCode: "",
    employeeName: "",
    reference: r.sourceLink?.sourceDocumentNumber ?? undefined,
    lines: mapVoucherLines(r.lines, categoryNames),
  };
}

export function cashPaymentToVoucherDetail(
  p: CashPayment,
  categoryNames: Map<string, string> = new Map(),
): LedgerCashVoucherDetail {
  const isGr = p.referenceType === CashPaymentReferenceType.GOODS_RECEIPT;
  return {
    kind: LedgerCashVoucherKindEnum.PAYMENT,
    purpose: LedgerCashVoucherPurposeEnum.OTHER,
    paymentPurpose: p.purpose,
    voucherNo: p.documentNumber ?? "",
    voucherDate: new Date(`${p.voucherDate}T12:00:00`),
    partnerType: p.partnerType,
    partnerId: p.partnerId,
    partnerKind: inferLookupType(p.partnerType),
    counterpartyCode: "",
    counterpartyName: p.partnerNameSnapshot ?? "",
    payerName: p.payeeName,
    address: p.partnerAddressSnapshot,
    reason: p.reason ?? "",
    staffId: p.staffId,
    employeeCode: "",
    employeeName: "",
    reference: p.sourceLink?.sourceDocumentNumber ?? undefined,
    lines: mapVoucherLines(p.lines, categoryNames),
    goodsReceipt: isGr
      ? {
          receiptNo: p.sourceLink?.sourceDocumentNumber ?? "",
          receiptDate: new Date(`${p.voucherDate}T12:00:00`),
          receiptTime: "",
          delivererName: p.payeeName ?? "",
          narrative: p.reason ?? "",
          purchaseEmployeeCode: "",
          purchaseEmployeeName: "",
        }
      : undefined,
  };
}

export function receiptPaymentToLedgerRow(
  item: ReceiptPaymentListItem,
  balance = 0,
): LedgerCashRow {
  const isReceipt = item.kind === ReceiptPaymentKind.RECEIPT;
  const detail: LedgerCashVoucherDetail = isReceipt
    ? cashReceiptToVoucherDetail(item.receipt!)
    : cashPaymentToVoucherDetail(item.payment!);

  return {
    id: item.id,
    documentDate: new Date(`${item.voucherDate}T12:00:00`),
    receiptNo: isReceipt ? item.documentNumber : undefined,
    paymentNo: isReceipt ? undefined : item.documentNumber,
    description: item.reason,
    amountIn: isReceipt ? item.totalAmount : 0,
    amountOut: isReceipt ? 0 : item.totalAmount,
    balance,
    counterparty: item.counterparty,
    employee: "",
    documentType: isReceipt
      ? ("cash_receipt" as LedgerCashRow["documentType"])
      : item.isGoodsReceiptPayment
        ? ("goods_receipt_payment" as LedgerCashRow["documentType"])
        : ("cash_payment" as LedgerCashRow["documentType"]),
    detail: { type: LedgerCashDetailTypeEnum.VOUCHER, data: detail },
  };
}

export function buildOpeningLedgerRow(balance: number): LedgerCashRow {
  return {
    id: "__opening__",
    documentDate: new Date(0),
    description: "Số dư đầu kỳ",
    amountIn: 0,
    amountOut: 0,
    balance,
    counterparty: "",
    employee: "",
    documentType: "opening_balance" as LedgerCashRow["documentType"],
    detail: {
      type: LedgerCashDetailTypeEnum.VOUCHER,
      data: {
        kind: LedgerCashVoucherKindEnum.RECEIPT,
        purpose: LedgerCashVoucherPurposeEnum.OTHER,
        voucherNo: "",
        voucherDate: new Date(0),
        counterpartyCode: "",
        counterpartyName: "",
        reason: "",
        employeeCode: "",
        employeeName: "",
        lines: [],
      },
    },
  };
}

export function cashLedgerRowToUiRow(row: CashLedgerRow): LedgerCashRow {
  const isPt = row.kind === "PT";
  const isPc = row.kind === "PC";
  return {
    id: row.movementId,
    apiVoucherId: row.voucherId ?? undefined,
    apiLedgerKind: row.kind,
    documentDate: new Date(row.date),
    receiptNo: isPt ? row.voucherNumber : undefined,
    paymentNo: isPc ? row.voucherNumber : undefined,
    description: row.description ?? "",
    amountIn: num(row.debit),
    amountOut: num(row.credit),
    balance: num(row.balance),
    counterparty: row.partnerName ?? "",
    employee: "",
    documentType: isPt
      ? ("cash_receipt" as LedgerCashRow["documentType"])
      : isPc
        ? ("cash_payment" as LedgerCashRow["documentType"])
        : ("cash_payment" as LedgerCashRow["documentType"]),
    detail: {
      type: LedgerCashDetailTypeEnum.VOUCHER,
      data: {
        kind: isPt
          ? LedgerCashVoucherKindEnum.RECEIPT
          : LedgerCashVoucherKindEnum.PAYMENT,
        purpose: LedgerCashVoucherPurposeEnum.OTHER,
        voucherNo: row.voucherNumber,
        voucherDate: new Date(row.date),
        counterpartyCode: "",
        counterpartyName: row.partnerName ?? "",
        reason: row.description ?? "",
        employeeCode: "",
        employeeName: "",
        lines: [],
      },
    },
  };
}

export { receiptPaymentDocumentTypeLabel };
