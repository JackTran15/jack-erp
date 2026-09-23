import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@erp/ui";
import { AdminPageShell } from "../../../components/layout/AdminPageShell";
import { useNotificationTestActions } from "../../../store/page-stores/notification-test/notification-test.store";
import { DeliveryLogCard } from "./DeliveryLogCard/DeliveryLogCard";
import { DeviceCard } from "./DeviceCard/DeviceCard";
import { DispatchCard } from "./DispatchCard/DispatchCard";
import { PasscodeGate } from "./PasscodeGate/PasscodeGate";
import { RawPushCard } from "./RawPushCard/RawPushCard";
import { ScheduledCard } from "./ScheduledCard/ScheduledCard";

/**
 * Công cụ TẠM để dò đường thông báo đẩy. Bỏ đi khi module đã chạy ổn — danh
 * sách file cần xoá ghi ở `apps/api/.../notification/notification-test.config.ts`.
 *
 * Trang trả lời bốn câu, theo đúng thứ tự nên dò:
 * 1. máy đã đăng ký nhận chưa (thẻ Thiết bị)
 * 2. push có tới máy không (Gửi push thô — kiểm Firebase/APNs/quyền máy)
 * 3. một loại thật có đi đúng người, đúng câu chữ không (Bắn thử)
 * 4. tắc ở khâu nào (Nhật ký gửi)
 */
export function NotificationTestPage() {
  const { lock } = useNotificationTestActions();
  const [includeRevoked, setIncludeRevoked] = useState(false);
  // Thiết bị chọn ở bảng ① chảy xuống thẻ ② — bấm lần nữa là bỏ chọn.
  const [deviceIds, setDeviceIds] = useState<string[]>([]);

  return (
    <AdminPageShell>
      <PasscodeGate>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Test thông báo</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Công cụ nội bộ, tạm thời. Thông báo gửi từ đây là thông báo THẬT — nó hiện
              trên điện thoại của người nhận.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={lock}>
            <Lock className="mr-1 h-4 w-4" />
            Khoá lại
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <DeviceCard
            includeRevoked={includeRevoked}
            onToggleRevoked={() => setIncludeRevoked((v) => !v)}
            selectedDeviceIds={deviceIds}
            onPickDevice={(device) =>
              setDeviceIds((ids) =>
                ids.includes(device.id)
                  ? ids.filter((id) => id !== device.id)
                  : [...ids, device.id],
              )
            }
          />

          <div className="grid gap-4 lg:grid-cols-3">
            <RawPushCard deviceIds={deviceIds} onDeviceChange={setDeviceIds} />
            <DispatchCard />
            <ScheduledCard />
          </div>

          <DeliveryLogCard />
        </div>
      </PasscodeGate>
    </AdminPageShell>
  );
}
