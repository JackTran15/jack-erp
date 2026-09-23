import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, SingleSelect, formatViDateTime } from "@erp/ui";
import { BaseDataTable, type TableColumn } from "../../../../components/table/BaseDataTable";
import { notificationTypeLabel, notificationTypeOptionLabel } from "../_api/notification-type-label";
import { useTestDeliveries, useTestTypes } from "../_api/useNotificationTest";
import type { TestDelivery } from "../_api/notification-test.types";
import { DeliveryStatusBadge } from "./statusBadge";

/**
 * Nhật ký gửi — nơi trả lời câu "máy không nhận thì tắc ở khâu nào".
 *
 * Có dòng mà trạng thái `failed`/`dropped` thì lỗi nằm ở FCM/APNs và `lastError`
 * nói ra bệnh. Không có dòng nào thì chưa tới bước gửi: hoặc không ai nhận, hoặc
 * người nhận không có thiết bị nào đang hoạt động.
 */
export function DeliveryLogCard() {
  const types = useTestTypes();
  const [type, setType] = useState("");
  const deliveries = useTestDeliveries({ type: type || undefined });

  const columns: TableColumn<TestDelivery>[] = [
    {
      key: "createdAt",
      label: "Thời điểm",
      width: 150,
      render: (row) => formatViDateTime(row.createdAt),
    },
    {
      key: "type",
      label: "Loại",
      width: 150,
      render: (row) => notificationTypeLabel(row.type),
    },
    { key: "userName", label: "Người nhận", render: (row) => row.userName },
    { key: "channel", label: "Kênh", width: 90, render: (row) => row.channel },
    {
      key: "status",
      label: "Trạng thái",
      width: 140,
      render: (row) => <DeliveryStatusBadge status={row.status} />,
    },
    { key: "attempts", label: "Số lần thử", width: 90, render: (row) => row.attempts },
    {
      key: "sentAt",
      label: "Gửi lúc",
      width: 150,
      render: (row) => (row.sentAt ? formatViDateTime(row.sentAt) : "—"),
    },
    {
      key: "tokenTail",
      label: "Thiết bị",
      width: 110,
      render: (row) =>
        row.tokenTail ? <span className="font-mono text-xs">…{row.tokenTail}</span> : "—",
    },
    {
      key: "lastError",
      label: "Lỗi cuối",
      render: (row) =>
        row.lastError ? (
          // Nguyên văn mã lỗi của FCM — đó là thứ tra được.
          <span className="font-mono text-xs text-destructive">{row.lastError}</span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <section className="rounded-lg border bg-card p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Nhật ký gửi gần đây</h2>
          <p className="text-sm text-muted-foreground">
            Worker gửi theo nhịp vài giây, nên dòng mới có thể tới chậm một nhịp — bấm
            Làm mới.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SingleSelect
            className="w-52"
            options={[
              { value: "", label: "Tất cả loại" },
              ...(types.data ?? []).map((t) => ({
                value: t.type,
                label: notificationTypeOptionLabel(t.type),
              })),
            ]}
            value={type}
            onValueChange={setType}
            placeholder="Tất cả loại"
          />
          <Button variant="outline" size="sm" onClick={() => void deliveries.refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Làm mới
          </Button>
        </div>
      </header>

      <BaseDataTable
        columns={columns}
        rows={deliveries.data ?? []}
        loading={deliveries.isLoading}
        emptyLabel="Chưa có lượt gửi nào."
        getRowKey={(row) => row.id}
      />
    </section>
  );
}
