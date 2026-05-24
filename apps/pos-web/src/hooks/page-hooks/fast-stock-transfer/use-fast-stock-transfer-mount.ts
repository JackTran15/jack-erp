import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";
import { TempWarehouseTransferProcessingStatus } from "@erp/shared-interfaces";
import { useEffect } from "react";
import { toast } from "sonner";
import { useFastStockTransferActions } from "./use-fast-stock-transfer-actions";
import { useFastStockTransferData } from "./use-fast-stock-transfer-data";
import { useTempWarehouseSessionDetail } from "@erp/pos/hooks/react-query/use-query-temp-warehouse";
/**
 * Mount-only side effects for Fast Stock Transfer. Gọi một lần từ {@link FastStockTransferPage}.
 */
export function useFastStockTransferMount() {
  const data = useFastStockTransferData();
  const { refetchAll, setPollSessionId, setPageError } =
    useFastStockTransferActions();

  const refreshToolbarProductFromCatalog = usePosFastStockTransferWorkflowStore(
    (s) => s.refreshToolbarProductFromCatalog,
  );
  const setFilters = usePosFastStockTransferWorkflowStore((s) => s.setFilters);
  const pruneHiddenLineIds = usePosFastStockTransferWorkflowStore(
    (s) => s.pruneHiddenLineIds,
  );
  const pollSessionId = usePosFastStockTransferWorkflowStore(
    (s) => s.pollSessionId,
  );

  const pollQuery = useTempWarehouseSessionDetail(
    pollSessionId,
    Boolean(pollSessionId),
  );

  useEffect(() => {
    const activeIds = new Set([
      ...data.outboundLineIds,
      ...data.returnLineIds,
    ]);
    pruneHiddenLineIds(activeIds);
  }, [data.outboundLineIds, data.returnLineIds, pruneHiddenLineIds]);

  useEffect(() => {
    refreshToolbarProductFromCatalog(data.catalogLines);
  }, [data.catalogLines, data.catalogDirection, refreshToolbarProductFromCatalog]);

  useEffect(() => {
    if (data.locationsLoading) return;
    if (data.storages.length === 0 && data.showrooms.length === 0) return;

    const defaults = data.defaultWarehouseFilterIds(
      data.direction,
      data.storages,
      data.showrooms,
    );

    setFilters((prev) => {
      const sourceValid =
        Boolean(prev.sourceWarehouse) &&
        data.sourceWarehouseOptions.some((o) => o.id === prev.sourceWarehouse);
      const destValid =
        Boolean(prev.destinationWarehouse) &&
        data.destinationWarehouseOptions.some(
          (o) => o.id === prev.destinationWarehouse,
        );

      if (sourceValid && destValid) return prev;

      return {
        ...prev,
        sourceWarehouse: sourceValid
          ? prev.sourceWarehouse
          : defaults.sourceWarehouse,
        destinationWarehouse: destValid
          ? prev.destinationWarehouse
          : defaults.destinationWarehouse,
      };
    });
  }, [
    data.defaultWarehouseFilterIds,
    data.destinationWarehouseOptions,
    data.direction,
    data.locationsLoading,
    data.showrooms,
    data.sourceWarehouseOptions,
    data.storages,
    setFilters,
  ]);

  useEffect(() => {
    const polled = pollQuery.data;
    if (!polled || !pollSessionId) return;
    if (
      polled.transferProcessingStatus ===
      TempWarehouseTransferProcessingStatus.COMPLETED
    ) {
      setPollSessionId(null);
      void refetchAll();
      const parts: string[] = [];
      if (polled.transferW2sId) parts.push(`W2S: ${polled.transferW2sId}`);
      if (polled.transferS2wId) parts.push(`S2W: ${polled.transferS2wId}`);
      if (parts.length > 0) {
        toast.success(`Đã tạo phiếu chuyển kho. ${parts.join(" · ")}`);
      }
    } else if (
      polled.transferProcessingStatus ===
      TempWarehouseTransferProcessingStatus.FAILED
    ) {
      setPollSessionId(null);
      setPageError(
        polled.transferFailureReason ?? "Tạo phiếu chuyển kho thất bại.",
      );
    }
  }, [pollQuery.data, pollSessionId, refetchAll, setPageError, setPollSessionId]);
}
