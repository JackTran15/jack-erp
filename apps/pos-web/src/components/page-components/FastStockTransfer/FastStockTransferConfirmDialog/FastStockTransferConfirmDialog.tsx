import { useMemo } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import {
  PosDataTable,
  type PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import type { FastStockTransferDialogRow } from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer.types";

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
    ReadonlyArray<PosDataTableColumn<FastStockTransferDialogRow>>
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
    <PosDialog open={open} onClose={onClose} width={920}>
      <PosDialog.Header title="Xử lý chuyển kho" />
      <PosDialog.Body className="px-3 py-0">
        <PosDataTable<FastStockTransferDialogRow>
          columns={columns}
          dataSource={rows}
          rowKey={(row) => row.id}
          emptyText="Chưa có dòng cần xử lý."
        />
      </PosDialog.Body>
      <PosDialog.Footer
        onCancel={onClose}
        onSave={onConfirm}
        cancelLabel="Hủy bỏ"
        saveLabel="Đồng ý"
      />
    </PosDialog>
  );
}
