import { useEffect, useState } from "react";
import { AppModal, SingleSelect, cn } from "@erp/ui";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useBranches } from "../../../hooks/iam/useBranches";
import {
  useDispatchSalesOrders,
  type DispatchFailure,
} from "../../../hooks/orders/use-admin-sales-orders";

/** Một đơn đang được chọn để phân — chỉ những gì dialog cần để gọi tên nó. */
export interface DispatchCandidate {
  id: string;
  /** Mã chứng từ của đơn; rỗng khi server chưa trả (không bao giờ in UUID ra cho người dùng). */
  code: string;
  /** Người nhận hàng — dòng phụ để Admin nhận ra đơn nào. */
  recipient: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: DispatchCandidate[];
  /**
   * Các đơn đã phân xong — trang gọi để bỏ tick đúng những dòng đó. Đơn LỖI
   * vẫn được giữ tick để Admin thấy mình vừa trượt cái gì.
   */
  onDispatched: (orderIds: string[]) => void;
}

function orderLabel(order: DispatchCandidate): string {
  return order.code || "(chưa có mã)";
}

/**
 * Chọn chi nhánh rồi phân cả mẻ đơn đã tick.
 *
 * Dialog KHÔNG đóng khi có đơn hỏng: "2 thành công, 1 bị người khác lấy mất" là
 * hai tin khác nhau, và tin thứ hai chỉ đọc được khi nó còn nằm cạnh đúng mã
 * đơn. Đóng luôn rồi bắn một toast đỏ là nuốt mất nửa kết quả.
 */
export function DispatchBranchDialog({
  open,
  onOpenChange,
  orders,
  onDispatched,
}: Props) {
  const [branchId, setBranchId] = useState("");
  const [failures, setFailures] = useState<DispatchFailure[]>([]);
  const [dispatched, setDispatched] = useState<string[]>([]);
  /**
   * Danh sách chụp lại lúc bấm phân.
   *
   * Sau khi invalidate, đơn đã phân (và đơn bị người khác lấy mất) đều rời khỏi
   * pool, nên prop `orders` co lại còn rỗng. Không chụp thì bảng kết quả trống
   * trơn đúng lúc người dùng cần đọc nó nhất.
   */
  const [submitted, setSubmitted] = useState<DispatchCandidate[] | null>(null);

  const branchesQuery = useBranches(open);
  const dispatchMutation = useDispatchSalesOrders();

  // Mỗi lần mở là một mẻ mới: kết quả của mẻ trước không được đứng lại đây.
  useEffect(() => {
    if (!open) return;
    setFailures([]);
    setDispatched([]);
    setSubmitted(null);
  }, [open]);

  const branchOptions = (branchesQuery.data ?? []).map((branch) => ({
    value: branch.id,
    label: branch.code ? `${branch.name} (${branch.code})` : branch.name,
  }));
  const branchName =
    branchOptions.find((option) => option.value === branchId)?.label ?? "";

  const pending = dispatchMutation.isPending;
  const displayed = submitted ?? orders;

  const handleSave = async () => {
    if (!branchId || orders.length === 0 || pending) return;

    const batch = [...orders];
    setSubmitted(batch);

    const result = await dispatchMutation.mutateAsync({
      orderIds: batch.map((order) => order.id),
      branchId,
    });

    setFailures(result.failed);
    setDispatched(result.dispatched);
    onDispatched(result.dispatched);

    if (result.failed.length === 0) {
      toast.success(
        `Đã phân ${result.dispatched.length} đơn về chi nhánh ${branchName}.`,
      );
      onOpenChange(false);
      return;
    }

    toast.error(
      `Phân được ${result.dispatched.length}/${batch.length} đơn. ` +
        `${result.failed.length} đơn không phân được.`,
    );
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Phân đơn về chi nhánh"
      description={`Phân ${displayed.length} đơn đã chọn về một chi nhánh. Đơn giữ nguyên trạng thái chờ xử lý.`}
      saveLabel={pending ? "Đang phân…" : "Phân đơn"}
      cancelLabel="Đóng"
      saveDisabled={pending || !branchId || orders.length === 0}
      onSave={handleSave}
      onCancel={() => onOpenChange(false)}
      defaultWidth={600}
      bodyStretch={false}
      preventOutsideClose
      autoHeight
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            Chi nhánh nhận đơn
          </span>
          <SingleSelect
            options={branchOptions}
            value={branchId}
            onValueChange={setBranchId}
            placeholder={
              branchesQuery.isPending ? "Đang tải chi nhánh…" : "Chọn chi nhánh"
            }
            disabled={pending || branchesQuery.isPending}
            searchable
            searchPlaceholder="Tìm chi nhánh…"
          />
        </div>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="border border-border px-2 py-1 text-left font-semibold">
                Mã đơn
              </th>
              <th className="border border-border px-2 py-1 text-left font-semibold">
                Người nhận
              </th>
              <th className="border border-border px-2 py-1 text-left font-semibold">
                Kết quả
              </th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((order) => {
              const failure = failures.find((item) => item.orderId === order.id);
              const ok = dispatched.includes(order.id);
              return (
                <tr key={order.id}>
                  <td className="border border-border px-2 py-1">
                    {orderLabel(order)}
                  </td>
                  <td className="border border-border px-2 py-1">
                    {order.recipient}
                  </td>
                  <td
                    className={cn(
                      "border border-border px-2 py-1",
                      failure && "text-destructive",
                      ok && "text-success",
                    )}
                  >
                    {failure ? (
                      <span className="flex items-start gap-1">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{failure.message}</span>
                      </span>
                    ) : ok ? (
                      `Đã phân về ${branchName}`
                    ) : (
                      "Chờ phân"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppModal>
  );
}
