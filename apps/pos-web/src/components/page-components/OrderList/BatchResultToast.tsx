import { toast } from "sonner";

import type { SalesOrderBatchResult } from "@erp/pos/interfaces/sales-order.interface";

/**
 * Mã lỗi từng đơn (`results[i].code`) → câu tiếng Việt, theo bảng Error
 * taxonomy của feature. Mã không có ở đây → dùng nguyên `message` server trả.
 */
const BATCH_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  NO_OPEN_SESSION: "Chi nhánh chưa mở ca",
  ORDER_NOT_PROCESSABLE: "Đơn không còn ở trạng thái chưa xử lý",
  ORDER_NOT_CONFIRMED: "Đơn chưa được duyệt",
};

export interface BatchResultFailure {
  /** Nhãn đơn hiển thị — mã đơn (OCM) khi có, không thì id. */
  label: string;
  message: string;
}

export interface BatchResultToastProps {
  failures: ReadonlyArray<BatchResultFailure>;
}

/** Danh sách "<mã đơn>: <lý do>" của các đơn lỗi — phần thân của toast kết quả batch. */
export const BatchResultToast = ({ failures }: BatchResultToastProps) => (
  <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto">
    {failures.map((f, i) => (
      <li key={`${f.label}-${i}`}>
        <span className="font-medium">{f.label}</span>: {f.message}
      </li>
    ))}
  </ul>
);

export interface ShowBatchResultToastInput {
  results: ReadonlyArray<SalesOrderBatchResult>;
  /** Động từ sau "x/y đơn", vd "đã nhận xử lý". */
  actionLabel: string;
  /** id đơn → nhãn hiển thị (thường là `externalOrderId`). */
  labelOf: (id: string) => string;
}

/**
 * Toast kết quả một action batch trên đơn hàng: "x/y đơn <actionLabel>" và
 * mỗi đơn lỗi một dòng lý do. Tất cả thành công → success; có đơn lỗi →
 * warning; không đơn nào thành công → error.
 */
export function showBatchResultToast({
  results,
  actionLabel,
  labelOf,
}: ShowBatchResultToastInput): void {
  const failures: BatchResultFailure[] = results
    .filter((r) => !r.ok)
    .map((r) => ({
      label: labelOf(r.id),
      message:
        (r.code && BATCH_ERROR_MESSAGES[r.code]) ||
        r.message ||
        r.code ||
        "Không rõ lý do",
    }));
  const succeeded = results.length - failures.length;
  const title = `${succeeded}/${results.length} đơn ${actionLabel}`;

  if (failures.length === 0) {
    toast.success(title);
    return;
  }
  const notify = succeeded === 0 ? toast.error : toast.warning;
  notify(title, {
    description: <BatchResultToast failures={failures} />,
    duration: 8000,
  });
}
