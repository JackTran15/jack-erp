import type { ReactNode } from "react";
import { AppModal, Badge, cn } from "@erp/ui";
import {
  AlertTriangle,
  Ban,
  CheckCheck,
  Inbox,
  Loader2,
  Receipt,
  Store,
  Undo2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  useOrderHistory,
  type OrderHistory,
  type OrderHistoryEntry,
  type OrderHistoryKind,
  type OrderHistoryScope,
} from "../../../hooks/orders/use-order-history";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Đơn đang chọn trên lưới; `null` thì modal không gọi API. */
  orderId: string | null;
  scope: OrderHistoryScope;
}

interface KindMeta {
  icon: LucideIcon;
  /** Chấm tròn trên trục thời gian. */
  tone: string;
}

const KIND_META: Record<OrderHistoryKind, KindMeta> = {
  RECEIVED: { icon: Inbox, tone: "bg-info-subtle text-info" },
  DISPATCHED: { icon: Store, tone: "bg-info-subtle text-info" },
  CONFIRMED: { icon: CheckCheck, tone: "bg-success-subtle text-success" },
  RETURNED: { icon: Undo2, tone: "bg-muted text-muted-foreground" },
  PROCESSED: { icon: Receipt, tone: "bg-success-subtle text-success" },
  REJECTED: { icon: XCircle, tone: "bg-destructive-subtle text-destructive" },
  CANCELLED: { icon: Ban, tone: "bg-destructive-subtle text-destructive" },
};

/** Nhãn trạng thái hiện tại — cùng chữ với cột trạng thái của lưới đơn. */
const CURRENT_STATUS_LABELS: Record<OrderHistory["currentStatus"], string> = {
  DRAFT: "Lưu tạm",
  SENT: "Chờ xử lý",
  PROCESSED: "Đã xử lý",
  REJECTED: "Từ chối",
  CANCELLED: "Đã huỷ",
};

function kindLabel(entry: OrderHistoryEntry): string {
  switch (entry.kind) {
    case "RECEIVED":
      return "Nhận đơn";
    case "DISPATCHED":
      return entry.branchName ? `Phân về ${entry.branchName}` : "Phân đơn";
    case "CONFIRMED":
      return "Chi nhánh duyệt";
    case "RETURNED":
      return "Trả về pool";
    case "PROCESSED":
      return "Thu ngân xử lý";
    case "REJECTED":
      return "Từ chối";
    case "CANCELLED":
      return "Huỷ đơn";
    default:
      return String(entry.kind);
  }
}

const TIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO → `dd/MM/yyyy HH:mm` giờ địa phương (vi-VN tự đặt giờ trước ngày). */
function formatHistoryTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts: Record<string, string> = {};
  for (const part of TIME_FORMATTER.formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function branchText(entry: OrderHistoryEntry): string | null {
  if (entry.fromBranchName) {
    return `từ ${entry.fromBranchName} → ${entry.branchName ?? "—"}`;
  }
  return entry.branchName ?? null;
}

interface EntryProps {
  entry: OrderHistoryEntry;
  last: boolean;
}

function HistoryEntryItem({ entry, last }: EntryProps) {
  const meta = KIND_META[entry.kind] ?? KIND_META.RECEIVED;
  const Icon = meta.icon;
  const branch = branchText(entry);

  return (
    <li
      className="relative flex gap-3 pb-4 last:pb-0"
      data-testid="order-history-entry"
      data-history-kind={entry.kind}
    >
      {!last && (
        <span
          aria-hidden
          className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-border"
        />
      )}
      <span
        className={cn(
          "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          meta.tone,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground" data-field="kind">
            {kindLabel(entry)}
          </span>
          <Badge variant="outline" className="font-normal" data-field="status-after">
            {entry.statusAfter}
          </Badge>
          <span
            className="ml-auto text-xs tabular-nums text-muted-foreground"
            data-field="time"
          >
            {formatHistoryTime(entry.at)}
          </span>
        </div>
        <div className="text-muted-foreground">
          Người thực hiện:{" "}
          <span className="text-foreground" data-field="actor">
            {entry.actorName?.trim() || "—"}
          </span>
        </div>
        {branch && (
          <div className="text-muted-foreground">
            Chi nhánh:{" "}
            <span className="text-foreground" data-field="branch">
              {branch}
            </span>
          </div>
        )}
        {entry.reason && (
          <div className="text-muted-foreground">
            Lý do:{" "}
            <span className="text-foreground" data-field="reason">
              {entry.reason}
            </span>
          </div>
        )}
        {entry.invoiceCode && (
          <div className="text-muted-foreground">
            Hoá đơn:{" "}
            <span className="font-medium text-foreground" data-field="invoice-code">
              {entry.invoiceCode}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Lịch sử điều phối của MỘT đơn (US-12, AC-49, AC-50): các mốc nhận → phân →
 * duyệt → trả về → xử lý / từ chối / huỷ, xếp dọc theo thời gian như server trả.
 * Chỉ đọc — không có nút lưu.
 */
export function OrderHistoryModal({ open, onOpenChange, orderId, scope }: Props) {
  const historyQuery = useOrderHistory(orderId, scope, open);
  const history = historyQuery.data;
  const title = history?.orderCode
    ? `Lịch sử đơn ${history.orderCode}`
    : "Lịch sử đơn";

  let body: ReactNode;
  if (historyQuery.isPending) {
    body = (
      <div
        className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
        data-testid="order-history-loading"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải lịch sử…
      </div>
    );
  } else if (historyQuery.isError) {
    body = (
      <div
        className="flex items-start gap-2 py-6 text-sm text-destructive"
        data-testid="order-history-error"
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Không tải được lịch sử đơn.{" "}
          {historyQuery.error instanceof Error ? historyQuery.error.message : ""}
        </span>
      </div>
    );
  } else if (!history || history.entries.length === 0) {
    body = (
      <div
        className="py-6 text-sm text-muted-foreground"
        data-testid="order-history-empty"
      >
        Đơn chưa có mốc lịch sử nào.
      </div>
    );
  } else {
    body = (
      <ol className="flex flex-col" data-testid="order-history-entries">
        {history.entries.map((entry, index) => (
          <HistoryEntryItem
            key={`${entry.at}-${entry.kind}-${index}`}
            entry={entry}
            last={index === history.entries.length - 1}
          />
        ))}
      </ol>
    );
  }

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={
        history ? (
          <span data-testid="order-history-current-status">
            Trạng thái hiện tại:{" "}
            <span className="font-medium text-foreground">
              {CURRENT_STATUS_LABELS[history.currentStatus] ?? history.currentStatus}
            </span>
          </span>
        ) : undefined
      }
      cancelLabel="Đóng"
      onCancel={() => onOpenChange(false)}
      defaultWidth={620}
      defaultHeight={560}
    >
      <div data-testid="order-history-modal">{body}</div>
    </AppModal>
  );
}
