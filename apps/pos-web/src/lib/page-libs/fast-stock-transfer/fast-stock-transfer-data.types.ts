import type { PosSelectSearchSuggestion } from "@erp/pos/components/common/PosSelectSearch/PosSelectSearch";
import type {
  InventoryShowroomOption,
  InventoryStorageOption,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/inventory-location-api";
import type {
  PosCatalogDirection,
  PosCatalogLine,
} from "@erp/pos/lib/page-libs/checkout/posCatalogApi";
import type {
  FastStockTransferConfirmRow,
  FastStockTransferFilters,
  FastStockTransferTableRow,
  FastStockTransferToolbarDraft,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer.types";
import type { defaultWarehouseFilterIds } from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-warehouse-defaults";
import {
  TempWarehouseDirection,
  type TempWarehouseNettedItem,
  type TempWarehousePublicUser,
} from "@erp/shared-interfaces";
import type { InventoryLocationPickerOption } from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-warehouse-defaults";

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
