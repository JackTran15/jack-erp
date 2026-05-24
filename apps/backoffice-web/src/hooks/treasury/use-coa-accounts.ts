import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import type { CoaAccount, PaginatedList } from "../../pages/treasury/cash-vouchers.types";
import { treasuryQueryKeys } from "./treasury-query-keys";

export function useCoaAccounts() {
  return useQuery({
    queryKey: treasuryQueryKeys.coaAccounts(),
    queryFn: async () => {
      const res = await requireErpData(
        await erpApi.GET<PaginatedList<CoaAccount> | CoaAccount[]>("/accounts", {
          params: { query: { page: 1, pageSize: 100 } },
        }),
      );
      if (Array.isArray(res)) return res;
      return res.data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}
