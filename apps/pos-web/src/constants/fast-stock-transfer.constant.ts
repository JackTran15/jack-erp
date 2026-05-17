import { TempWarehouseDirection } from "@erp/shared-interfaces";

export const FAST_STOCK_TRANSFER_TAB_OPTIONS: ReadonlyArray<{
  id: TempWarehouseDirection;
  label: string;
}> = [
  {
    id: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
    label: "Xuất đi",
  },
  {
    id: TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
    label: "Trả lại",
  },
];
