import type { PosCatalogLine } from "@erp/pos/lib/page-libs/checkout/posCatalogApi";
import type {
  TempWarehouseLine,
  TempWarehousePublicUser,
} from "@erp/shared-interfaces";

export type CatalogLocation = PosCatalogLine["locations"][number];

export interface FastStockTransferToolbarDraft {
  carrier: TempWarehousePublicUser | null;
  product: PosCatalogLine | null;
  location: CatalogLocation | null;
}

/** State filter header bảng (client-only). */
export interface FastStockTransferFilters {
  sourceWarehouse: string;
  destinationWarehouse: string;
  transporter: string;
  location: string;
  unit: string;
  productName: string;
  sku: string;
  showRowsNeedingReview: boolean;
}

/** Dòng bảng = line API + chọn chuyển kho (client-only). */
export type FastStockTransferTableRow = TempWarehouseLine & {
  isTransferSelected: boolean;
};

/** Dòng xác nhận “Xử lý chuyển kho” (tổng hợp từ dòng đã chọn + nhãn kho filter). */
export interface FastStockTransferConfirmRow {
  id: string;
  productName: string;
  sourceWarehouse: string;
  destinationWarehouse: string;
  quantity: number;
}
