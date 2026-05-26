import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiClient } from "../../../../lib/api-axios";
import { treasuryQueryKeys } from "../../../../hooks/treasury/treasury-query-keys";
import type { LedgerCashVoucherDocumentLine } from "../../ledger-cash/ledger-cash.types";

export interface SupplierDebtApiRow {
  id: string;
  referenceCode: string;
  goodsReceiptId: string;
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

interface SupplierDebtsResponse {
  data: SupplierDebtApiRow[];
  totalRemaining: number;
  totalOriginal: number;
  count: number;
}

function toMoney(value: string | number | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchSupplierOpenDebtsRaw(
  supplierId: string,
): Promise<SupplierDebtApiRow[]> {
  const { data } = await apiClient.get<SupplierDebtsResponse>(
    "/cash-vouchers/partners/supplier-debts",
    { params: { supplierId, status: "OPEN" } },
  );
  return data?.data ?? [];
}

const STALE_TIME = 60_000;

export function fetchSupplierOpenDebts(
  qc: QueryClient,
  supplierId: string,
): Promise<SupplierDebtApiRow[]> {
  return qc.fetchQuery({
    queryKey: treasuryQueryKeys.supplierDebts(supplierId),
    queryFn: () => fetchSupplierOpenDebtsRaw(supplierId),
    staleTime: STALE_TIME,
  });
}

export function useSupplierOpenDebts() {
  const qc = useQueryClient();
  return useCallback(
    (supplierId: string) => fetchSupplierOpenDebts(qc, supplierId),
    [qc],
  );
}

export function mapSupplierDebtToDocumentLine(
  debt: SupplierDebtApiRow,
  collectAmount: number,
): LedgerCashVoucherDocumentLine {
  const debtAmount = toMoney(debt.originalAmount);
  const collectedAmount = toMoney(debt.paidAmount);
  const remainingAmount = toMoney(debt.remainingAmount);
  return {
    debtId: debt.id,
    invoiceId: debt.goodsReceiptId,
    documentDate: new Date(debt.issuedAt),
    documentNo: debt.referenceCode,
    debtAmount,
    collectedAmount,
    remainingAmount,
    collectAmount,
  };
}

export function mapSupplierDebtsToPickRows(
  debts: SupplierDebtApiRow[],
): LedgerCashVoucherDocumentLine[] {
  return debts.map((d) =>
    mapSupplierDebtToDocumentLine(d, toMoney(d.remainingAmount)),
  );
}
