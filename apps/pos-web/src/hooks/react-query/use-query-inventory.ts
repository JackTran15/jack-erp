import { UseQueryResult, useQuery } from "@tanstack/react-query";

import { INVENTORY_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { inventoryService } from "@erp/pos/services/inventory.service";
import type {
  InventoryShowroomOption,
  InventoryStorageOption,
} from "@erp/pos/interfaces/inventory-location.interface";

export function useBranchStorages(
  branchId: string | null,
): UseQueryResult<ReadonlyArray<InventoryStorageOption>, Error> {
  return useQuery({
    queryKey: INVENTORY_KEYS.STORAGES(branchId ?? ""),
    queryFn: () => inventoryService.listBranchStorages(branchId as string),
    enabled: Boolean(branchId),
    staleTime: 30_000,
  });
}

export function useBranchShowrooms(
  branchId: string | null,
): UseQueryResult<ReadonlyArray<InventoryShowroomOption>, Error> {
  return useQuery({
    queryKey: INVENTORY_KEYS.SHOWROOMS(branchId ?? ""),
    queryFn: () => inventoryService.listBranchShowrooms(branchId as string),
    enabled: Boolean(branchId),
    staleTime: 30_000,
  });
}
