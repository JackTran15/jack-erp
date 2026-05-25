import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiClient } from "../../../../lib/api-axios";
import { treasuryQueryKeys } from "../../../../hooks/treasury/treasury-query-keys";
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
  documentType?: string;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  issuedAt: string;
  dueDate?: string | null;
  settledAt?: string | null;
  status: string;
  note?: string | null;
}

interface CustomerDebtsResponse {
  data: InvoiceDebtApiRow[];
  totalRemaining: number;
  totalOriginal: number;
  count: number;
}

function toMoney(value: string | number | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchCustomerOpenDebtsRaw(
  customerId: string,
): Promise<InvoiceDebtApiRow[]> {
  const { data } = await apiClient.get<CustomerDebtsResponse>(
    "/cash-vouchers/partners/debts",
    { params: { customerId, status: InvoiceDebtStatusApi.OPEN } },
  );
  return data?.data ?? [];
}

const STALE_TIME = 60_000;

export function fetchCustomerOpenDebts(
  qc: QueryClient,
  customerId: string,
): Promise<InvoiceDebtApiRow[]> {
  return qc.fetchQuery({
    queryKey: treasuryQueryKeys.customerDebts(customerId),
    queryFn: () => fetchCustomerOpenDebtsRaw(customerId),
    staleTime: STALE_TIME,
  });
}

export function useCustomerOpenDebts() {
  const qc = useQueryClient();
  return useCallback(
    (customerId: string) => fetchCustomerOpenDebts(qc, customerId),
    [qc],
  );
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
