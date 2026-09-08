import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-axios";
import { useBranchStore } from "../store/common/branch/branch.store";
import { usePermissionCheck } from "./usePermissionCheck";

export function useImportableTransferOrderCount() {
  const activeBranchId = useBranchStore((state) => state.branchId);
  const canRead = usePermissionCheck(["inventory.transfer.read"]).has(
    "inventory.transfer.read",
  );

  return useQuery({
    queryKey: ["inventory-transfer-orders-importable-count", activeBranchId],
    queryFn: async () => {
      const { data } = await apiClient.get<{ count: number }>(
        "/inventory/transfer-orders/importable/count",
      );
      return data.count;
    },
    enabled: Boolean(activeBranchId) && canRead,
    staleTime: 30_000,
  });
}
