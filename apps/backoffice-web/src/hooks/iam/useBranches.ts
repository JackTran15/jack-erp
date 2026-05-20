import { useQuery } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";

export interface BranchOption {
  id: string;
  name: string;
}

interface BranchListResponse {
  data: BranchOption[];
  total: number;
}

export function useBranches() {
  return useQuery({
    queryKey: ["branches", "all"],
    queryFn: async () => {
      const res = await requireErpData(
        await erpApi.GET<BranchListResponse>("/branches", {
          params: { query: { page: 1, pageSize: 200 } },
        }),
      );
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
}
