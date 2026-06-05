import { useQuery } from "@tanstack/react-query";
import { branchService } from "@erp/pos/services/branch.service";
import { BRANCH_KEYS } from "@erp/pos/constants/react-query-key.constant";

export const useMyBranchesQuery = () =>
  useQuery({
    queryKey: BRANCH_KEYS.MY_BRANCHES,
    queryFn: () => branchService.listMyBranches(),
    staleTime: 5 * 60_000,
  });
