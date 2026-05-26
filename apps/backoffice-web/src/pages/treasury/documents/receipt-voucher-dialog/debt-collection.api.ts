import { apiClient } from "../../../../lib/api-axios";
import type { LedgerCashVoucherDocumentLine } from "../../ledger-cash/ledger-cash.types";

export enum InvoiceDebtStatusApi {
  OPEN = "open",
  PAID = "paid",
  OVERDUE = "overdue",
}

export interface InvoiceDebtApiRow {
  id: string;
  referenceCode: string;
  invoiceId: string;
  customerId: string;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  issuedAt: string;
  status: InvoiceDebtStatusApi;
}

function toMoney(value: string | number | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchCustomerOpenDebts(
  customerId: string,
): Promise<InvoiceDebtApiRow[]> {
  const { data } = await apiClient.get<InvoiceDebtApiRow[]>(
    `/invoices/customers/${customerId}/debts`,
    { params: { status: InvoiceDebtStatusApi.OPEN } },
  );
  return data ?? [];
}

export function mapInvoiceDebtToDocumentLine(
  debt: InvoiceDebtApiRow,
  collectAmount: number,
): LedgerCashVoucherDocumentLine {
  const debtAmount = toMoney(debt.originalAmount);
  const collectedAmount = toMoney(debt.paidAmount);
  const remainingAmount = toMoney(debt.remainingAmount);
  return {
    debtId: debt.id,
    invoiceId: debt.invoiceId,
    documentDate: new Date(debt.issuedAt),
    documentNo: debt.referenceCode,
    debtAmount,
    collectedAmount,
    remainingAmount,
    collectAmount,
  };
}

export function mapInvoiceDebtsToPickRows(
  debts: InvoiceDebtApiRow[],
): LedgerCashVoucherDocumentLine[] {
  return debts.map((d) =>
    mapInvoiceDebtToDocumentLine(d, toMoney(d.remainingAmount)),
  );
}
