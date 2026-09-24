import { AppModal, cn } from "@erp/ui";
import { AlertTriangle } from "lucide-react";
import { StatusBadge } from "../../../components/status/StatusBadge";
import { useBranches } from "../../../hooks/iam/useBranches";
import type {
  StockCheckLine,
  StockCheckOrder,
} from "../../../hooks/orders/use-admin-sales-orders";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Kết quả `stock-check` với chi nhánh đã chọn của từng đơn — vẽ ĐÚNG thứ tự
   * server trả (đủ → thiếu, A-39). Đơn chưa chọn chi nhánh không có ở đây.
   */
  checks: StockCheckOrder[];
}

const quantityFormat = new Intl.NumberFormat("vi-VN");

function qty(value: number): string {
  return quantityFormat.format(value);
}

/**
 * Báo cáo "Validate" của màn Điều phối (AC-43).
 *
 * CHỈ ĐỌC: không có nút lưu, đóng dialog là xong — thiếu hàng không chặn "Lưu"
 * (A-38), báo cáo này chỉ để Admin xem trước. Nó mở CHỒNG lên
 * `DispatchOrdersDialog`; đóng báo cáo là quay lại dialog đó với lựa chọn chi
 * nhánh còn nguyên, để Admin tự đổi nếu muốn.
 */
export function ValidateDispatchDialog({ open, onOpenChange, checks }: Props) {
  const branchesQuery = useBranches(open);
  const branchNameById = new Map(
    (branchesQuery.data ?? []).map((branch) => [branch.id, branch.name]),
  );
  const branchName = (branchId: string | null): string =>
    (branchId && branchNameById.get(branchId)) || "(chi nhánh)";

  const shortCount = checks.filter((order) => !order.sufficient).length;
  const description =
    shortCount > 0
      ? `${shortCount}/${checks.length} đơn thiếu hàng tại chi nhánh đã chọn. ` +
        "Thiếu hàng không chặn \"Lưu\"."
      : `Đối chiếu ${checks.length} đơn: tất cả đủ hàng tại chi nhánh đã chọn.`;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Kiểm tra tồn theo chi nhánh"
      description={description}
      cancelLabel="Đóng"
      onCancel={() => onOpenChange(false)}
      defaultWidth={760}
      bodyStretch={false}
      autoHeight
    >
      <div className="flex max-h-[60vh] flex-col gap-3 overflow-auto">
        {checks.map((order) => {
          const branch = branchName(order.branchId);
          return (
            <section key={order.orderId} className="rounded-md border border-border">
              <header className="flex flex-wrap items-center gap-2 bg-muted px-2 py-1">
                <span className="font-semibold text-foreground">
                  {order.orderCode || "(chưa có mã)"}
                </span>
                <span className="text-sm text-muted-foreground">→ {branch}</span>
                {order.sufficient ? (
                  <StatusBadge variant="success">Đủ hàng</StatusBadge>
                ) : (
                  <StatusBadge variant="warning" className="gap-1">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    Thiếu {order.shortLineCount} dòng
                  </StatusBadge>
                )}
              </header>

              <table className="w-full border-collapse text-sm">
                <tbody>
                  {order.lines.map((line) => (
                    <LineRow key={line.itemId} line={line} branch={branch} />
                  ))}
                  {order.lines.length === 0 ? (
                    <tr className="border-t border-border">
                      <td className="px-2 py-1 text-muted-foreground" colSpan={4}>
                        Đơn không có dòng hàng nào.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </section>
          );
        })}
        {checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có đơn nào được chọn chi nhánh.
          </p>
        ) : null}
      </div>
    </AppModal>
  );
}

interface LineRowProps {
  line: StockCheckLine;
  branch: string;
}

function LineRow({ line, branch }: LineRowProps) {
  const short = line.shortBy > 0;
  return (
    <tr className={cn("border-t border-border", short && "bg-warning-subtle")}>
      <td className="w-32 px-2 py-1 text-muted-foreground">{line.itemCode}</td>
      <td className="px-2 py-1">{line.itemName}</td>
      <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
        cần {qty(line.required)} / tồn {qty(line.available)} tại {branch}
      </td>
      <td
        className={cn(
          "whitespace-nowrap px-2 py-1 text-right tabular-nums",
          short && "font-medium text-warning",
        )}
      >
        {short ? `thiếu ${qty(line.shortBy)} tại ${branch}` : ""}
      </td>
    </tr>
  );
}
