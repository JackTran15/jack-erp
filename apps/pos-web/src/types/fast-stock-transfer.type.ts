import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import type { TempWarehouseLine } from "@erp/shared-interfaces";

export type CatalogLocation = PosCatalogLine["locations"][number];

/** Dòng bảng = line API + chọn chuyển kho (client-only). */
export type FastStockTransferTableRow = TempWarehouseLine & {
  isTransferSelected: boolean;
};
