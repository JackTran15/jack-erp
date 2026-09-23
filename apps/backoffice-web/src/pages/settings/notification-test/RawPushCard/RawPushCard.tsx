import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button, FormField, Input, MultiSelect, Textarea } from "@erp/ui";
import { getUserFacingApiErrorMessage } from "../../../../lib/user-facing-api-error";
import { HelpTooltip } from "../HelpTooltip/HelpTooltip";
import { useSendRawPush, useTestDevices } from "../_api/useNotificationTest";

/**
 * Bước 1 của việc dò: push THÔ, bỏ qua bộ lọc thiết lập và template.
 *
 * Nhận được ở đây = Firebase + APNs + cấu hình app + quyền thông báo trên máy
 * đều đúng. Không nhận được ở đây thì mọi thứ phía sau khỏi cần dò.
 *
 * Gửi được NHIỀU máy một lượt, và mỗi máy có kết quả riêng: một token chết
 * không làm hỏng lượt gửi tới những máy còn lại — đó là ca hay gặp khi trong
 * danh sách có một máy đã gỡ app.
 */
export function RawPushCard({
  deviceIds,
  onDeviceChange,
}: {
  deviceIds: string[];
  onDeviceChange: (ids: string[]) => void;
}) {
  const devices = useTestDevices(false);
  const send = useSendRawPush();
  const [title, setTitle] = useState("Thông báo thử");
  const [body, setBody] = useState("Nếu bạn thấy dòng này thì push đã chạy.");
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");

  const options = (devices.data ?? []).map((device) => ({
    value: device.id,
    label: `${device.userName} · ${device.platform} · …${device.tokenTail}`,
  }));

  const submit = async () => {
    if (deviceIds.length === 0) {
      toast.error("Chọn ít nhất một thiết bị.");
      return;
    }
    try {
      const result = await send.mutateAsync({
        deviceIds,
        title,
        body,
        ...(targetType ? { targetType } : {}),
        ...(targetId ? { targetId } : {}),
      });

      if (result.failed === 0) {
        toast.success(`Đã gửi tới ${result.sent} thiết bị.`);
        return;
      }
      // Mã lỗi của FCM giữ nguyên văn: nó nói ra bệnh (token chết, sai khoá APNs…).
      const lines = result.results
        .filter((item) => !item.sent)
        .map((item) => `…${item.tokenTail}: ${item.error ?? "không rõ"}`)
        .join("\n");
      toast.error(`Gửi được ${result.sent}/${result.results.length} máy.\n${lines}`, {
        duration: 12_000,
      });
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  return (
    <section className="flex flex-col rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="font-semibold">1 · Gửi push thô</h2>
        <HelpTooltip label="Thẻ này hoạt động thế nào">
          <p className="font-medium text-foreground">Gửi thẳng tới máy, không qua pipeline.</p>
          <p>
            Người nhận là <strong>đúng những máy bạn tick</strong> — lấy token của từng máy rồi
            gọi FCM. Không dò quyền, không xem cửa hàng, không đọc Thiết lập trong app, không
            dùng template: tiêu đề và nội dung là chữ bạn gõ ở đây.
          </p>
          <p>
            <strong>Không ghi gì xuống cơ sở dữ liệu.</strong> Vì vậy nó không xuất hiện trong
            danh sách Thông báo của app, và cũng không sinh dòng nào ở Nhật ký gửi.
          </p>
          <p>
            Máy rung ⇒ Firebase + APNs/FCM + cấu hình app + quyền thông báo trên máy đều đúng.
            Đây là mốc phải qua trước khi dò hai thẻ kia.
          </p>
          <p>
            Chọn nhiều máy thì mỗi máy có kết quả riêng; máy hỏng hiện nguyên mã lỗi của FCM
            (token chết, sai khoá APNs…). Máy đã thu hồi thì bị chặn ngay, không gửi máy nào.
          </p>
        </HelpTooltip>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Bỏ qua thiết lập của người nhận. Dùng để kiểm hạ tầng: Firebase, APNs, máy.
      </p>

      <div className="flex flex-col gap-3">
        <FormField label="Thiết bị" required hint="Chọn được nhiều máy; mỗi máy có kết quả riêng.">
          <MultiSelect
            options={options}
            value={deviceIds}
            onValueChange={onDeviceChange}
            placeholder={options.length ? "Chọn thiết bị…" : "Chưa có thiết bị nào"}
          />
        </FormField>
        <FormField label="Tiêu đề">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField label="Nội dung">
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Đích (tuỳ chọn)" hint="invoice, store, overview…">
            <Input
              value={targetType}
              placeholder="invoice"
              onChange={(e) => setTargetType(e.target.value)}
            />
          </FormField>
          <FormField label="Id của đích">
            <Input
              value={targetId}
              placeholder="id hoá đơn thật"
              onChange={(e) => setTargetId(e.target.value)}
            />
          </FormField>
        </div>
      </div>

      <Button
        className="mt-4 self-start"
        onClick={() => void submit()}
        disabled={send.isPending || deviceIds.length === 0}
      >
        <Send className="mr-1 h-4 w-4" />
        {send.isPending
          ? "Đang gửi…"
          : deviceIds.length > 0
            ? `Gửi push tới ${deviceIds.length} thiết bị`
            : "Gửi push"}
      </Button>
    </section>
  );
}
