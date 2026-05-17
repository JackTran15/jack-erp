import { useBranchShowrooms } from "@erp/pos/hooks/common/use-branch-showrooms";
import { useBranchStorages } from "@erp/pos/hooks/common/use-branch-storages";
import { useFastStockTransferCarriers } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-carriers";
import { useFastStockTransferCatalog } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-catalog";
import {
  useTempWarehouseLines,
  useTempWarehouseNettedLines,
} from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-temp-warehouse-lines";
import { useTempWarehouseMutations } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-temp-warehouse-mutations";
import { useTempWarehouseActiveSession } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-temp-warehouse-session";
import type { PosCatalogDirection } from "@erp/pos/lib/page-libs/checkout/posCatalogApi";
import type { FastStockTransferData } from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-data.types";
import type { FastStockTransferConfirmRow } from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer.types";
import {
  defaultWarehouseFilterIds,
  resolveInventoryPickerLabel,
  toShowroomPickerOptions,
  toStoragePickerOptions,
  type InventoryLocationPickerOption,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-warehouse-defaults";
import {
  attachTransferSelection,
  buildBalancedLineIds,
  filterImbalancedNettedItems,
  lineMatchesTableFilters,
  lineProductName,
  lineQuantityDisplay,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";
import {
  TempWarehouseDirection,
  TempWarehouseLine,
  TempWarehouseSessionStatus,
} from "@erp/shared-interfaces";
import { useCallback, useMemo } from "react";

export function useFastStockTransferData(): FastStockTransferData {
  const branchId = usePosBranchStore((s) => s.branchId);

  const direction = usePosFastStockTransferWorkflowStore((s) => s.direction);
  const filters = usePosFastStockTransferWorkflowStore((s) => s.filters);
  const transferSelectedByLineId = usePosFastStockTransferWorkflowStore(
    (s) => s.transferSelectedByLineId,
  );
  const hiddenLineIds = usePosFastStockTransferWorkflowStore(
    (s) => s.hiddenLineIds,
  );
  const editingRowId = usePosFastStockTransferWorkflowStore(
    (s) => s.editingRowId,
  );
  const toolbarDraft = usePosFastStockTransferWorkflowStore(
    (s) => s.toolbarDraft,
  );
  const editableDraft = usePosFastStockTransferWorkflowStore(
    (s) => s.editableDraft,
  );

  const hiddenLineIdSet = useMemo(
    () => new Set(hiddenLineIds),
    [hiddenLineIds],
  );

  const { data: session, isLoading: sessionLoading } =
    useTempWarehouseActiveSession(branchId);
  const sessionId = session?.id ?? null;
  const isSessionClosed = session?.status === TempWarehouseSessionStatus.CLOSED;

  const outboundQuery = useTempWarehouseLines(
    branchId,
    TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
    !isSessionClosed,
  );
  const returnQuery = useTempWarehouseLines(
    branchId,
    TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
    !isSessionClosed,
  );
  const nettedQuery = useTempWarehouseNettedLines(branchId, sessionId);

  const {
    refetchTempWarehouse: refetchTempWarehouseQuery,
    addLineMutation,
    updateLineMutation,
    closeSessionMutation,
    transferLinesMutation,
  } = useTempWarehouseMutations(branchId);

  const catalogDirection = useMemo((): PosCatalogDirection => {
    return direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM
      ? "warehouse"
      : "showroom";
  }, [direction]);

  const {
    searchCatalogProducts,
    handleCatalogQueryChange,
    findCatalogProduct,
    catalogLoading,
    reloadCatalog,
    catalogLines,
  } = useFastStockTransferCatalog(branchId, catalogDirection);

  const {
    data: storagesData,
    isLoading: storagesLoading,
    refetch: refetchStoragesQuery,
  } = useBranchStorages(branchId);
  const {
    data: showroomsData,
    isLoading: showroomsLoading,
    refetch: refetchShowroomsQuery,
  } = useBranchShowrooms(branchId);

  const storages = storagesData ?? [];
  const showrooms = showroomsData ?? [];
  const locationsLoading = storagesLoading || showroomsLoading;

  const visibleLinesFromQueries = useMemo(() => {
    const filterHidden = <T extends { id: string }>(lines: ReadonlyArray<T>) =>
      lines.filter((line) => !hiddenLineIdSet.has(line.id));
    return {
      outbound: filterHidden(outboundQuery.data?.data ?? []),
      inbound: filterHidden(returnQuery.data?.data ?? []),
    };
  }, [hiddenLineIdSet, outboundQuery.data?.data, returnQuery.data?.data]);

  const allLinesForBalance = useMemo(
    () => [
      ...visibleLinesFromQueries.outbound,
      ...visibleLinesFromQueries.inbound,
    ],
    [visibleLinesFromQueries],
  );

  const pinnedCarriers = useMemo(
    () => [
      toolbarDraft.carrier,
      editableDraft?.carrier,
      ...allLinesForBalance.map((line) => line.carrier),
    ],
    [toolbarDraft.carrier, editableDraft?.carrier, allLinesForBalance],
  );

  const {
    searchFastStockCarriers,
    handleCarrierQueryChange,
    carriersLoading,
    resolveCarrierById,
  } = useFastStockTransferCarriers(branchId, pinnedCarriers);

  const isLoading =
    sessionLoading ||
    outboundQuery.isLoading ||
    returnQuery.isLoading ||
    catalogLoading ||
    carriersLoading ||
    locationsLoading;

  const isMutating =
    addLineMutation.isPending ||
    updateLineMutation.isPending ||
    closeSessionMutation.isPending ||
    transferLinesMutation.isPending;

  const balancedLineIds = useMemo(
    () => buildBalancedLineIds(allLinesForBalance),
    [allLinesForBalance],
  );

  const isLineBalanced = useCallback(
    (lineId: string) => balancedLineIds.has(lineId),
    [balancedLineIds],
  );

  const mapQueryToRows = useCallback(
    (lines: ReadonlyArray<TempWarehouseLine>) =>
      lines.map((line) =>
        attachTransferSelection(
          line,
          transferSelectedByLineId[line.id] ?? false,
        ),
      ),
    [transferSelectedByLineId],
  );

  const outboundRows = useMemo(
    () => mapQueryToRows(visibleLinesFromQueries.outbound),
    [mapQueryToRows, visibleLinesFromQueries.outbound],
  );
  const returnRows = useMemo(
    () => mapQueryToRows(visibleLinesFromQueries.inbound),
    [mapQueryToRows, visibleLinesFromQueries.inbound],
  );

  const rowsByDirection = useMemo(
    () => ({
      [TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM]: outboundRows,
      [TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE]: returnRows,
    }),
    [outboundRows, returnRows],
  );

  const sourceWarehouseOptions =
    useMemo((): InventoryLocationPickerOption[] => {
      if (direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM) {
        return toStoragePickerOptions(storages);
      }
      return toShowroomPickerOptions(showrooms);
    }, [direction, storages, showrooms]);

  const destinationWarehouseOptions =
    useMemo((): InventoryLocationPickerOption[] => {
      if (direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM) {
        return toShowroomPickerOptions(showrooms);
      }
      return toStoragePickerOptions(storages);
    }, [direction, storages, showrooms]);

  const rows = useMemo(
    () =>
      rowsByDirection[direction].filter((row) =>
        lineMatchesTableFilters(row, filters, balancedLineIds),
      ),
    [rowsByDirection, direction, filters, balancedLineIds],
  );

  const totalActiveLineCount = outboundRows.length + returnRows.length;

  const discrepancyItems = useMemo(
    () => filterImbalancedNettedItems(nettedQuery.data?.items ?? []),
    [nettedQuery.data?.items],
  );

  const selectedDialogRows = useMemo<
    ReadonlyArray<FastStockTransferConfirmRow>
  >(() => {
    const source =
      resolveInventoryPickerLabel(
        filters.sourceWarehouse,
        sourceWarehouseOptions,
      ) || "Kho xuất";
    const dest =
      resolveInventoryPickerLabel(
        filters.destinationWarehouse,
        destinationWarehouseOptions,
      ) || "Kho nhập";
    return [...outboundRows, ...returnRows]
      .filter((row) => row.isTransferSelected)
      .map((row) => ({
        id: row.id,
        productName: lineProductName(row),
        sourceWarehouse: source,
        destinationWarehouse: dest,
        quantity: lineQuantityDisplay(row),
      }));
  }, [
    filters.destinationWarehouse,
    filters.sourceWarehouse,
    outboundRows,
    returnRows,
    sourceWarehouseOptions,
    destinationWarehouseOptions,
  ]);

  const canProcess =
    selectedDialogRows.length > 0 &&
    !editingRowId &&
    !isSessionClosed &&
    Boolean(sessionId);

  const canCloseTransfer =
    Boolean(sessionId) &&
    !editingRowId &&
    !isSessionClosed &&
    totalActiveLineCount > 0;

  const isLinesRefetching =
    outboundQuery.isFetching ||
    returnQuery.isFetching ||
    nettedQuery.isFetching;

  const outboundLineIds = useMemo(
    () => (outboundQuery.data?.data ?? []).map((line) => line.id),
    [outboundQuery.data?.data],
  );

  const returnLineIds = useMemo(
    () => (returnQuery.data?.data ?? []).map((line) => line.id),
    [returnQuery.data?.data],
  );

  const refetchLines = useCallback(async () => {
    await Promise.all([
      outboundQuery.refetch(),
      returnQuery.refetch(),
      nettedQuery.refetch(),
    ]);
  }, [outboundQuery, returnQuery, nettedQuery]);

  return {
    branchId,
    sessionId,
    isSessionClosed,
    direction,
    filters,
    toolbarDraft,
    editableDraft,
    editingRowId,
    rows,
    rowsByDirection,
    outboundRows,
    returnRows,
    discrepancyItems,
    selectedDialogRows,
    canProcess,
    canCloseTransfer,
    isLoading,
    isMutating,
    isLinesRefetching,
    isLineBalanced,
    sourceWarehouseOptions,
    destinationWarehouseOptions,
    storages,
    showrooms,
    locationsLoading,
    searchCatalogProducts,
    handleCatalogQueryChange,
    catalogLoading,
    catalogLines,
    catalogDirection,
    searchFastStockCarriers,
    handleCarrierQueryChange,
    findCatalogProduct,
    resolveCarrierById,
    reloadCatalog,
    refetchStorages: async () => {
      await refetchStoragesQuery();
    },
    refetchShowrooms: async () => {
      await refetchShowroomsQuery();
    },
    refetchLines,
    refetchTempWarehouse: async () => {
      await refetchTempWarehouseQuery();
    },
    outboundLineIds,
    returnLineIds,
    defaultWarehouseFilterIds,
  };
}
