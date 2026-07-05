/** Một dòng hàng hoá trong bảng in tem. */
export interface BarcodeLabelRow {
  /** Key ổn định cho copy/xoá/filter (không phụ thuộc index). */
  rowId: string;
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  sellingPrice: number;
  storageId: string;
  storageName: string;
  locationId: string;
  locationCode: string;
  /** Số lượng tem cần in. */
  quantity: number;
  /** Đang resolve Kho/Vị trí sau khi chọn hàng. */
  locationLoading?: boolean;
}

export function makeEmptyRow(): BarcodeLabelRow {
  return {
    rowId: crypto.randomUUID(),
    itemId: "",
    sku: "",
    name: "",
    unit: "",
    sellingPrice: 0,
    storageId: "",
    storageName: "",
    locationId: "",
    locationCode: "",
    quantity: 0,
  };
}

export function isEmptyRow(row: BarcodeLabelRow): boolean {
  return !row.itemId && !row.sku;
}
