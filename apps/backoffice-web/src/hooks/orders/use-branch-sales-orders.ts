import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { HttpError } from "../../lib/http";
import {
  ORDER_SUMMARY_KEYS,
  type OrderColumnKey,
} from "../../pages/orders/_lib/order-columns";
import {
  toOrderLineRows,
  toOrderRow,
  type SalesOrderDto,
  type SalesOrderRow,
} from "../../pages/orders/_lib/order-mapper";
import type { OrderLineRow } from "../../pages/orders/_mock/orders.mock";
import { useBranchStore } from "../../store/common/branch/branch.store";
import type { StockCheckOrder } from "./use-admin-sales-orders";

/** Tiền tố khoá cache của lưới đơn chi nhánh (phần tử đầu của `queryKey` bên dưới). */
const BRANCH_SALES_ORDERS_KEY = ["branch-sales-orders"] as const;

/** Hình dạng phân trang chung của API: `{ data, total, page, limit }`. */
interface SalesOrderListResponse {
  data: SalesOrderDto[];
  total: number;
  page: number;
  limit: number;
}

export interface BranchSalesOrdersParams {
  page: number;
  /** Tối đa 100 — `SalesOrderListQueryDto` chặn ở đó, và lưới cũng chỉ mời 20/50/100. */
  pageSize: number;
  /** `YYYY-MM-DD`; chỉ truyền khi bộ lọc đang theo NGÀY TẠO ĐƠN. */
  from?: string;
  to?: string;
  /** Nút "Nạp" của toolbar — đổi nonce là ép query chạy lại. */
  reloadNonce?: number;
}

export interface BranchSalesOrdersResult {
  /** Mang `needsConfirmation` / `confirmedAt` cho nút "Duyệt đơn" (ADR-12). */
  rows: SalesOrderRow[];
  total: number;
  /** Tổng của TRANG hiện tại (xem ghi chú trong `queryFn`). */
  totals: Partial<Record<OrderColumnKey, number>>;
  /** Dòng hàng đã có sẵn trong lượt danh sách — panel chi tiết không gọi thêm. */
  linesByOrderId: Record<string, OrderLineRow[]>;
}

/**
 * Đơn hàng của CHI NHÁNH đang đăng nhập cho lưới `/orders`.
 *
 * `GET /mobile/sales-orders` đã `@RequireBranchScope()` và hard-filter
 * `so.branch_id = X-Branch-Id`, nên đơn trong pool (`branch_id IS NULL`) và đơn
 * của chi nhánh khác không bao giờ về tới đây (AC-16). Không lọc lại phía
 * client — lọc lại chỉ che mất lỗi phạm vi nếu server nới ra.
 *
 * `branchId` nằm trong `queryKey` để đổi chi nhánh là đổi cache, không phải
 * F5: `erpApi` gắn `X-Branch-Id` theo chi nhánh đang chọn, nên hai chi nhánh là
 * hai kết quả khác nhau của cùng một URL.
 */
export function useBranchSalesOrders(
  params: BranchSalesOrdersParams,
): UseQueryResult<BranchSalesOrdersResult> {
  const branchId = useBranchStore((s) => s.branchId);
  const { page, pageSize, from, to, reloadNonce } = params;

  return useQuery({
    queryKey: [
      "branch-sales-orders",
      branchId,
      page,
      pageSize,
      from ?? null,
      to ?? null,
      reloadNonce ?? 0,
    ],
    queryFn: async (): Promise<BranchSalesOrdersResult> => {
      const response = requireErpData(
        await erpApi.GET<SalesOrderListResponse>("/mobile/sales-orders", {
          params: {
            query: {
              page,
              limit: pageSize,
              // Khoảng ngày so với `so.created_at` (timestamp). Gửi trần
              // `YYYY-MM-DD` là giao cho server hiểu thành 00:00 UTC — đơn đặt
              // buổi sáng giờ VN rơi ra ngoài khoảng. Kẹp hai đầu ngày ĐỊA
              // PHƯƠNG ở đây.
              ...(from ? { from: `${from}T00:00:00.000` } : {}),
              ...(to ? { to: `${to}T23:59:59.999` } : {}),
            },
          },
        }),
      );

      const dtos = Array.isArray(response?.data) ? response.data : [];
      const rows = dtos.map(toOrderRow);

      // Tổng ở summary row tính trên TRANG, không trên toàn bộ kết quả lọc:
      // phân trang giờ nằm ở server, trang này không còn cầm cả tập để cộng.
      // Muốn tổng toàn tập thì API phải trả về, không phải client tự đoán.
      const totals: Partial<Record<OrderColumnKey, number>> = {};
      for (const key of ORDER_SUMMARY_KEYS) {
        totals[key] = rows.reduce((sum, row) => {
          const value = row[key];
          return sum + (typeof value === "number" ? value : 0);
        }, 0);
      }

      const linesByOrderId: Record<string, OrderLineRow[]> = {};
      for (const dto of dtos) {
        linesByOrderId[dto.id] = toOrderLineRows(dto);
      }

      return {
        rows,
        total: typeof response?.total === "number" ? response.total : rows.length,
        totals,
        linesByOrderId,
      };
    },
    enabled: Boolean(branchId),
    placeholderData: keepPreviousData,
  });
}

