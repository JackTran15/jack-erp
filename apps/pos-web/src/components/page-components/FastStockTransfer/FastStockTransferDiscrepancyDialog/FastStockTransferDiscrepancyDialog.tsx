import {
  PosDataTable,
  PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PosRadio } from "@erp/pos/components/common/PosRadio/PosRadio";
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
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <label className="w-1/5 shrink-0">Xử lý chênh lệch</label>
          <div className="min-w-0 flex-1">
            <div
              role="radiogroup"
              aria-label="Xử lý chênh lệch"
              className="flex h-7 items-center gap-6"
            >
              {CLOSE_MODE_OPTIONS.map((opt) => (
                <PosRadio
                  key={opt.value}
                  name="discrepancy-close-mode"
                  value={opt.value}
                  label={opt.label}
                  selected={closeMode === opt.value}
                  onChange={() => setCloseMode(opt.value)}
                />
              ))}
            </div>
          </div>
        </div>
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
