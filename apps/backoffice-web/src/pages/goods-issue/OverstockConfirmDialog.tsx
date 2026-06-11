import { AppModal } from "@erp/ui";

export interface OverstockWarningRow {
  itemId: string;
  itemName: string;
  availableQuantity: number;
  unit: string;
  storageName: string;
}

interface OverstockConfirmDialogProps {
  rows: OverstockWarningRow[];
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function OverstockConfirmDialog({
  rows,
  loading = false,
  onConfirm,
  onCancel,
}: OverstockConfirmDialogProps) {
  return (
    <AppModal
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title="Xác nhận xuất quá số lượng tồn"
      onSave={onConfirm}
      onCancel={onCancel}
      saveLabel={loading ? "Đang xử lý…" : "Tiếp tục"}
      cancelLabel="Không"
      saveDisabled={loading}
      className="max-w-3xl"
    >
      <p className="mb-3 text-sm text-foreground">
        Bạn đang xuất quá số lượng tồn của những hàng hoá sau:
      </p>
      <div className="overflow-hidden rounded border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="border-r px-3 py-2 text-left font-medium">
                Tên hàng hoá
              </th>
              <th className="border-r px-3 py-2 text-right font-medium">
                Số tồn
              </th>
              <th className="border-r px-3 py-2 text-left font-medium">ĐVT</th>
              <th className="px-3 py-2 text-left font-medium">Kho xuất</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.itemId}:${row.storageName}`} className="border-t">
                <td className="border-r px-3 py-2">{row.itemName}</td>
                <td className="border-r px-3 py-2 text-right tabular-nums">
                  {row.availableQuantity.toLocaleString("vi-VN")}
                </td>
                <td className="border-r px-3 py-2">{row.unit}</td>
                <td className="px-3 py-2">{row.storageName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-foreground">
        Bạn có muốn tiếp tục không?
      </p>
    </AppModal>
  );
}
