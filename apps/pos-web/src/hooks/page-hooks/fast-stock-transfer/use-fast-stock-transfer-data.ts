import { useBranchShowrooms } from "@erp/pos/hooks/react-query/use-query-inventory";
import { useBranchStorages } from "@erp/pos/hooks/react-query/use-query-inventory";
import {
  usePreloadTempWarehouseCarriers,
  useTempWarehouseLines,
  useTempWarehouseNettedLines,
} from "@erp/pos/hooks/react-query/use-query-temp-warehouse";
import { useTempWarehouseMutations } from "@erp/pos/hooks/react-query/use-query-temp-warehouse";
import { useTempWarehouseActiveSession } from "@erp/pos/hooks/react-query/use-query-temp-warehouse";
import type { FastStockTransferData } from "@erp/pos/interfaces/fast-stock-transfer.interface";
import type { FastStockTransferConfirmRow } from "@erp/pos/interfaces/fast-stock-transfer.interface";
import {
  defaultWarehouseFilterIds,
  resolveInventoryPickerLabel,
  toShowroomPickerOptions,
  toStoragePickerOptions,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-warehouse-defaults";
import type { InventoryLocationPickerOption } from "@erp/pos/interfaces/inventory-location.interface";
import {
  attachTransferSelection,
  buildBalancedLineIds,
  filterImbalancedNettedItems,
  lineMatchesTableFilters,
  lineProductName,
  lineQuantityDisplay,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosFastStockTransferPickerStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-picker.store";
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

  // A branch holds up to two ACTIVE sessions — one per direction.
  const { data: w2sSession, isLoading: w2sLoading } =
    useTempWarehouseActiveSession(
      branchId,
      TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
    );
  const { data: s2wSession, isLoading: s2wLoading } =
    useTempWarehouseActiveSession(
      branchId,
      TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
    );
  const sessionLoading = w2sLoading || s2wLoading;
  // Session for the direction currently being viewed.
  const session =
    direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM
      ? w2sSession
      : s2wSession;
  const sessionId = session?.id ?? null;
  const hasActiveSession = Boolean(w2sSession || s2wSession);
  const isSessionClosed = session?.status === TempWarehouseSessionStatus.CLOSED;

  // NET_OFFSET (đối cộng trừ) is only valid when BOTH direction sessions exist
  // and share the same warehouse + showroom locations.
  const netOffsetEligible = Boolean(
    w2sSession &&
      s2wSession &&
      w2sSession.warehouseLocationId === s2wSession.warehouseLocationId &&
      w2sSession.showroomLocationId === s2wSession.showroomLocationId,
  );

  // Unticking "Hiển thị dòng cần kiểm tra" surfaces the sale-consumed
  // (TRANSFERRED-by-sale) rows alongside the ACTIVE working set.
  const includeTransferred = !filters.showRowsNeedingReview;
  const outboundQuery = useTempWarehouseLines(
    branchId,
    TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
    !isSessionClosed,
    includeTransferred,
  );
  const returnQuery = useTempWarehouseLines(
    branchId,
    TempWarehouseDirection.SHOWROOM_TO_WAREHOUSE,
    !isSessionClosed,
    includeTransferred,
  );
  // Net across BOTH direction sessions (branch-scoped), not a single session.
  const nettedQuery = useTempWarehouseNettedLines(branchId, null);

  const {
    refetchTempWarehouse: refetchTempWarehouseQuery,
    addLineMutation,
    updateLineMutation,
    closeSessionMutation,
    transferLinesMutation,
  } = useTempWarehouseMutations(branchId);

  const { isLoading: carriersLoading } = usePreloadTempWarehouseCarriers(branchId);
  const catalogDirection = usePosFastStockTransferPickerStore(
    (s) => s.catalogDirection,
  );
  const findCatalogProduct = usePosFastStockTransferPickerStore(
    (s) => s.findProduct,
  );
  const resolveCarrierById = usePosFastStockTransferPickerStore(
    (s) => s.getCarrierById,
  );

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

  // Exclude the auto-generated showroom-backing storage (isMainStorage); the
  // transfer pickers, the ">= 2 storages" gating, and the default selection
  // only consider real storage warehouses.
  const storages = useMemo(
    () => (storagesData ?? []).filter((s) => !s.isMainStorage),
    [storagesData],
  );
  const showrooms = useMemo(() => showroomsData ?? [], [showroomsData]);
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

  const isLoading =
    sessionLoading ||
    outboundQuery.isLoading ||
    returnQuery.isLoading ||
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

  // Closing is branch-wide: enabled when at least one direction session is active.
  const canCloseTransfer =
    hasActiveSession && !editingRowId && totalActiveLineCount > 0;

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
    netOffsetEligible,
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
    catalogDirection,
    findCatalogProduct,
    resolveCarrierById,
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
