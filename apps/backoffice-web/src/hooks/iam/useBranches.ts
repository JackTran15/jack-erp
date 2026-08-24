import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { IAM_PERMISSION_KEYS } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { usePermissionCheck } from "../usePermissionCheck";

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

export function useBranches(enabled = true): UseQueryResult<BranchOption[]> {
  return useQuery({
    enabled,
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

export function useMyBranches(enabled = true): UseQueryResult<BranchOption[]> {
  return useQuery({
    enabled,
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

/**
 * Branches the signed-in user may assign to an employee. `iam.user.branches.write.all`
 * lifts the scope to the whole organization; without it the user can only staff
 * the branches they belong to, so `/branches/me` (already filtered server-side
 * against `user_branch_assignments`) is the right source.
 */
export function useAssignableBranches(): UseQueryResult<BranchOption[]> {
  const { has } = usePermissionCheck();
  const unrestricted = has(IAM_PERMISSION_KEYS.USER_BRANCHES_WRITE_ALL);

  // Both hooks run unconditionally (rules of hooks); `enabled` keeps the unused
  // one from firing a request.
  const all = useBranches(unrestricted);
  const mine = useMyBranches(!unrestricted);
  return unrestricted ? all : mine;
}

export function useInvalidateBranches(): () => void {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: BRANCHES_QUERY_KEY });
    qc.invalidateQueries({ queryKey: ["branches", "me"] });
    qc.invalidateQueries({
      queryKey: ["crud", "inventory-storages", "records"],
    });
    // Deactivating a branch changes what every branch picker may show, and
    // these two feed the report filters. Without them a store stays selectable
    // in reports until the cache goes stale on its own.
    qc.invalidateQueries({ queryKey: ["filter-options", "branches"] });
    qc.invalidateQueries({ queryKey: ["report-filter-options"] });
  };
}
