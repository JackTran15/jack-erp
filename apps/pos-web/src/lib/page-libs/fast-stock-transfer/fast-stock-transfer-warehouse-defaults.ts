import type {
  InventoryShowroomOption,
  InventoryStorageOption,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/inventory-location-api";
import { TempWarehouseDirection } from "@erp/shared-interfaces";

export interface InventoryLocationPickerOption {
  id: string;
  name: string;
}

export function toStoragePickerOptions(
  storages: ReadonlyArray<InventoryStorageOption>,
): InventoryLocationPickerOption[] {
  return storages.map((s) => ({ id: s.id, name: s.name }));
}

export function toShowroomPickerOptions(
  showrooms: ReadonlyArray<InventoryShowroomOption>,
): InventoryLocationPickerOption[] {
  return showrooms.map((s) => ({ id: s.id, name: s.name }));
}

function pickDefaultStorageId(
  storages: ReadonlyArray<InventoryStorageOption>,
): string {
  return storages.find((s) => s.isMainStorage)?.id ?? storages[0]?.id ?? "";
}

function pickDefaultShowroomId(
  showrooms: ReadonlyArray<InventoryShowroomOption>,
): string {
  return showrooms.find((s) => s.isMainShowroom)?.id ?? showrooms[0]?.id ?? "";
}

export function resolveInventoryPickerLabel(
  id: string,
  options: ReadonlyArray<InventoryLocationPickerOption>,
): string {
  if (!id) return "";
  return options.find((o) => o.id === id)?.name ?? "";
}

export function defaultWarehouseFilterIds(
  direction: TempWarehouseDirection,
  storages: ReadonlyArray<InventoryStorageOption>,
  showrooms: ReadonlyArray<InventoryShowroomOption>,
): { sourceWarehouse: string; destinationWarehouse: string } {
  const storageId = pickDefaultStorageId(storages);
  const showroomId = pickDefaultShowroomId(showrooms);

  if (direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM) {
    return {
      sourceWarehouse: storageId,
      destinationWarehouse: showroomId,
    };
  }

  return {
    sourceWarehouse: showroomId,
    destinationWarehouse: storageId,
  };
}
