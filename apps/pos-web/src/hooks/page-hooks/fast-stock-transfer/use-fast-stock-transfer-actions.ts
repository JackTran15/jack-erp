import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import type { FastStockTransferFilters, FastStockTransferToolbarDraft } from "@erp/pos/interfaces/fast-stock-transfer.interface";
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
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { CATALOG_KEYS } from "@erp/pos/constants/react-query-key.constant";
import { useQueryClient } from "@tanstack/react-query";
import { useLookupPreferredShelf } from "@erp/pos/hooks/react-query/use-query-inventory";
import { useInvalidateTempWarehouseCarriers } from "@erp/pos/hooks/react-query/use-query-temp-warehouse";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosFastStockTransferPickerStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-picker.store";
import { useFastStockTransferData } from "./use-fast-stock-transfer-data";
import { useTempWarehouseMutations } from "@erp/pos/hooks/react-query/use-query-temp-warehouse";

/**
 * Lượt tra kệ ưu tiên đang chạy cho một mặt hàng. Giữ cả promise chứ không chỉ
 * `itemId`, để `handleAddRow` đợi được nó trước khi gửi dòng lên (ADR-05).
 */
type PendingShelfLookup = { itemId: string; promise: Promise<void> } | null;

function resolveStorageIdForShelf(
  direction: TempWarehouseDirection,
  filters: FastStockTransferFilters,
): string | null {
  const id =
    direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM
      ? filters.sourceWarehouse
      : filters.destinationWarehouse;
  return id || null;
}

