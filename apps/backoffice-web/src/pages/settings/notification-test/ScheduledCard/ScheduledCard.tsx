import { useState } from "react";
import { Clock, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@erp/ui";
import { getUserFacingApiErrorMessage } from "../../../../lib/user-facing-api-error";
import { HelpTooltip } from "../HelpTooltip/HelpTooltip";
import { notificationTypeLabel } from "../_api/notification-type-label";
import { useRunScheduled, useTestTypes } from "../_api/useNotificationTest";
import type { RunScheduledResult } from "../_api/notification-test.types";

/**
 * Bước 3: chạy NGAY một job vốn chỉ chạy đúng một lần mỗi ngày.
 *
 * Dữ liệu là dữ liệu THẬT của hôm qua, nên đây cũng là cách đối chiếu con số
 * trong push với màn Tổng quan kỳ "hôm qua".
 *
 * **Người nhận do QUYỀN quyết, không phải thiết bị bạn chọn ở hai thẻ kia** —
 * job hằng ngày gửi cho mọi người đủ quyền ở mọi tổ chức, và nút này chạy đúng
 * job đó. Vì vậy kết quả hay im lặng, và ô kết quả dưới đây nói ra vì sao.
 */
export function ScheduledCard() {
  const types = useTestTypes();
  const run = useRunScheduled();
  const [last, setLast] = useState<RunScheduledResult | null>(null);

  const scheduled = (types.data ?? []).filter((t) => t.trigger === "schedule");

  const fire = async (type: string) => {
    try {
      const result = await run.mutateAsync(type);
      setLast(result);
      if (result.deliveries > 0) {
        toast.success(
          `${notificationTypeLabel(result.type)}: ${result.notifications} thông báo · ${result.deliveries} lượt gửi.`,
        );
      } else {
        toast.warning(diagnose(result), { duration: 12_000 });
      }
    } catch (err) {
      setLast(null);
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  return (
    <section className="flex flex-col rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="font-semibold">3 · Chạy job theo lịch</h2>
        <HelpTooltip label="Thẻ này hoạt động thế nào">
          <p className="font-medium text-foreground">
            Hệ tự đi tìm người nhận — bạn không chọn ai cả.
          </p>
          <p>
            Nút này gọi đúng hàm mà lịch 08:00 / 09:00 gọi, chỉ bỏ qua điều kiện giờ. Vì job
            hằng ngày chạy lúc không ai ngồi bấm nút, nó phải tự trả lời &ldquo;gửi cho
            ai&rdquo; từ dữ liệu — và câu trả lời đó là quyền.
          </p>
          <p>
            <strong>Thiết bị tick ở hai thẻ trên KHÔNG áp dụng ở đây.</strong> Với mỗi chuyện
            đáng báo (mỗi cửa hàng), người nhận phải đủ cả ba:
          </p>
          <p className="text-muted-foreground">
            ① có quyền của loại đó — <code>inventory.read</code> cho cảnh báo tồn kho,{" "}
            <code>reporting.sales.revenue-by-item.read</code> cho doanh thu → ② được gán đúng
            cửa hàng đó và cửa hàng đang hoạt động → ③ chưa tắt loại đó trong app.
          </p>
          <p>
            Dữ liệu là dữ liệu <strong>thật</strong>: doanh thu của hôm qua, tồn kho hiện tại;
            và job quét mọi tổ chức, không riêng tổ chức của bạn.
          </p>
          <p>
            Mã sự kiện cố định theo <em>(loại + tổ chức + ngày)</em>, nên{" "}
            <strong>hôm nay đã gửi rồi thì bấm nữa cũng không gửi lại</strong>.
          </p>
          <p>
            &ldquo;N lượt bắn&rdquo; là số chuyện đáng báo mà job tìm thấy,{" "}
            <strong>không phải số đã gửi</strong> — ô kết quả dưới nút nói ra bao nhiêu bị bỏ và
            vì sao.
          </p>
        </HelpTooltip>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Không phải chờ tới giờ. Người nhận do quyền quyết — thiết bị chọn ở thẻ trên không
        áp dụng ở đây.
      </p>

      <div className="flex flex-col gap-2">
        {scheduled.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {types.isLoading ? "Đang tải…" : "Không có loại nào chạy theo lịch."}
          </p>
        ) : (
          scheduled.map((t) => (
            <div
              key={t.type}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="font-medium">{notificationTypeLabel(t.type)}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{t.type}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  chạy hằng ngày lúc {t.at}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={run.isPending}
                onClick={() => void fire(t.type)}
              >
                <Play className="mr-1 h-4 w-4" />
                Chạy ngay
              </Button>
            </div>
          ))
        )}
      </div>

      {last ? (
        <div className="mt-3 rounded-md border bg-muted/40 p-3 text-sm">
          <div className="font-medium">
            Lượt chạy gần nhất · {notificationTypeLabel(last.type)}
          </div>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            <li>{last.firings} chuyện đáng báo mà job tìm thấy</li>
            <li>{last.notifications} thông báo mới · {last.deliveries} lượt gửi</li>
            {last.duplicate > 0 ? <li>{last.duplicate} bị bỏ vì hôm nay đã gửi rồi</li> : null}
            {last.noRecipient > 0 ? (
              <li>{last.noRecipient} bị bỏ vì không ai đủ điều kiện nhận</li>
            ) : null}
            {last.failed > 0 ? <li className="text-destructive">{last.failed} lỗi</li> : null}
          </ul>
          {last.deliveries === 0 ? (
            <p className="mt-2 text-xs">{diagnose(last)}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Một lượt chạy im lặng có bốn nguyên nhân khác hẳn nhau. Đọc theo thứ tự này
 * vì nguyên nhân đứng trước làm những nguyên nhân sau không còn ý nghĩa.
 */
function diagnose(result: RunScheduledResult): string {
  if (result.firings === 0) {
    return "Không có gì để báo: hôm qua chưa có doanh thu, hoặc chưa mặt hàng nào hết tồn.";
  }
  if (result.failed === result.firings) {
    return `Mọi lượt bắn đều lỗi: ${result.details.find((d) => d.reason)?.reason ?? "xem log máy chủ"}`;
  }
  if (result.duplicate === result.firings) {
    return "Hôm nay đã gửi rồi nên không gửi lại — mã sự kiện cố định theo ngày. Xoá các dòng notifications của loại này rồi chạy lại, hoặc thử vào ngày mai.";
  }
  if (result.noRecipient === result.firings) {
    return "Không ai đủ điều kiện nhận: thiếu quyền của loại này, chưa được gán cửa hàng phát sinh, hoặc đã tắt loại đó trong app.";
  }
  if (result.notifications > 0) {
    return "Đã ghi thông báo vào hộp thư nhưng không xếp được lượt gửi nào — người nhận không có thiết bị nào đang hoạt động (bảng ① ở trên).";
  }
  return "Không có lượt gửi nào. Xem chi tiết từng lượt bắn ở log máy chủ.";
}
