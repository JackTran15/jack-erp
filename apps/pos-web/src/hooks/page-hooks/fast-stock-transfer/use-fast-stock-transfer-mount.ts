import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";
import {
  TempWarehouseLineStatus,
  TempWarehouseTransferProcessingStatus,
} from "@erp/shared-interfaces";
import { useEffect } from "react";
import { toast } from "sonner";
import { useFastStockTransferActions } from "./use-fast-stock-transfer-actions";
import { useFastStockTransferData } from "./use-fast-stock-transfer-data";
import {
  useTempWarehouseLinesTransferStatus,
  useTempWarehouseSessionDetail,
} from "@erp/pos/hooks/react-query/use-query-temp-warehouse";

// Quá thời gian này mà consumer vẫn chưa flip xong thì thôi, không chờ nữa —
// bỏ mask để dòng hiện lại đúng trạng thái thật trên server thay vì tiếp tục
// báo "đã xử lý" trong khi nó vẫn ACTIVE.
const TRANSFER_CONFIRM_TIMEOUT_MS = 20_000;

export function useFastStockTransferMount() {
  const data = useFastStockTransferData();
  const { refetchAll, setPollSessionId, setPageError } =
    useFastStockTransferActions();

  const setFilters = usePosFastStockTransferWorkflowStore((s) => s.setFilters);
  const pruneHiddenLineIds = usePosFastStockTransferWorkflowStore(
    (s) => s.pruneHiddenLineIds,
  );
  const removeHiddenLineIds = usePosFastStockTransferWorkflowStore(
    (s) => s.removeHiddenLineIds,
  );
  const pollSessionId = usePosFastStockTransferWorkflowStore(
    (s) => s.pollSessionId,
  );
  const pendingTransferLineIds = usePosFastStockTransferWorkflowStore(
    (s) => s.pendingTransferLineIds,
  );
  const pendingTransferStartedAt = usePosFastStockTransferWorkflowStore(
    (s) => s.pendingTransferStartedAt,
  );
  const setPendingTransferLineIds = usePosFastStockTransferWorkflowStore(
    (s) => s.setPendingTransferLineIds,
  );

  const pollQuery = useTempWarehouseSessionDetail(
    pollSessionId,
    Boolean(pollSessionId),
  );

  const transferStatusQuery = useTempWarehouseLinesTransferStatus(
    pendingTransferLineIds,
    pendingTransferLineIds.length > 0,
  );

  useEffect(() => {
    const activeIds = new Set([...data.outboundLineIds, ...data.returnLineIds]);
    pruneHiddenLineIds(activeIds);
  }, [data.outboundLineIds, data.returnLineIds, pruneHiddenLineIds]);

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

      const nextSource = sourceValid
        ? prev.sourceWarehouse
        : defaults.sourceWarehouse;
      const nextDest = destValid
        ? prev.destinationWarehouse
        : defaults.destinationWarehouse;

      // Nothing actually changes (e.g. defaults match the already-set values
      // that just aren't validatable yet) — return prev to avoid a re-render loop.
      if (
        nextSource === prev.sourceWarehouse &&
        nextDest === prev.destinationWarehouse
      ) {
        return prev;
      }

      return {
        ...prev,
        sourceWarehouse: nextSource,
        destinationWarehouse: nextDest,
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
  }, [
    pollQuery.data,
    pollSessionId,
    refetchAll,
    setPageError,
    setPollSessionId,
  ]);

  // Xác nhận "Xử lý chuyển kho" đã thật sự xong (ACTIVE -> TRANSFERRED) trước
  // khi báo thành công — xem comment ở use-fast-stock-transfer-actions.ts.
  useEffect(() => {
    const result = transferStatusQuery.data;
    if (
      !result ||
      pendingTransferLineIds.length === 0 ||
      pendingTransferStartedAt === null
    ) {
      return;
    }

    const statusById = new Map(result.map((l) => [l.id, l.status]));
    const stillActiveIds = pendingTransferLineIds.filter(
      (id) => statusById.get(id) === TempWarehouseLineStatus.ACTIVE,
    );

    if (stillActiveIds.length === 0) {
      // Không còn dòng nào ACTIVE nữa (đã TRANSFERRED, hoặc không còn tồn tại) —
      // xác nhận xong thật sự, giờ mới báo thành công và refetch để danh sách
      // ACTIVE phản ánh đúng ngay, không đợi staleTime tự nhiên.
      setPendingTransferLineIds([]);
      void refetchAll();
      toast.success("Đã xử lý chuyển kho thành công.");
      return;
    }

    if (Date.now() - pendingTransferStartedAt > TRANSFER_CONFIRM_TIMEOUT_MS) {
      // Chưa xác nhận được sau timeout: ngừng chờ, bỏ mask để các dòng này
      // hiện lại đúng trạng thái thật thay vì tiếp tục coi như đã xong.
      removeHiddenLineIds(stillActiveIds);
      setPendingTransferLineIds([]);
      setPageError(
        "Xử lý chuyển kho đang chậm hơn bình thường, các dòng chưa xác nhận sẽ hiện lại trong danh sách. Vui lòng thử lại sau ít phút.",
      );
    }
  }, [
    pendingTransferLineIds,
    pendingTransferStartedAt,
    refetchAll,
    removeHiddenLineIds,
    setPageError,
    setPendingTransferLineIds,
    transferStatusQuery.data,
    // `data` giữ nguyên reference giữa các lần refetch nếu nội dung không đổi
    // (structural sharing của React Query) — thêm dataUpdatedAt để effect vẫn
    // chạy lại mỗi lần poll, nếu không nhánh timeout sẽ không bao giờ tới lượt.
    transferStatusQuery.dataUpdatedAt,
  ]);
}
