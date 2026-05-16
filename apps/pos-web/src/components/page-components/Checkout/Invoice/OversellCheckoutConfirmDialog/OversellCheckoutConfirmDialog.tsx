import { useMemo } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import {
  PosDataTable,
  type PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import type { CartLine } from "@erp/pos/lib/page-libs/checkout/checkout.types";
import { qtyFormatter } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import { ProhibitedGlyphIcon } from "@erp/pos/components/common/PosIcons/PosIcons";

export interface OversellCheckoutConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** Lines with sale qty above on-hand snapshot (`maxQty`). */
  lines: CartLine[];
  onConfirm: () => void;
}

/**
 * Confirms checkout when the purchase cart contains lines sold above
 * catalog on-hand snapshot (bán khống / bán vượt tồn).
 */
export function OversellCheckoutConfirmDialog({
  open,
  onClose,
  lines,
  onConfirm,
}: OversellCheckoutConfirmDialogProps) {
  const columns = useMemo<ReadonlyArray<PosDataTableColumn<CartLine>>>(
    () => [
      {
        key: "name",
        title: "Tên hàng hóa",
        render: (line) => line.name,
      },
      {
        key: "maxQty",
        title: "Số lượng tồn",
        align: "right",
        cellClassName: "tabular-nums",
        render: (line) => qtyFormatter.format(line.maxQty),
      },
      {
        key: "customerOrdered",
        title: "Khách đặt",
        align: "right",
        cellClassName: "tabular-nums",
        render: () => qtyFormatter.format(0),
      },
      {
        key: "waitingPickup",
        title: "Chờ lấy hàng",
        align: "right",
        cellClassName: "tabular-nums",
        render: () => qtyFormatter.format(0),
      },
      {
        key: "available",
        title: "Tồn khả dụng",
        align: "right",
        cellClassName: "tabular-nums",
        render: (line) => {
          const customerOrdered = 0;
          const waitingPickup = 0;
          const available = Math.max(
            0,
            line.maxQty - customerOrdered - waitingPickup,
          );
          return qtyFormatter.format(available);
        },
      },
      {
        key: "unit",
        title: "Đơn vị tính",
        render: (line) => line.unit,
      },
    ],
    [],
  );

  return (
    <PosDialog open={open} onClose={onClose} width={960}>
      <PosDialog.Header title="Cảnh báo xuất quá số lượng tồn" />
      <PosDialog.Body className="space-y-4">
        <p className="flex  gap-2 text-sm text-red-600 items-center">
          <span
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-red-500 bg-red-300"
            aria-hidden
          >
            <ProhibitedGlyphIcon />
          </span>
          <span>Bạn đang xuất quá số lượng tồn của những hàng hóa sau:</span>
        </p>
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <div className="min-w-[720px]">
            <PosDataTable<CartLine>
              columns={columns}
              dataSource={lines}
              rowKey={(line) => line.lineId}
              emptyText="Không có dòng vượt tồn."
            />
          </div>
        </div>
        <p className="text-sm text-gray-700">Bạn có muốn tiếp tục không?</p>
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={() => {
          onConfirm();
        }}
        onCancel={onClose}
        saveLabel="Có"
        cancelLabel="Không"
      />
    </PosDialog>
  );
}
