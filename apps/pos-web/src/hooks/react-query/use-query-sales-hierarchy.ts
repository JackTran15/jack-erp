import { useQuery } from "@tanstack/react-query";

import { SALES_HIERARCHY_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { salesHierarchyService } from "@erp/pos/services/sales-hierarchy.service";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";

const STALE_TIME_MS = 5 * 60_000;

/**
 * Danh sách nhân viên bán hàng của chi nhánh đang active. branchId lấy từ
 * `usePosBranchStore`; query chỉ chạy khi đã chọn chi nhánh (`enabled`).
 */
export const useSalesmenQuery = () => {
  const branchId = usePosBranchStore((s) => s.branchId);
  const query = useQuery({
    queryKey: SALES_HIERARCHY_KEYS.SALESMEN(branchId ?? ""),
    queryFn: () => salesHierarchyService.listSalesmen(branchId as string),
    enabled: Boolean(branchId),
    staleTime: STALE_TIME_MS,
  });

  return {
    salesmen: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
};
