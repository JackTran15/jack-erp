import { useFastStockTransferActions } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions";
import { useFastStockTransferData } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-data";
import { cn } from "@erp/ui";

export function ToolbarActionBar() {
  const { canProcess, canCloseTransfer, isLinesRefetching, isMutating } =
    useFastStockTransferData();
  const {
    handleResetData,
    handleOpenProcessDialog,
    handleCloseWarehouseClick,
  } = useFastStockTransferActions();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleResetData}
        disabled={isLinesRefetching || isMutating}
        className="inline-flex h-9 items-center rounded-md border border-[#C7D2FE] px-3 text-[13px] font-semibold text-[#4F46E5] hover:bg-[#EEF2FF] disabled:opacity-50"
      >
        {isLinesRefetching ? "Đang tải…" : "Lấy lại dữ liệu"}
      </button>
      <button
        type="button"
        onClick={handleOpenProcessDialog}
        disabled={!canProcess}
        className={cn(
          "inline-flex h-9 items-center rounded-md px-3 text-[13px] font-semibold text-white",
          canProcess
            ? "bg-[#4F46E5] hover:bg-[#4338CA]"
            : "bg-[#C7D2FE] cursor-not-allowed",
        )}
      >
        Xử lý chuyển kho
      </button>
      <button
        type="button"
        disabled={!canCloseTransfer}
        onClick={handleCloseWarehouseClick}
        className={cn(
          "inline-flex h-9 items-center rounded-md px-3 text-[13px] font-semibold text-white",
          canCloseTransfer
            ? "bg-[#22C55E] hover:bg-[#16A34A]"
            : "bg-[#BBF7D0] cursor-not-allowed",
        )}
      >
        Đóng kho tạm
      </button>
    </div>
  );
}
