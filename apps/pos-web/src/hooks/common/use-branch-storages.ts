import {
  listBranchStorages,
  type InventoryStorageOption,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/inventory-location-api";
import { UseQueryResult, useQuery } from "@tanstack/react-query";

export const branchStoragesQueryKey = (branchId: string) =>
  ["inventory-storages", branchId] as const;

export function useBranchStorages(
  branchId: string | null,
): UseQueryResult<ReadonlyArray<InventoryStorageOption>, Error> {
  return useQuery({
    queryKey: branchStoragesQueryKey(branchId ?? ""),
    queryFn: () => listBranchStorages(branchId as string),
    enabled: Boolean(branchId),
    staleTime: 30_000,
  });
}
