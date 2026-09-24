import { AppModal, cn } from "@erp/ui";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { StatusBadge } from "../../../components/status/StatusBadge";
import type {
  StockCheckLine,
  StockCheckOrder,
} from "../../../hooks/orders/use-admin-sales-orders";

/** Một đơn duyệt hỏng — `message` đã là câu tiếng Việt để hiện cạnh mã đơn. */
export interface ConfirmOrderFailure {
  orderId: string;
  message: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Kết quả đối chiếu tồn — vẽ ĐÚNG thứ tự server trả (đủ → thiếu, AC-31).
   * Tồn là tồn TẠI CHI NHÁNH đang thao tác (A-44): nơi gọi duy nhất là lưới
   * `/orders` của chi nhánh, qua `POST /mobile/sales-orders/stock-check`.
   */
  checks: StockCheckOrder[];
  /** Id đơn đã duyệt ở lượt vừa chạy; rỗng khi chưa bấm "Vẫn duyệt". */
  confirmed: string[];
  /** Đơn duyệt hỏng ở lượt vừa chạy — lỗi hiện ngay cạnh mã đơn (AC-33). */
  failures: ConfirmOrderFailure[];
  pending: boolean;
  onConfirm: () => void | Promise<void>;
}

const quantityFormat = new Intl.NumberFormat("vi-VN");

function qty(value: number): string {
  return quantityFormat.format(value);
}

/** "cần X / tồn Y / thiếu Z" — dòng đủ thì không có vế "thiếu". */
function describeLine(line: StockCheckLine): string {
  const base = `cần ${qty(line.required)} / tồn ${qty(line.available)}`;
  return line.shortBy > 0 ? `${base} / thiếu ${qty(line.shortBy)}` : base;
}

/**
 * Cảnh báo thiếu hàng trước khi duyệt (AC-31, AC-32, AC-33).
 *
 * Chỉ mở khi có ít nhất một đơn thiếu trong kết quả đối chiếu tồn, hoặc khi một
 * lượt duyệt thẳng có đơn hỏng. Thiếu không chặn duyệt — người duyệt đọc rồi tự
 * quyết: "Huỷ" là không gọi gì cả, "Vẫn duyệt" duyệt mọi đơn trong danh sách.
 *
 * Dialog KHÔNG đóng khi có đơn hỏng: lỗi chỉ đọc được khi nó còn nằm cạnh đúng
 * mã đơn.
 */
export function ConfirmOrdersDialog({
  open,
  onOpenChange,
  checks,
  confirmed,
  failures,
  pending,
  onConfirm,
}: Props) {
  const shortCount = checks.filter((order) => !order.sufficient).length;
  // Sau một lượt duyệt dialog chỉ còn để đọc kết quả: duyệt lại là no-op với
  // đơn đã duyệt và lặp lại đúng lỗi với đơn hỏng.
  const settled = confirmed.length > 0 || failures.length > 0;

  const description =
    shortCount > 0
      ? `Theo tồn tại chi nhánh này, ${shortCount}/${checks.length} đơn thiếu hàng. ` +
        "Đơn thiếu vẫn duyệt được — hãy kiểm tra trước khi duyệt."
      : `Đối chiếu ${checks.length} đơn đã chọn với tồn tại chi nhánh này: tất cả đủ hàng.`;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Duyệt đơn"
      description={description}
      saveLabel={pending ? "Đang duyệt…" : "Vẫn duyệt"}
      cancelLabel={settled ? "Đóng" : "Huỷ"}
      saveDisabled={pending || settled || checks.length === 0}
      onSave={onConfirm}
      onCancel={() => onOpenChange(false)}
      defaultWidth={720}
      bodyStretch={false}
      preventOutsideClose
      autoHeight
    >
      <div className="flex max-h-[60vh] flex-col gap-3 overflow-auto">
        {checks.map((order) => {
          const failure = failures.find((item) => item.orderId === order.orderId);
          const ok = confirmed.includes(order.orderId);
          return (
            <section
              key={order.orderId}
              className="rounded-md border border-border"
            >
              <header className="flex flex-wrap items-center gap-2 bg-muted px-2 py-1">
                <span className="font-semibold text-foreground">
                  {order.orderCode || "(chưa có mã)"}
                </span>
                {order.sufficient ? (
                  <StatusBadge variant="success">Đủ hàng</StatusBadge>
                ) : (
                  <StatusBadge variant="warning" className="gap-1">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    Thiếu {order.shortLineCount} dòng
                  </StatusBadge>
                )}
                {failure ? (
                  <span className="flex items-start gap-1 text-sm text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>{failure.message}</span>
                  </span>
                ) : ok ? (
                  <span className="flex items-center gap-1 text-sm text-success">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Đã duyệt
                  </span>
                ) : null}
              </header>

              <table className="w-full border-collapse text-sm">
                <tbody>
                  {order.lines.map((line) => {
                    const short = line.shortBy > 0;
                    return (
                      <tr
                        key={line.itemId}
                        className={cn(
                          "border-t border-border",
                          short && "bg-warning-subtle",
                        )}
                      >
                        <td className="w-32 px-2 py-1 text-muted-foreground">
                          {line.itemCode}
                        </td>
                        <td className="px-2 py-1">{line.itemName}</td>
                        <td
                          className={cn(
                            "whitespace-nowrap px-2 py-1 text-right tabular-nums",
                            short && "font-medium text-warning",
                          )}
                        >
                          {describeLine(line)}
                        </td>
                      </tr>
                    );
                  })}
                  {order.lines.length === 0 ? (
                    <tr className="border-t border-border">
                      <td className="px-2 py-1 text-muted-foreground" colSpan={3}>
                        Đơn không có dòng hàng nào.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </AppModal>
  );
}
