import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import {
  buildOpeningLedgerRow,
  cashLedgerRowToUiRow,
  fetchCashLedgerAllPages,
  sliceLedgerForOffsetPage,
} from "../../pages/treasury/cash-vouchers.adapters";
import type {
  CashLedgerQuery,
  CashLedgerResult,
} from "../../pages/treasury/cash-vouchers.types";
import type { LedgerCashRow } from "../../pages/treasury/ledger-cash/ledger-cash.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

const LEDGER_FETCH_LIMIT = 500;

export function useCashLedgerBuffer(
  params: CashLedgerQuery | null,
  enabled = true,
) {
  return useQuery({
    queryKey: treasuryQueryKeys.cashLedger({ ...params, mode: "buffer" }),
    queryFn: async () => {
      if (!params?.cashAccountId) {
        throw new Error("cashAccountId is required");
      }
      const fetchPage = async (cursor?: string) =>
        requireErpData(
          await erpApi.GET<CashLedgerResult>("/cash-ledger", {
            params: {
              query: {
                cashAccountId: params.cashAccountId,
                dateFrom: params.dateFrom,
                dateTo: params.dateTo,
                branchId: params.branchId,
                cursor,
                limit: LEDGER_FETCH_LIMIT,
              },
            },
          }),
        );

      const { result, allRows } = await fetchCashLedgerAllPages(fetchPage);
      const uiRows = allRows.map(cashLedgerRowToUiRow);
      return { result, uiRows };
    },
    enabled: enabled && Boolean(params?.cashAccountId),
    staleTime: 30_000,
  });
}

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
  const buffer = useCashLedgerBuffer(params, enabled);

  if (!buffer.data) {
    return {
      openingRow: null,
      transactionRows: [],
      total: 0,
      totalDebit: 0,
      totalCredit: 0,
      closingBalance: 0,
      isLoading: buffer.isLoading,
      isError: buffer.isError,
      refetch: () => void buffer.refetch(),
    };
  }

  const slice = sliceLedgerForOffsetPage(
    buffer.data.result,
    buffer.data.uiRows,
    page,
    pageSize,
  );

  return {
    openingRow: buildOpeningLedgerRow(slice.openingBalance),
    transactionRows: slice.rows,
    total: slice.total,
    totalDebit: slice.totalDebit,
    totalCredit: slice.totalCredit,
    closingBalance: slice.closingBalance,
    isLoading: buffer.isLoading,
    isError: buffer.isError,
    refetch: () => void buffer.refetch(),
  };
}
