import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import {
  buildOpeningLedgerRow,
  cashLedgerRowToUiRow,
} from "../../pages/treasury/cash-vouchers.adapters";
import type {
  CashLedgerQuery,
  CashLedgerResult,
} from "../../pages/treasury/cash-vouchers.types";
import type { LedgerCashRow } from "../../pages/treasury/ledger-cash/ledger-cash.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

/** Fetch one offset page of the cash ledger directly from the API. */
export function useCashLedgerOffsetPage(
  params: CashLedgerQuery | null,
  page: number,
  pageSize: number,
  enabled = true,
): {
  openingRow: LedgerCashRow | null;
  transactionRows: LedgerCashRow[];
  total: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: treasuryQueryKeys.cashLedger({ ...params, page, pageSize }),
    queryFn: async () =>
      requireErpData(
        await erpApi.GET<CashLedgerResult>("/cash-ledger", {
          params: {
            query: {
              cashAccountId: params!.cashAccountId,
              dateFrom: params!.dateFrom,
              dateTo: params!.dateTo,
              branchId: params!.branchId,
              page,
              pageSize,
            },
          },
        }),
      ),
    enabled: enabled && Boolean(params),
    staleTime: 30_000,
  });

  const result = query.data;
  if (!result) {
    return {
      openingRow: null,
      transactionRows: [],
      total: 0,
      totalDebit: 0,
      totalCredit: 0,
      closingBalance: 0,
      isLoading: query.isLoading,
      isError: query.isError,
      refetch: () => void query.refetch(),
    };
  }

  return {
    // Opening row shows the balance carried into this page (global opening on page 1).
    openingRow: buildOpeningLedgerRow(result.pageOpeningBalance),
    transactionRows: result.rows.map(cashLedgerRowToUiRow),
    total: result.total,
    totalDebit: result.totalDebit,
    totalCredit: result.totalCredit,
    closingBalance: result.closingBalance,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
