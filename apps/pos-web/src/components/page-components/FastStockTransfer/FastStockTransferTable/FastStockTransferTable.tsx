import { PosDataTable } from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { useFastStockTransferTableColumns } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-table-columns";
import { useFastStockTransferData } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-data";
import type { FastStockTransferTableRow } from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer.types";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";

export function FastStockTransferTable() {
  const { rows } = useFastStockTransferData();
  const filters = usePosFastStockTransferWorkflowStore((s) => s.filters);
  const columns = useFastStockTransferTableColumns();

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[#E5E7EB]">
      <PosDataTable<FastStockTransferTableRow>
        columns={columns}
        dataSource={rows}
        rowKey={(row) => row.id}
        emptyText={
          filters.showRowsNeedingReview
            ? "Không có dòng cần kiểm tra."
            : "Chưa có dữ liệu chuyển kho."
        }
      />
    </div>
  );
}
