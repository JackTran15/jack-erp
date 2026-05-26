import { useMemo } from "react";
import { cn, formatVnd } from "@erp/ui";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import {
  PosDataTable,
  type PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import { clampReturnQty } from "@erp/pos/lib/page-libs/return-goods/returnGoodsMath";
import type { ReturnInvoiceRow, ReturnableItem } from "@erp/pos/interfaces/return-goods.interface";

export interface ReturnItemsDialogProps {
  open: boolean;
  invoice: ReturnInvoiceRow | null;
  /** Returnable lines fetched from `GET /invoices/:id/eligible-returns`. */
  items: ReadonlyArray<ReturnableItem>;
  /** True while the eligible-returns request is in flight. */
  loading?: boolean;
  selectedIds: ReadonlySet<string>;
  qtyById: Readonly<Record<string, number>>;
  onToggleItem: (id: string) => void;
  onToggleAll: (next: boolean) => void;
  onChangeQty: (id: string, value: number) => void;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * "Chọn hàng trả lại: {invoiceNumber}" modal. Lets the operator pick which
 * lines from the source invoice to return and how many units of each.
 */
export function ReturnItemsDialog({
  open,
  invoice,
  items,
  loading = false,
  selectedIds,
  qtyById,
  onToggleItem,
  onToggleAll,
  onChangeQty,
  onConfirm,
  onClose,
}: ReturnItemsDialogProps) {
  const allChecked = items.length > 0 && items.every((i) => selectedIds.has(i.id));
  const anyChecked = items.some((i) => selectedIds.has(i.id));

  const columns = useMemo<ReadonlyArray<PosDataTableColumn<ReturnableItem>>>(
    () => [
      {
        key: "select",
        title: (
          <PosCheckbox
            checked={allChecked}
            onChange={onToggleAll}
            ariaLabel="Chọn tất cả hàng trả"
          />
        ),
        headerClassName: "w-10",
        cellClassName: "w-10",
        render: (row) => (
          <PosCheckbox
            checked={selectedIds.has(row.id)}
            onChange={() => onToggleItem(row.id)}
            ariaLabel={row.name}
          />
        ),
      },
      {
        key: "name",
        title: "Tên hàng hóa",
        render: (row) => (
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-[#1F2937]">
              {row.code}
            </span>
            <span className="text-[13px] text-gray-500">{row.name}</span>
          </div>
        ),
      },
      {
        key: "unitPrice",
        title: "Đơn giá",
        align: "right",
        headerClassName: "w-[120px]",
        cellClassName: "w-[120px] tabular-nums",
        render: (row) => formatVnd(row.unitPrice),
      },
      {
        key: "allowedQty",
        title: "SL được trả",
        align: "right",
        headerClassName: "w-[120px]",
        cellClassName: "w-[120px] tabular-nums",
        render: (row) => row.allowedQty,
      },
      {
        key: "returnQty",
        title: "SL trả",
        align: "right",
        headerClassName: "w-[120px]",
        cellClassName: "w-[120px]",
        render: (row) => (
          <PosNumberInput
            value={qtyById[row.id] ?? 0}
            onChange={(next) =>
              onChangeQty(row.id, clampReturnQty(next, row.allowedQty))
            }
            min={0}
            max={row.allowedQty}
            ariaLabel={`Số lượng trả ${row.name}`}
            variant="underline"
            inputMode="numeric"
            displayValue={String(qtyById[row.id] ?? 0)}
            parser={(raw) => {
              const digits = raw.replace(/\D/g, "");
              return digits === "" ? 0 : Number(digits);
            }}
            formatter={(value) => String(value)}
          />
        ),
      },
    ],
    [allChecked, onToggleAll, onToggleItem, onChangeQty, qtyById, selectedIds],
  );

  const title = invoice
    ? `Chọn hàng trả lại: ${invoice.invoiceNumber}`
    : "Chọn hàng trả lại";

  return (
    <PosDialog
      open={open}
      onClose={onClose}
      width={760}
      contentClassName="bg-white"
    >
      <PosDialog.Header title={title} />
      <PosDialog.Body className="flex flex-col gap-4">
        <PosDataTable<ReturnableItem>
          columns={columns}
          dataSource={items}
          rowKey={(row) => row.id}
          emptyText={
            loading
              ? "Đang tải hàng hóa..."
              : "Hóa đơn này không còn hàng hóa nào để trả."
          }
          rowClassName={(row) =>
            cn(selectedIds.has(row.id) && "bg-[#EEF2FF]")
          }
        />
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={onConfirm}
        onCancel={onClose}
        saveDisabled={!anyChecked}
      />
    </PosDialog>
  );
}
