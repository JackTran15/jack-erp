import {
  listBranchShowrooms,
  type InventoryShowroomOption,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/inventory-location-api";
import { UseQueryResult, useQuery } from "@tanstack/react-query";

export const branchShowroomsQueryKey = (branchId: string) =>
  ["inventory-showrooms", branchId] as const;

export function useBranchShowrooms(
  branchId: string | null,
): UseQueryResult<ReadonlyArray<InventoryShowroomOption>, Error> {
  return useQuery({
    queryKey: branchShowroomsQueryKey(branchId ?? ""),
    queryFn: () => listBranchShowrooms(branchId as string),
    enabled: Boolean(branchId),
    staleTime: 30_000,
  });
}
