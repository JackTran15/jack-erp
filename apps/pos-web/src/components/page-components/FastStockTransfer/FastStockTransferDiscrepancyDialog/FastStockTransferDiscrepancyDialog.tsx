import {
  PosDataTable,
  PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PosFormItem } from "@erp/pos/components/common/PosFormItem/PosFormItem";
import { PosRadioGroup } from "@erp/pos/components/common/PosRadioGroup/PosRadioGroup";
import {
  nettedDiscrepancyReason,
  nettedProductLabel,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers";
import {
  TempWarehouseCloseMode,
  type TempWarehouseNettedItem,
} from "@erp/shared-interfaces";
import { useMemo, useState } from "react";

export interface FastStockTransferDiscrepancyDialogProps {
  open: boolean;
  items: ReadonlyArray<TempWarehouseNettedItem>;
  onClose: () => void;
  onConfirm: (closeMode: TempWarehouseCloseMode) => void;
}

const CLOSE_MODE_OPTIONS: ReadonlyArray<{
  value: TempWarehouseCloseMode;
  label: string;
}> = [
  {
    value: TempWarehouseCloseMode.NET_OFFSET,
    label: "Xuất đi/Trả lại kho tạm",
  },
  {
    value: TempWarehouseCloseMode.CREATE_TRANSFERS,
    label: "Tạo phiếu chuyển kho",
  },
  {
    value: TempWarehouseCloseMode.NONE,
    label: "Không xử lý",
  },
];

export function FastStockTransferDiscrepancyDialog({
  open,
  items,
  onClose,
  onConfirm,
}: FastStockTransferDiscrepancyDialogProps) {
  const [closeMode, setCloseMode] = useState<TempWarehouseCloseMode>(
    TempWarehouseCloseMode.NET_OFFSET,
  );

  const columns = useMemo<
    ReadonlyArray<PosDataTableColumn<TempWarehouseNettedItem>>
  >(
    () => [
      {
        key: "productLabel",
        title: "Tên hàng hóa",
        render: (row) => nettedProductLabel(row),
      },
      {
        key: "outboundSummary",
        title: "Xuất đi (SL/Vị trí)",
        render: (row) => String(row.totalW2s),
      },
      {
        key: "returnSummary",
        title: "Trả lại (SL/Vị trí)",
        render: (row) => String(row.totalS2w),
      },
      {
        key: "reason",
        title: "Lý do",
        render: (row) => nettedDiscrepancyReason(row),
      },
    ],
    [],
  );

  return (
    <PosDialog open={open} onClose={onClose} width={960}>
      <PosDialog.Header title="Hàng hóa chênh lệch" />
      <PosDialog.Body className="flex flex-col gap-4 px-4 py-3">
        <div className="flex min-h-[300px] flex-col gap-4">
          <PosDataTable<TempWarehouseNettedItem>
            columns={columns}
            dataSource={items}
            rowKey={(row) => row.itemId}
            emptyText="Không có dòng chênh lệch."
            fillHeight
          />
        </div>
        <PosFormItem
          label="Xử lý chênh lệch"
          layout="horizontal"
          labelClassName="w-1/5"
        >
          <PosRadioGroup<TempWarehouseCloseMode>
            name="discrepancy-close-mode"
            value={closeMode}
            onChange={setCloseMode}
            options={CLOSE_MODE_OPTIONS}
            ariaLabel="Xử lý chênh lệch"
          />
        </PosFormItem>
      </PosDialog.Body>
      <PosDialog.Footer
        onCancel={onClose}
        onSave={() => onConfirm(closeMode)}
        cancelLabel="Hủy bỏ"
        saveLabel="Đồng ý"
      />
    </PosDialog>
  );
}