interface StockCheckResponse {
  orders: StockCheckOrder[];
}

/**
 * Đối chiếu đủ/thiếu tồn TẠI CHI NHÁNH đang thao tác cho các đơn sắp duyệt
 * (ADR-12, A-44). Chi nhánh lấy từ `X-Branch-Id` mà `erpApi` tự gắn — body
 * không mang `branchId`. Đơn chi nhánh khác bị server bỏ qua im lặng.
 *
 * Kết quả giữ NGUYÊN thứ tự server trả — đủ → thiếu (AC-31). Là mutation vì
 * đây là ảnh chụp ngay lúc bấm "Duyệt đơn", không phải dữ liệu để cache.
 */
export function useBranchStockCheck(): UseMutationResult<
  StockCheckOrder[],
  Error,
  string[]
> {
  return useMutation({
    mutationFn: async (orderIds: string[]): Promise<StockCheckOrder[]> => {
      const response = requireErpData(
        await erpApi.POST<StockCheckResponse>("/mobile/sales-orders/stock-check", {
          body: { orderIds },
        }),
      );
      return Array.isArray(response?.orders) ? response.orders : [];
    },
  });
}

/**
 * Câu tiếng Việt dự phòng cho mã lỗi của `POST /mobile/sales-orders/:id/confirm`
 * — chỉ dùng khi server không kèm `message` (server đã nói rõ lý do cụ thể).
 */
const CONFIRM_ERROR_MESSAGES: Record<string, string> = {
  ORDER_NOT_CONFIRMABLE:
    "Đơn không còn ở trạng thái chờ duyệt, hoặc không phải đơn cần chi nhánh duyệt.",
  ORDER_NOT_HELD_BY_BRANCH:
    "Đơn đang thuộc chi nhánh khác. Chỉ chi nhánh đang giữ đơn mới duyệt được.",
};

/**
 * Mã nghiệp vụ nằm ở `details.code`: `HttpExceptionFilter` chỉ đẩy `HTTP_409`
 * lên `code` mức trên cùng và trải thân `{ code, message }` vào `details`.
 */
function confirmErrorCodeOf(error: HttpError): string {
  const details = error.error.details;
  if (details && typeof details === "object") {
    const code = (details as Record<string, unknown>).code;
    if (typeof code === "string" && code) return code;
  }
  return error.error.code;
}

function describeConfirmError(error: unknown): { code: string; message: string } {
  if (error instanceof HttpError) {
    const code = confirmErrorCodeOf(error);
    const serverMessage = error.error.message?.trim();
    return {
      code,
      message:
        serverMessage || CONFIRM_ERROR_MESSAGES[code] || "Không duyệt được đơn.",
    };
  }
  return {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : "Không duyệt được đơn.",
  };
}

export interface BranchConfirmFailure {
  orderId: string;
  code: string;
  message: string;
}

export interface BranchConfirmBatchResult {
  /** Id các đơn đã duyệt được. */
  confirmed: string[];
  failed: BranchConfirmFailure[];
}

/**
 * Duyệt một MẺ đơn web chi nhánh đang giữ (AC-30, AC-33).
 *
 * Gọi TUẦN TỰ từng id và không bao giờ reject: một đơn hỏng không được huỷ kết
 * quả của những đơn đã duyệt xong. Invalidate ở `onSettled` — kể cả khi mọi đơn
 * đều hỏng, lưới vẫn phải tải lại (đơn có thể vừa bị trả về / huỷ).
 */
export function useBranchConfirmSalesOrders(): UseMutationResult<
  BranchConfirmBatchResult,
  Error,
  string[]
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderIds: string[]): Promise<BranchConfirmBatchResult> => {
      const confirmed: string[] = [];
      const failed: BranchConfirmFailure[] = [];

      for (const orderId of orderIds) {
        try {
          requireErpData(
            await erpApi.POST<unknown>("/mobile/sales-orders/{id}/confirm", {
              params: { path: { id: orderId } },
            }),
          );
          confirmed.push(orderId);
        } catch (error) {
          failed.push({ orderId, ...describeConfirmError(error) });
        }
      }

      return { confirmed, failed };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: BRANCH_SALES_ORDERS_KEY });
    },
  });
}