export function useFastStockTransferActions() {
  const branchId = usePosBranchStore((s) => s.branchId);
  const queryClient = useQueryClient();
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
  const direction = usePosFastStockTransferWorkflowStore((s) => s.direction);
  const filters = usePosFastStockTransferWorkflowStore((s) => s.filters);

  const lookupPreferredShelf = useLookupPreferredShelf();
  const pendingToolbarShelfRef = useRef<PendingShelfLookup>(null);
  const pendingEditShelfRef = useRef<PendingShelfLookup>(null);
  const addInFlightRef = useRef(false);

  const applyPreferredShelf = useCallback(
    (
      product: PosCatalogLine,
      pendingRef: { current: PendingShelfLookup },
      setLocation: (
        location: FastStockTransferToolbarDraft["location"],
      ) => void,
    ) => {
      // Việc đầu tiên, trước mọi nhánh thoát: ô Vị trí không bao giờ được phép
      // giữ kệ của mặt hàng quét trước đó, kể cả trong lúc chờ API trả về.
      setLocation(null);

      const storageId = resolveStorageIdForShelf(direction, filters);
      if (!storageId) {
        // Vẫn phải gán một promise đã settle: `handleAddRow` await ref này.
        pendingRef.current = {
          itemId: product.itemId,
          promise: Promise.resolve(),
        };
        return;
      }

      const promise = lookupPreferredShelf([
        { itemId: product.itemId, storageId },
      ])
        .then((results) => {
          // Người dùng có thể đã quét mặt hàng khác trong lúc chờ.
          if (pendingRef.current?.itemId !== product.itemId) return;
          const shelf = results[0]?.shelf;
          if (!shelf) return;
          setLocation({
            locationId: shelf.id,
            name: shelf.name || shelf.code,
            quantity: 0,
          });
        })
        // Promise phải luôn settle: ADR-05 dựa vào điều này thay cho một timeout
        // nhân tạo. Lỗi tra kệ thì để Vị trí trống, dòng vẫn thêm được.
        .catch(() => undefined);

      pendingRef.current = { itemId: product.itemId, promise };
    },
    [direction, filters, lookupPreferredShelf],
  );

  const createDraftProductHandler = useCallback(
    (
      setProduct: (product: PosCatalogLine | null) => void,
      pendingRef: { current: PendingShelfLookup },
      setLocation: (location: FastStockTransferToolbarDraft["location"]) => void,
    ) =>
      (product: PosCatalogLine | null) => {
        setProduct(product);
        if (!product) {
          pendingRef.current = null;
          return;
        }
        applyPreferredShelf(product, pendingRef, setLocation);
      },
    [applyPreferredShelf],
  );

  const handleToolbarDraftProduct = useCallback(
    createDraftProductHandler(
      setToolbarProduct,
      pendingToolbarShelfRef,
      setToolbarLocation,
    ),
    [createDraftProductHandler, setToolbarProduct, setToolbarLocation],
  );

  const handleEditDraftProduct = useCallback(
    createDraftProductHandler(
      setEditDraftProduct,
      pendingEditShelfRef,
      setEditDraftLocation,
    ),
    [createDraftProductHandler, setEditDraftProduct, setEditDraftLocation],
  );

  const refetchLinesData = useCallback(async () => {
    await data.refetchLines();
  }, [data.refetchLines]);

  const refetchAll = useCallback(async () => {
    await Promise.all([
      data.refetchTempWarehouse(),
      branchId ? invalidateTempWarehouseCarriers(branchId) : Promise.resolve(),
      branchId
        ? queryClient.invalidateQueries({ queryKey: CATALOG_KEYS.ALL })
        : Promise.resolve(),
      clearProductCache(),
      data.refetchStorages(),
      data.refetchShowrooms(),
    ]);
  }, [
    branchId,
    clearProductCache,
    data,
    invalidateTempWarehouseCarriers,
    queryClient,
  ]);

  const handleResetData = useCallback(() => {
    void refetchLinesData();
    resetWorkflow();
    resetDialogs();
  }, [refetchLinesData, resetDialogs, resetWorkflow]);

  const handleAddRow = useCallback(
    async (callbacks?: {
      onAdded?: () => void;
      onMissingCarrier?: () => void;
    }) => {
      // Chặn Enter dồn: máy quét có thể bắn phím kế tiếp trước khi POST xong.
      // Dùng ref chứ không dùng `addLineMutation.isPending` — cờ của React Query
      // là giá trị của lần render trước, hai lần Enter trong cùng một tick đều
      // đọc ra `false`.
      if (addInFlightRef.current) return;
      // Khoá ngay, trước `await` phía dưới: nếu để tới lúc `mutate` mới khoá thì
      // hai lần Enter liên tiếp đều lọt qua rào rồi cùng gửi lên.
      addInFlightRef.current = true;
      let submitted = false;
      try {
        if (!data.branchId) {
          setPageError("Chưa chọn chi nhánh.");
          return;
        }
        if (data.isSessionClosed) {
          setPageError("Phiên kho tạm đã đóng. Không thể thêm dòng.");
          return;
        }

        // Đọc draft ngay lúc gọi, không qua closure: Enter có thể tới cùng tick
        // với lúc chọn hàng, khi đó `data.toolbarDraft` của lần render trước còn rỗng.
        let draft = usePosFastStockTransferWorkflowStore.getState().toolbarDraft;

        // Đợi lượt tra kệ của chính mặt hàng đang chọn, nếu nó còn đang bay.
        // Không đợi thì dòng được lưu với Vị trí trống dù mặt hàng có kệ (ADR-05).
        const pendingShelf = pendingToolbarShelfRef.current;
        if (pendingShelf && pendingShelf.itemId === draft.product?.itemId) {
          await pendingShelf.promise;
          // Đọc lại: `setLocation` vừa chạy trong lúc chờ nên bản đọc trước đã cũ.
          draft = usePosFastStockTransferWorkflowStore.getState().toolbarDraft;
        }

        const carrier = draft.carrier;
        if (!carrier?.id) {
          setPageError("Vui lòng chọn người vận chuyển.");
          callbacks?.onMissingCarrier?.();
          return;
        }
        if (!isFastStockTransferDraftCompleteForAdd(draft)) {
          setPageError("Vui lòng chọn hàng hóa và vị trí (nếu có).");
          return;
        }
        const body = mapDraftToAddBody(draft, data.branchId, data.direction);
        body.carrierUserId = carrier.id;

        // Pin the session's storages from the "Kho xuất"/"Kho nhập" pickers so the
        // BE opens it with distinct warehouse vs showroom locations. The warehouse
        // side is a storage id; the showroom side is a showroom id → its storageId.
        const showroomStorageOf = (id: string) =>
          data.showrooms.find((s) => s.id === id)?.storageId;
        const isW2s =
          data.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM;
        const warehouseStorageId = isW2s
          ? data.filters.sourceWarehouse
          : data.filters.destinationWarehouse;
        const showroomStorageId = isW2s
          ? showroomStorageOf(data.filters.destinationWarehouse)
          : showroomStorageOf(data.filters.sourceWarehouse);
        if (warehouseStorageId) body.warehouseStorageId = warehouseStorageId;
        if (showroomStorageId) body.showroomStorageId = showroomStorageId;

        addLineMutation.mutate(body, {
          onSuccess: () => {
            addInFlightRef.current = false;
            // Giữ người vận chuyển để quét tiếp không phải chọn lại.
            resetToolbarAfterAdd(carrier);
            callbacks?.onAdded?.();
          },
          onError: (err) => {
            addInFlightRef.current = false;
            setPageError(getErrorMessage(err));
          },
        });
        submitted = true;
      } finally {
        // Chỉ nhả khoá ở đây khi chưa gửi được; đã gửi thì callback của mutation nhả.
        if (!submitted) addInFlightRef.current = false;
      }
    },
    [addLineMutation, data, resetToolbarAfterAdd, setPageError],
  );

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
              // Dòng dựng tại chỗ cho Chuyển kho nhanh, không đi qua cảnh báo
              // vượt tồn của màn bán hàng — giữ 0 như `quantityOnHand`.
              showroomQuantity: 0,
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
      if (!data.branchId) {
        setPageError("Chưa có chi nhánh.");
        return;
      }
      try {
        const result = await closeSessionMutation.mutateAsync({
          branchId: data.branchId,
          mode: closeMode,
        });
        clearTransferSelection();
        resetDialogs();
        await refetchAll();

        if (closeMode === TempWarehouseCloseMode.CREATE_TRANSFERS) {
          const pending = result.sessions.find(
            (s) =>
              s.transferProcessingStatus ===
              TempWarehouseTransferProcessingStatus.PENDING,
          );
          const failed = result.sessions.find(
            (s) =>
              s.transferProcessingStatus ===
              TempWarehouseTransferProcessingStatus.FAILED,
          );
          if (pending) {
            setPollSessionId(pending.id);
          } else if (failed) {
            setPageError(
              failed.transferFailureReason ?? "Tạo phiếu chuyển kho thất bại.",
            );
          }
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
    handleToolbarDraftProduct,
    handleToolbarDraftLocation: setToolbarLocation,
    handleEditDraftCarrier: setEditDraftCarrier,
    handleEditDraftProduct,
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
