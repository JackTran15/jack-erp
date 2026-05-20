import type { PosSelectSearchSuggestion } from "@erp/pos/components/common/PosSelectSearch/PosSelectSearch";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import type { PosCatalogDirection } from "@erp/pos/types/catalog.type";
import type {
  CatalogLocation,
  FastStockTransferTableRow,
} from "@erp/pos/types/fast-stock-transfer.type";
import type {
  InventoryLocationPickerOption,
  InventoryShowroomOption,
  InventoryStorageOption,
} from "@erp/pos/interfaces/inventory-location.interface";
import type { defaultWarehouseFilterIds } from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-warehouse-defaults";
import type {
  TempWarehouseDirection,
  TempWarehouseNettedItem,
  TempWarehousePublicUser,
} from "@erp/shared-interfaces";

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

/** Dòng xác nhận "Xử lý chuyển kho" (tổng hợp từ dòng đã chọn + nhãn kho filter). */
export interface FastStockTransferConfirmRow {
  id: string;
  productName: string;
  sourceWarehouse: string;
  destinationWarehouse: string;
  quantity: number;
}

/** Public surface of {@link useFastStockTransferData} (no TanStack Query types). */
export interface FastStockTransferData {
  branchId: string | null;
  sessionId: string | null;
  isSessionClosed: boolean;
  direction: TempWarehouseDirection;
  filters: FastStockTransferFilters;
  toolbarDraft: FastStockTransferToolbarDraft;
  editableDraft: FastStockTransferToolbarDraft | null;
  editingRowId: string | null;
  rows: ReadonlyArray<FastStockTransferTableRow>;
  rowsByDirection: Record<
    TempWarehouseDirection,
    ReadonlyArray<FastStockTransferTableRow>
  >;
  outboundRows: ReadonlyArray<FastStockTransferTableRow>;
  returnRows: ReadonlyArray<FastStockTransferTableRow>;
  discrepancyItems: ReadonlyArray<TempWarehouseNettedItem>;
  selectedDialogRows: ReadonlyArray<FastStockTransferConfirmRow>;
  canProcess: boolean;
  canCloseTransfer: boolean;
  isLoading: boolean;
  isMutating: boolean;
  isLinesRefetching: boolean;
  isLineBalanced: (lineId: string) => boolean;
  sourceWarehouseOptions: ReadonlyArray<InventoryLocationPickerOption>;
  destinationWarehouseOptions: ReadonlyArray<InventoryLocationPickerOption>;
  storages: ReadonlyArray<InventoryStorageOption>;
  showrooms: ReadonlyArray<InventoryShowroomOption>;
  locationsLoading: boolean;
  searchCatalogProducts: (
    query: string,
  ) => ReadonlyArray<PosSelectSearchSuggestion<PosCatalogLine>>;
  handleCatalogQueryChange: (query: string) => void;
  catalogLoading: boolean;
  catalogLines: ReadonlyArray<PosCatalogLine>;
  catalogDirection: PosCatalogDirection;
  searchFastStockCarriers: (
    query: string,
  ) => ReadonlyArray<PosSelectSearchSuggestion<TempWarehousePublicUser>>;
  handleCarrierQueryChange: (query: string) => void;
  findCatalogProduct: (itemId: string) => PosCatalogLine | null;
  resolveCarrierById: (userId: string) => TempWarehousePublicUser | null;
  reloadCatalog: () => Promise<void>;
  refetchStorages: () => Promise<void>;
  refetchShowrooms: () => Promise<void>;
  refetchLines: () => Promise<void>;
  refetchTempWarehouse: () => Promise<void>;
  outboundLineIds: ReadonlyArray<string>;
  returnLineIds: ReadonlyArray<string>;
  defaultWarehouseFilterIds: typeof defaultWarehouseFilterIds;
}
