import { useMemo } from "react";
import { AppDialog } from "@erp/pos/components/AppDialog";
import {
  DataTable,
  type DataTableColumn,
} from "@erp/pos/components/dataTable/DataTable";
import type { FastStockTransferDialogRow } from "../types";

interface FastStockTransferConfirmDialogProps {
  open: boolean;
  rows: ReadonlyArray<FastStockTransferDialogRow>;
  onClose: () => void;
  onConfirm: () => void;
}

export function FastStockTransferConfirmDialog({
  open,
  rows,
  onClose,
  onConfirm,
}: FastStockTransferConfirmDialogProps) {
  const columns = useMemo<
    ReadonlyArray<DataTableColumn<FastStockTransferDialogRow>>
  >(
    () => [
      {
        key: "productName",
        title: "Tên hàng hóa",
        render: (row) => row.productName,
      },
      {
        key: "sourceWarehouse",
        title: "Kho xuất (vị trí xuất)",
        render: (row) => row.sourceWarehouse,
      },
      {
        key: "destinationWarehouse",
        title: "Kho nhập (vị trí nhập)",
        render: (row) => row.destinationWarehouse,
      },
      {
        key: "quantity",
        title: "SL",
        align: "right",
        render: (row) => row.quantity,
      },
    ],
    [],
  );

  return (
    <AppDialog open={open} onClose={onClose} width={920}>
      <AppDialog.Header title="Xử lý chuyển kho" />
      <AppDialog.Body className="px-3 py-0">
        <DataTable<FastStockTransferDialogRow>
          columns={columns}
          dataSource={rows}
          rowKey={(row) => row.id}
          emptyText="Chưa có dòng cần xử lý."
        />
      </AppDialog.Body>
      <AppDialog.Footer
        onCancel={onClose}
        onSave={onConfirm}
        cancelLabel="Hủy bỏ"
        saveLabel="Đồng ý"
      />
    </AppDialog>
  );
}
