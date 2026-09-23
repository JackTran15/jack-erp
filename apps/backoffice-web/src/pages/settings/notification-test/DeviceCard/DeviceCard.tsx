import { Check, RefreshCw, Send } from "lucide-react";
import { Button, formatViDateTime } from "@erp/ui";
import { BaseDataTable, type TableColumn } from "../../../../components/table/BaseDataTable";
import { useTestDevices } from "../_api/useNotificationTest";
import type { TestDevice } from "../_api/notification-test.types";

/**
 * Thiết bị đã đăng ký nhận thông báo. Đây là câu trả lời đầu tiên khi "máy không
 * nhận được gì": không có dòng nào ở đây thì app chưa từng gửi token lên — lỗi
 * nằm ở app hoặc ở quyền thông báo của máy, chưa tới lượt backend.
 */
export function DeviceCard({
  includeRevoked,
  onToggleRevoked,
  selectedDeviceIds,
  onPickDevice,
}: {
  includeRevoked: boolean;
  onToggleRevoked: () => void;
  selectedDeviceIds: string[];
  /** Bấm lần nữa trên một dòng đã chọn thì bỏ chọn — việc đó do trang quyết. */
  onPickDevice: (device: TestDevice) => void;
}) {
  const devices = useTestDevices(includeRevoked);

  const columns: TableColumn<TestDevice>[] = [
    {
      key: "user",
      label: "Người dùng",
      render: (row) => (
        <div>
          <div className="font-medium">{row.userName}</div>
          <div className="text-xs text-muted-foreground">{row.userEmail}</div>
        </div>
      ),
    },
    { key: "app", label: "App", render: (row) => row.app },
    { key: "platform", label: "Nền tảng", render: (row) => row.platform },
    { key: "locale", label: "Ngôn ngữ", render: (row) => row.locale },
    {
      key: "version",
      label: "Phiên bản / môi trường",
      render: (row) => [row.appVersion, row.environment].filter(Boolean).join(" · ") || "—",
    },
    {
      key: "lastSeen",
      label: "Lần cuối thấy",
      render: (row) => formatViDateTime(row.lastSeenAt),
    },
    {
      key: "token",
      label: "Token",
      render: (row) => <span className="font-mono text-xs">…{row.tokenTail}</span>,
    },
    {
      key: "state",
      label: "Trạng thái",
      render: (row) =>
        row.revokedAt ? (
          <span className="text-destructive">Đã thu hồi</span>
        ) : (
          <span className="text-emerald-600">Đang nhận</span>
        ),
    },
  ];

  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Thiết bị đã đăng ký</h2>
          <p className="text-sm text-muted-foreground">
            Mỗi lần đăng nhập trên app là một dòng. Đăng xuất thì dòng đó chuyển "Đã thu hồi".
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={onToggleRevoked}>
            {includeRevoked ? "Ẩn thiết bị đã thu hồi" : "Hiện cả đã thu hồi"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void devices.refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Làm mới
          </Button>
        </div>
      </header>

      <BaseDataTable
        columns={columns}
        rows={devices.data ?? []}
        loading={devices.isLoading}
        emptyLabel="Chưa có thiết bị nào đăng ký nhận thông báo."
        getRowKey={(row) => row.id}
        renderActions={(row) => {
          if (row.revokedAt) return null;
          const picked = selectedDeviceIds.includes(row.id);
          return (
            <Button
              variant={picked ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onPickDevice(row)}
            >
              {picked ? (
                <Check className="mr-1 h-4 w-4" />
              ) : (
                <Send className="mr-1 h-4 w-4" />
              )}
              {picked ? "Đã chọn" : "Chọn để gửi thử"}
            </Button>
          );
        }}
      />
    </section>
  );
}
