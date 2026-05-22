import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import type { CashAccountsListResponse } from "../../pages/treasury/cash-vouchers.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

export function useCashAccounts(branchId?: string) {
  return useQuery({
    queryKey: treasuryQueryKeys.cashAccounts(branchId),
    queryFn: async () => {
      const res = await requireErpData(
        await erpApi.GET<CashAccountsListResponse>("/cash/accounts", {
          params: {
            query: {
              page: 1,
              pageSize: 100,
              ...(branchId ? { branchId } : {}),
            },
          },
        }),
      );
      return res.data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useCashAccount(id: string | undefined) {
  const { data: accounts } = useCashAccounts();
  return accounts?.find((a) => a.id === id);
}
