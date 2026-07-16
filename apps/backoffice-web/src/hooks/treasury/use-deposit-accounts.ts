import { useQuery } from "@tanstack/react-query";
import {
  DepositAccountStatus,
  type DepositAccount,
  type PaginatedResponse,
} from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { treasuryQueryKeys } from "./treasury-query-keys";

const ENTITY_KEY = "deposit-accounts";

/** ACTIVE deposit accounts for the current branch (generic CRUD list), used by the ledger account picker. */
export function useDepositAccounts() {
  return useQuery({
    queryKey: treasuryQueryKeys.depositAccounts(),
    queryFn: async () => {
      const res = await requireErpData(
        await erpApi.GET<PaginatedResponse<DepositAccount>>(
          "/admin/entities/{entityKey}/records",
          {
            params: {
              path: { entityKey: ENTITY_KEY },
              query: {
                page: 1,
                pageSize: 100,
                filters: JSON.stringify({ status: DepositAccountStatus.ACTIVE }),
              },
            },
          },
        ),
      );
      return res.data ?? [];
    },
    staleTime: 60_000,
  });
}
