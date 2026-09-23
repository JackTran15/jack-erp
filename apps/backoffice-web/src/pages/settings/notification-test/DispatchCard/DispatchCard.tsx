import { useState } from "react";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { Button, FormField, Input, MultiSelect, SingleSelect } from "@erp/ui";
import { useMyBranches } from "../../../../hooks/iam/useBranches";
import { getUserFacingApiErrorMessage } from "../../../../lib/user-facing-api-error";
import { HelpTooltip } from "../HelpTooltip/HelpTooltip";
import { notificationTypeOptionLabel } from "../_api/notification-type-label";
import { useDispatchTest, useTestDevices, useTestTypes } from "../_api/useNotificationTest";

/**
 * Bước 2: bắn một loại thông báo THẬT qua đúng pipeline.
 *
 * Bộ lọc thiết lập, câu chữ theo template và deeplink đều là đường thật — chỉ dữ
 * liệu là mẫu, và **người nhận do bạn chọn** thay vì dò theo quyền, để lượt bấm
 * thử rơi đúng máy đang cầm trên tay chứ không tới điện thoại của cả phòng.
 *
 * Vì bước lọc thiết lập vẫn chạy, "0 người nhận" ở đây vẫn là câu trả lời có
 * nghĩa: người đó đã tắt loại này trong app.
 */
export function DispatchCard() {
  const types = useTestTypes();
  const branches = useMyBranches();
  const devices = useTestDevices(false);
  const dispatch = useDispatchTest();

  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [type, setType] = useState("");
  const [branchId, setBranchId] = useState("");
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");

  const eventTypes = (types.data ?? []).filter((t) => t.trigger === "event");
  const selected = eventTypes.find((t) => t.type === type);

  const submit = async () => {
    if (!type) {
      toast.error("Chọn một loại thông báo trước.");
      return;
    }
    if (deviceIds.length === 0) {
      toast.error("Chọn ít nhất một thiết bị nhận.");
      return;
    }
    // Chỉ gửi những khoá người dùng thật sự nhập; phần còn lại server điền mẫu.
    const data: Record<string, string | number> = {};
    if (code) data.code = code;
    if (amount) data.amount = Number(amount);

    try {
      const result = await dispatch.mutateAsync({
        type,
        deviceIds,
        ...(branchId ? { branchId } : {}),
        ...(Object.keys(data).length ? { data } : {}),
        ...(targetType ? { targetType } : {}),
        ...(targetId ? { targetId } : {}),
      });
      if (result.status === "created") {
        toast.success(
          `${result.targetedUsers} người nhận · ${result.notifications} thông báo · ${result.deliveries} lượt gửi.`,
        );
      } else {
        toast.warning(`Không gửi ai: ${reasonLabel(result.reason)}`, { duration: 8_000 });
      }
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  return (
    <section className="flex flex-col rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="font-semibold">2 · Bắn thử một loại thật</h2>
        <HelpTooltip label="Thẻ này hoạt động thế nào">
          <p className="font-medium text-foreground">
            Người nhận là CHỦ NHÂN của máy bạn tick.
          </p>
          <p>
            Bước duy nhất bị thay so với thông báo thật là <em>dò người theo quyền</em> — để một
            lượt bấm không đi tới điện thoại của cả phòng. Hệ quả: người đó nhận trên{" "}
            <strong>mọi</strong> thiết bị của họ, không riêng máy được tick.
          </p>
          <p>Mọi bước còn lại vẫn là đường thật, theo đúng thứ tự:</p>
          <p className="text-muted-foreground">
            lọc theo Thiết lập trong app → dựng câu chữ từ template (vi/en) → gắn deeplink →
            ghi <code>notifications</code> + <code>notification_deliveries</code> → worker gửi FCM.
          </p>
          <p>
            <strong>Dữ liệu là mẫu</strong> (mã <code>TEST-0001</code>, số tiền 1.234.000…) —
            không hoá đơn, không phiếu kho nào được tạo. Chỉ còn lại vài dòng trong danh sách
            Thông báo của người nhận.
          </p>
          <p>
            Mã sự kiện ngẫu nhiên mỗi lần nên bấm bao nhiêu lần cũng gửi. Báo{" "}
            <em>&ldquo;không gửi ai&rdquo;</em> nghĩa là người đó đã tắt loại này trong app.
          </p>
        </HelpTooltip>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Chạy đúng pipeline: lọc theo thiết lập, dựng câu chữ từ template, gắn deeplink.
      </p>

      <div className="flex flex-col gap-3">
        <FormField
          label="Thiết bị nhận"
          required
          hint="Người sở hữu thiết bị đã chọn thành người nhận — MỌI thiết bị của người đó sẽ nhận, không riêng máy này."
        >
          <MultiSelect
            options={(devices.data ?? []).map((device) => ({
              value: device.id,
              label: `${device.userName} · ${device.platform} · …${device.tokenTail}`,
            }))}
            value={deviceIds}
            onValueChange={setDeviceIds}
            placeholder={
              devices.data?.length ? "Chọn thiết bị…" : "Chưa có thiết bị nào đăng ký"
            }
          />
        </FormField>
        <FormField label="Loại thông báo" required>
          <SingleSelect
            options={eventTypes.map((t) => ({
              value: t.type,
              label: notificationTypeOptionLabel(t.type),
            }))}
            value={type}
            onValueChange={setType}
            placeholder={eventTypes.length ? "Chọn loại…" : "Đang tải…"}
            searchable
          />
        </FormField>
        {selected ? (
          <p className="-mt-1 text-xs text-muted-foreground">
            Quyền yêu cầu: {selected.permissions.join(", ") || "—"} · App:{" "}
            {selected.targetApps.join(", ")}
          </p>
        ) : null}
        <FormField label="Cửa hàng" hint="Bỏ trống = thông báo cấp tổ chức">
          <SingleSelect
            options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
            value={branchId}
            onValueChange={setBranchId}
            placeholder="Chọn cửa hàng…"
            searchable
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Mã chứng từ" hint="Bỏ trống → TEST-0001">
            <Input value={code} placeholder="HD-TEST" onChange={(e) => setCode(e.target.value)} />
          </FormField>
          <FormField label="Số tiền" hint="Bỏ trống → 1.234.000">
            <Input
              type="number"
              value={amount}
              placeholder="1234000"
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Đích (tuỳ chọn)" hint="Chạm push sẽ mở màn này">
            <Input
              value={targetType}
              placeholder="invoice"
              onChange={(e) => setTargetType(e.target.value)}
            />
          </FormField>
          <FormField label="Id của đích">
            <Input
              value={targetId}
              placeholder="id thật để mở đúng bản ghi"
              onChange={(e) => setTargetId(e.target.value)}
            />
          </FormField>
        </div>
      </div>

      <Button
        className="mt-4 self-start"
        onClick={() => void submit()}
        disabled={dispatch.isPending || deviceIds.length === 0 || !type}
      >
        <Zap className="mr-1 h-4 w-4" />
        {dispatch.isPending
          ? "Đang bắn…"
          : deviceIds.length > 0
            ? `Bắn thử tới ${deviceIds.length} thiết bị`
            : "Bắn thử"}
      </Button>
    </section>
  );
}

function reasonLabel(reason: string | null): string {
  switch (reason) {
    case "no-recipient":
      return "không ai đủ quyền, hoặc mọi người đã tắt loại này trong app";
    case "build-null":
      return "definition trả về rỗng với dữ liệu mẫu";
    case "should-send":
      return "definition từ chối sự kiện này";
    default:
      return reason ?? "không rõ";
  }
}
