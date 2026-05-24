export interface InventoryStorageOption {
  id: string;
  name: string;
  branchId: string;
  isMainStorage: boolean;
}

export interface InventoryShowroomOption {
  id: string;
  name: string;
  branchId: string;
  storageId: string;
  isMainShowroom: boolean;
}

/** Lightweight {id,name} option for warehouse/showroom pickers + filters. */
export interface InventoryLocationPickerOption {
  id: string;
  name: string;
}
