import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/api-axios";
import { useBranchStore } from "../store/common/branch/branch.store";

export function useImportableTransferOrderCount() {
  const activeBranchId = useBranchStore((state) => state.branchId);

  return useQuery({
    queryKey: ["inventory-transfer-orders-importable-count", activeBranchId],
    queryFn: async () => {
      const { data } = await apiClient.get<unknown[]>(
        "/inventory/transfer-orders/importable",
      );
      return data.length;
    },
    enabled: Boolean(activeBranchId),
    staleTime: 30_000,
  });
}
