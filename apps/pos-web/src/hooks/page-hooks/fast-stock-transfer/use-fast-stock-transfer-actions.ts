import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import {
  isFastStockTransferDraftCompleteForAdd,
  isFastStockTransferDraftCompleteForSave,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-draft";
import { lineToToolbarDraft } from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-pickers";
import { getErrorMessage } from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-errors";
import {
  mapDraftToAddBody,
  mapDraftToPatchBody,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers";
import { usePosFastStockTransferUiStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-ui.store";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";
import {
  TempWarehouseCloseMode,
  TempWarehouseDirection,
  TempWarehouseTransferProcessingStatus,
} from "@erp/shared-interfaces";
import { useCallback } from "react";
import { toast } from "sonner";
import { useInvalidatePosBranchCatalog } from "@erp/pos/hooks/react-query/use-query-catalog";
import { useInvalidateTempWarehouseCarriers } from "@erp/pos/hooks/react-query/use-query-temp-warehouse";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosFastStockTransferPickerStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-picker.store";
import { useFastStockTransferData } from "./use-fast-stock-transfer-data";
import { useTempWarehouseMutations } from "@erp/pos/hooks/react-query/use-query-temp-warehouse";

export function useFastStockTransferActions() {
  const branchId = usePosBranchStore((s) => s.branchId);
  const invalidatePosBranchCatalog = useInvalidatePosBranchCatalog();
  const invalidateTempWarehouseCarriers = useInvalidateTempWarehouseCarriers();
  const data = useFastStockTransferData();
  const clearProductCache = usePosFastStockTransferPickerStore(
    (s) => s.clearProductCache,
  );
  const {
    addLineMutation,
    updateLineMutation,
    closeSessionMutation,
    transferLinesMutation,
  } = useTempWarehouseMutations(branchId);

  const setPageError = usePosFastStockTransferUiStore((s) => s.setPageError);
  const openProcessDialog = usePosFastStockTransferUiStore(
    (s) => s.openProcessDialog,
  );
  const closeProcessDialog = usePosFastStockTransferUiStore(
    (s) => s.closeProcessDialog,
  );
  const openDiscrepancyDialog = usePosFastStockTransferUiStore(
    (s) => s.openDiscrepancyDialog,
  );
  const closeDiscrepancyDialog = usePosFastStockTransferUiStore(
    (s) => s.closeDiscrepancyDialog,
  );
  const resetDialogs = usePosFastStockTransferUiStore((s) => s.resetDialogs);

  const setDirection = usePosFastStockTransferWorkflowStore(
    (s) => s.setDirection,
  );
  const setFilter = usePosFastStockTransferWorkflowStore((s) => s.setFilter);
  const setToolbarCarrier = usePosFastStockTransferWorkflowStore(
    (s) => s.setToolbarCarrier,
  );
  const setToolbarProduct = usePosFastStockTransferWorkflowStore(
    (s) => s.setToolbarProduct,
  );
  const setToolbarLocation = usePosFastStockTransferWorkflowStore(
    (s) => s.setToolbarLocation,
  );
  const setEditDraftCarrier = usePosFastStockTransferWorkflowStore(
    (s) => s.setEditDraftCarrier,
  );
  const setEditDraftProduct = usePosFastStockTransferWorkflowStore(
    (s) => s.setEditDraftProduct,
  );
  const setEditDraftLocation = usePosFastStockTransferWorkflowStore(
    (s) => s.setEditDraftLocation,
  );
  const setTransferSelected = usePosFastStockTransferWorkflowStore(
    (s) => s.setTransferSelected,
  );
  const clearTransferSelection = usePosFastStockTransferWorkflowStore(
    (s) => s.clearTransferSelection,
  );
  const remapTransferSelection = usePosFastStockTransferWorkflowStore(
    (s) => s.remapTransferSelection,
  );
  const addHiddenLineIds = usePosFastStockTransferWorkflowStore(
    (s) => s.addHiddenLineIds,
  );
  const startEditingRow = usePosFastStockTransferWorkflowStore(
    (s) => s.startEditingRow,
  );
  const clearEditingRow = usePosFastStockTransferWorkflowStore(
    (s) => s.clearEditingRow,
  );
  const resetToolbarAfterAdd = usePosFastStockTransferWorkflowStore(
    (s) => s.resetToolbarAfterAdd,
  );
  const resetWorkflow = usePosFastStockTransferWorkflowStore(
    (s) => s.resetWorkflow,
  );
  const setPollSessionId = usePosFastStockTransferWorkflowStore(
    (s) => s.setPollSessionId,
  );

  const refetchLinesData = useCallback(async () => {
    await data.refetchLines();
  }, [data.refetchLines]);

  const refetchAll = useCallback(async () => {
    await Promise.all([
      data.refetchTempWarehouse(),
      branchId ? invalidateTempWarehouseCarriers(branchId) : Promise.resolve(),
      branchId
        ? invalidatePosBranchCatalog(branchId, data.catalogDirection)
        : Promise.resolve(),
      clearProductCache(),
      data.refetchStorages(),
      data.refetchShowrooms(),
    ]);
  }, [
    branchId,
    clearProductCache,
    data,
    invalidatePosBranchCatalog,
    invalidateTempWarehouseCarriers,
  ]);

  const handleResetData = useCallback(() => {
    void refetchLinesData();
    resetWorkflow();
    resetDialogs();
  }, [refetchLinesData, resetDialogs, resetWorkflow]);

  const handleAddRow = useCallback(() => {
    if (!data.branchId) {
      setPageError("Chưa chọn chi nhánh.");
      return;
    }
    if (data.isSessionClosed) {
      setPageError("Phiên kho tạm đã đóng. Không thể thêm dòng.");
      return;
    }
    if (!isFastStockTransferDraftCompleteForAdd(data.toolbarDraft)) {
      setPageError("Vui lòng chọn hàng hóa và vị trí (nếu có).");
      return;
    }
    const body = mapDraftToAddBody(
      data.toolbarDraft,
      data.branchId,
      data.direction,
    );
    if (data.toolbarDraft.carrier?.id) {
      body.carrierUserId = data.toolbarDraft.carrier.id;
    }

    addLineMutation.mutate(body, {
      onSuccess: () => {
        resetToolbarAfterAdd(data.toolbarDraft.carrier);
      },
      onError: (err) => setPageError(getErrorMessage(err)),
    });
  }, [addLineMutation, data, resetToolbarAfterAdd, setPageError]);

  const handleStartEdit = useCallback(
    (rowId: string) => {
      if (data.isSessionClosed) {
        setPageError("Phiên kho tạm đã đóng. Không thể sửa dòng.");
        return;
      }
      const line = data.rowsByDirection[data.direction].find(
        (entry) => entry.id === rowId,
      );
      if (!line) return;

      const product =
        data.findCatalogProduct(line.itemId) ??
        (line.item
          ? ({
              itemId: line.itemId,
              productId: null,
              code: line.item.code,
              name: line.item.name,
              unit: line.item.unit,
              sellingPrice: 0,
              quantityOnHand: 0,
              locations: (() => {
                const loc =
                  line.direction ===
                  TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM
                    ? line.sourceLocation
                    : line.destinationLocation;
                if (!loc) return [];
                return [
                  {
                    locationId: loc.id,
                    name: loc.name?.trim() || loc.code?.trim() || "",
                    quantity: 0,
                  },
                ];
              })(),
              defaultLocationId:
                line.sourceLocation?.id ?? line.destinationLocation?.id ?? "",
            } satisfies PosCatalogLine)
          : null);

      startEditingRow(
        rowId,
        lineToToolbarDraft(line, product, data.resolveCarrierById),
      );
    },
    [data, setPageError, startEditingRow],
  );

  const handleSaveRow = useCallback(
    (rowId: string) => {
      if (
        !data.editableDraft ||
        !isFastStockTransferDraftCompleteForSave(data.editableDraft)
      ) {
        return;
      }
      const body = mapDraftToPatchBody(data.editableDraft);
      if (data.editableDraft.carrier?.id) {
        body.carrierUserId = data.editableDraft.carrier.id;
      }

      updateLineMutation.mutate(
        { lineId: rowId, body },
        {
          onSuccess: (result) => {
            remapTransferSelection(rowId, result.newLine.id);
            clearEditingRow();
          },
          onError: (err) => setPageError(getErrorMessage(err)),
        },
      );
    },
    [
      clearEditingRow,
      data,
      remapTransferSelection,
      setPageError,
      updateLineMutation,
    ],
  );

  const handleToggleTransfer = useCallback(
    (rowId: string, checked: boolean) => {
      setTransferSelected(rowId, checked);
    },
    [setTransferSelected],
  );

  const runCloseSession = useCallback(
    async (closeMode: TempWarehouseCloseMode) => {
      if (!data.sessionId) {
        setPageError("Chưa có phiên kho tạm.");
        return;
      }
      try {
        const result = await closeSessionMutation.mutateAsync({
          sessionId: data.sessionId,
          mode: closeMode,
        });
        clearTransferSelection();
        resetDialogs();
        await refetchAll();

        if (
          closeMode === TempWarehouseCloseMode.CREATE_TRANSFERS &&
          result.session.transferProcessingStatus ===
            TempWarehouseTransferProcessingStatus.PENDING
        ) {
          setPollSessionId(data.sessionId);
        } else if (
          closeMode === TempWarehouseCloseMode.CREATE_TRANSFERS &&
          result.session.transferProcessingStatus ===
            TempWarehouseTransferProcessingStatus.FAILED
        ) {
          setPageError(
            result.session.transferFailureReason ??
              "Tạo phiếu chuyển kho thất bại.",
          );
        }
      } catch (err) {
        setPageError(getErrorMessage(err));
      }
    },
    [
      clearTransferSelection,
      closeSessionMutation,
      data,
      refetchAll,
      resetDialogs,
      setPageError,
      setPollSessionId,
    ],
  );

  const handleOpenProcessDialog = useCallback(() => {
    if (!data.canProcess) return;
    openProcessDialog();
  }, [data.canProcess, openProcessDialog]);

  const handleCloseProcessDialog = useCallback(() => {
    closeProcessDialog();
  }, [closeProcessDialog]);

  const handleConfirmProcess = useCallback(() => {
    if (!data.sessionId) {
      setPageError("Chưa có phiên kho tạm.");
      return;
    }
    const lineIds = data.selectedDialogRows.map((row) => row.id);
    if (lineIds.length === 0) return;

    transferLinesMutation.mutate(
      { sessionId: data.sessionId, body: { lineIds } },
      {
        onSuccess: () => {
          addHiddenLineIds(lineIds);
          clearTransferSelection();
          clearEditingRow();
          closeProcessDialog();
          toast.success("Đã xử lý chuyển kho thành công.");
        },
        onError: (err) => setPageError(getErrorMessage(err)),
      },
    );
  }, [
    addHiddenLineIds,
    clearEditingRow,
    clearTransferSelection,
    closeProcessDialog,
    data,
    setPageError,
    transferLinesMutation,
  ]);

  const handleCloseWarehouseClick = useCallback(() => {
    if (!data.sessionId) {
      setPageError("Chưa có phiên kho tạm để đóng.");
      return;
    }
    if (data.outboundRows.length + data.returnRows.length === 0) {
      setPageError("Chưa có dòng ghi nhận trong phiên.");
      return;
    }
    openDiscrepancyDialog();
  }, [data, openDiscrepancyDialog, setPageError]);

  const handleCloseDiscrepancyDialog = useCallback(() => {
    closeDiscrepancyDialog();
  }, [closeDiscrepancyDialog]);

  const handleConfirmDiscrepancyDialog = useCallback(
    (closeMode: TempWarehouseCloseMode) => {
      void runCloseSession(closeMode);
    },
    [runCloseSession],
  );

  return {
    setDirection,
    setFilter,
    handleToolbarDraftCarrier: setToolbarCarrier,
    handleToolbarDraftProduct: setToolbarProduct,
    handleToolbarDraftLocation: setToolbarLocation,
    handleEditDraftCarrier: setEditDraftCarrier,
    handleEditDraftProduct: setEditDraftProduct,
    handleEditDraftLocation: setEditDraftLocation,
    handleAddRow,
    handleStartEdit,
    handleSaveRow,
    handleToggleTransfer,
    handleOpenProcessDialog,
    handleCloseProcessDialog,
    handleConfirmProcess,
    handleCloseWarehouseClick,
    handleCloseDiscrepancyDialog,
    handleConfirmDiscrepancyDialog,
    handleResetData,
    refetchAll,
    setPollSessionId,
    setPageError,
  };
}
