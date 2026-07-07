import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";

export interface BranchOption {
  id: string;
  name: string;
  /** Mã cửa hàng (vd "CM") — in ở cột phải của tem. */
  code?: string;
}

interface BranchListResponse {
  data: BranchOption[];
  total: number;
}

const BRANCHES_QUERY_KEY = ["branches", "all"] as const;

export function useBranches(): UseQueryResult<BranchOption[]> {
  return useQuery({
    queryKey: BRANCHES_QUERY_KEY,
    queryFn: async () => {
      const res = requireErpData(
        await erpApi.GET<BranchListResponse>("/branches", {
          params: { query: { page: 1, pageSize: 100 } },
        }),
      );
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useMyBranches(): UseQueryResult<BranchOption[]> {
  return useQuery({
    queryKey: ["branches", "me"] as const,
    queryFn: async () => {
      const res = requireErpData(
        await erpApi.GET<BranchOption[]>("/branches/me"),
      );
      return res;
    },
    staleTime: 5 * 60_000,
  });
}

export function useInvalidateBranches(): () => void {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: BRANCHES_QUERY_KEY });
    qc.invalidateQueries({
      queryKey: ["crud", "inventory-storages", "records"],
    });
  };
}
