import { Badge } from "@erp/ui";

/** Trạng thái một lượt gửi, tô theo nhóm nghĩa — xem `notification_deliveries.status`. */
export function DeliveryStatusBadge({ status }: { status: string }) {
  const tone =
    status === "sent"
      ? "bg-emerald-100 text-emerald-700"
      : status === "pending" || status === "retrying"
        ? "bg-amber-100 text-amber-800"
        : "bg-destructive/10 text-destructive";

  const label =
    {
      sent: "Đã gửi",
      pending: "Chờ gửi",
      retrying: "Đang thử lại",
      failed: "Thất bại",
      dropped: "Bỏ (lỗi vĩnh viễn)",
      expired: "Quá hạn",
    }[status] ?? status;

  return (
    <Badge variant="secondary" className={tone}>
      {label}
    </Badge>
  );
}
