import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiClient } from "../../lib/api-axios";
import {
  buildOpeningLedgerRow,
  cashLedgerRowToUiRow,
} from "../../pages/treasury/cash-vouchers.adapters";
import type { CashLedgerResult } from "../../pages/treasury/cash-vouchers.types";
import type { LedgerCashRow } from "../../pages/treasury/ledger-cash/ledger-cash.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

/** What the ledger table renders. */
interface CashLedgerView {
  openingRow: LedgerCashRow | null;
  transactionRows: LedgerCashRow[];
  total: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/** Map the API result onto the rows the ledger table renders. */
function toView(query: UseQueryResult<CashLedgerResult>): CashLedgerView {
  const result = query.data;
  const base = {
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
  if (!result) {
    return {
      openingRow: null,
      transactionRows: [],
      total: 0,
      totalDebit: 0,
      totalCredit: 0,
      closingBalance: 0,
      ...base,
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
    ...base,
  };
}

/**
 * Per-column cash ledger search — `POST /v2/cash-ledger/search`.
 *
 * Replaces the offset-only `GET /cash-ledger` call this page used to make, where
 * no column could be filtered because the voucher/counterparty values were
 * resolved after the page query. Both endpoints run through CashLedgerService,
 * so the response shape is identical.
 */
export function useCashLedgerSearch(
  body: Record<string, unknown>,
  enabled = true,
): CashLedgerView {
  const query = useQuery({
    queryKey: treasuryQueryKeys.cashLedgerSearch(body),
    queryFn: async () => {
      const { data } = await apiClient.post<CashLedgerResult>(
        "/v2/cash-ledger/search",
        body,
      );
      return data;
    },
    enabled,
    staleTime: 30_000,
  });

  return toView(query);
}
