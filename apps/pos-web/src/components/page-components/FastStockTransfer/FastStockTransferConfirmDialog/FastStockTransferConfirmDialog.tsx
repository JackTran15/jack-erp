import {
  PosDataTable,
  type PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import type { FastStockTransferConfirmRow } from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer.types";
import { useMemo } from "react";

interface FastStockTransferConfirmDialogProps {
  open: boolean;
  rows: ReadonlyArray<FastStockTransferConfirmRow>;
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
    ReadonlyArray<PosDataTableColumn<FastStockTransferConfirmRow>>
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
      <PosDialog.Body className="flex flex-col gap-3 px-3 py-0">
        <PosDataTable<FastStockTransferConfirmRow>
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
