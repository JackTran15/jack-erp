import { useQueryClient } from "@tanstack/react-query";
import { AppModal } from "@erp/ui";
import { toast } from "sonner";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../../../store/page-stores/orders/orders.store";
import { formatOrderMoney } from "../../_lib/order-format";
import { getOrderRows, reconcileOrders } from "../../_mock/orders.mock";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Xác nhận đối soát cho các đơn đã tick.
 *
 * Spec không mô tả nội dung màn "Đối soát"; ở đây chọn ngữ nghĩa tối thiểu và
 * rõ ràng: đánh dấu đã đối soát + cấp một mã phiếu chung cho lô.
 */
export function OrdersReconcileDialog({ open, onOpenChange }: Props) {
  const checkedOrderIds = useOrdersStore((s) => s.checkedOrderIds);
  const { setCheckedOrderIds } = useOrdersActions();
  const queryClient = useQueryClient();

  const selected = getOrderRows().filter((row) =>
    checkedOrderIds.includes(row.id),
  );

  const handleSave = () => {
    reconcileOrders(checkedOrderIds);
    setCheckedOrderIds([]);
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    toast.success(`Đã đối soát ${checkedOrderIds.length} đơn hàng.`);
    onOpenChange(false);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Đối soát đơn hàng"
      description={`Xác nhận đối soát ${selected.length} đơn hàng đã chọn.`}
      saveLabel="Đối soát"
      cancelLabel="Đóng"
      saveDisabled={selected.length === 0}
      onSave={handleSave}
      onCancel={() => onOpenChange(false)}
      defaultWidth={560}
      bodyStretch={false}
      autoHeight
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted">
            <th className="border border-border px-2 py-1 text-left font-semibold">
              Hóa đơn
            </th>
            <th className="border border-border px-2 py-1 text-right font-semibold">
              Tổng thanh toán
            </th>
            <th className="border border-border px-2 py-1 text-left font-semibold">
              Trạng thái đối soát
            </th>
          </tr>
        </thead>
        <tbody>
          {selected.map((row) => (
            <tr key={row.id}>
              <td className="border border-border px-2 py-1">{row.invoiceCode}</td>
              <td className="border border-border px-2 py-1 text-right tabular-nums">
                {formatOrderMoney(row.totalAmount)}
              </td>
              <td className="border border-border px-2 py-1">
                {row.reconciliationStatus}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppModal>
  );
}
