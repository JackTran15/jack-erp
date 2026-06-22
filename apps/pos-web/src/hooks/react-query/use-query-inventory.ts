import { UseQueryResult, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { INVENTORY_KEYS } from "@erp/pos/constants/react-query-key.constant";
import type { PreferredShelfPair } from "@erp/pos/dtos/inventory.dto";
import type {
  InventoryShowroomOption,
  InventoryStorageOption,
} from "@erp/pos/interfaces/inventory-location.interface";
import { inventoryService } from "@erp/pos/services/inventory.service";

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

export function useLookupPreferredShelf() {
  return useCallback(async (pairs: ReadonlyArray<PreferredShelfPair>) => {
    if (!pairs.length) return [];
    return inventoryService.batchPreferredShelf(pairs);
  }, []);
}
