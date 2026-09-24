import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";

/** `SalesOrderHistoryKind` của API (ADR-14). */
export type OrderHistoryKind =
  | "RECEIVED"
  | "DISPATCHED"
  | "CONFIRMED"
  | "RETURNED"
  | "PROCESSED"
  | "REJECTED"
  | "CANCELLED";

/** Một mốc — `SalesOrderHistoryEntryResponseDto`. */
export interface OrderHistoryEntry {
  /** ISO 8601 (UTC). */
  at: string;
  kind: OrderHistoryKind;
  /** `null` khi server không tra được người làm. */
  actorName: string | null;
  branchName?: string;
  /** Chỉ có khi phân lại từ chi nhánh khác. */
  fromBranchName?: string;
  reason?: string;
  /** Chỉ có ở mốc "Thu ngân xử lý". */
  invoiceCode?: string;
  /** Nhãn trạng thái (tiếng Việt) sau mốc này. */
  statusAfter: string;
}

/** `SalesOrderHistoryResponseDto`. */
export interface OrderHistory {
  orderId: string;
  orderCode: string;
  currentStatus: "DRAFT" | "SENT" | "PROCESSED" | "REJECTED" | "CANCELLED";
  entries: OrderHistoryEntry[];
}

/**
 * `admin` đọc qua `/admin/sales-orders/:id/history` (màn Điều phối, Tất cả đơn);
 * `branch` đọc qua `/mobile/sales-orders/:id/history`, bị server khoá theo
 * `X-Branch-Id` (màn `/orders`).
 */
export type OrderHistoryScope = "admin" | "branch";

const HISTORY_PATHS: Record<OrderHistoryScope, string> = {
  admin: "/admin/sales-orders/{id}/history",
  branch: "/mobile/sales-orders/{id}/history",
};

/** Lịch sử điều phối của một đơn (US-12, AC-49, AC-50). */
export function useOrderHistory(
  orderId: string | null,
  scope: OrderHistoryScope,
  enabled: boolean,
): UseQueryResult<OrderHistory> {
  return useQuery({
    queryKey: ["order-history", scope, orderId],
    queryFn: async (): Promise<OrderHistory> =>
      requireErpData(
        await erpApi.GET<OrderHistory>(HISTORY_PATHS[scope], {
          params: { path: { id: orderId as string } },
        }),
      ),
    enabled: enabled && Boolean(orderId),
    // Lịch sử đổi theo từng thao tác phân / trả / duyệt trên lưới: mỗi lần mở
    // modal phải đọc lại, không dùng `staleTime` 30s mặc định của app.
    staleTime: 0,
  });
}
