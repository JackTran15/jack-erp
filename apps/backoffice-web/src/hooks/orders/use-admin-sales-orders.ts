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
} from "../../pages/orders/_lib/order-mapper";
import type { OrderLineRow, OrderRow } from "../../pages/orders/_mock/orders.mock";

/** Hình dạng phân trang chung của API: `{ data, total, page, limit }`. */
interface AdminSalesOrderListResponse {
  data: SalesOrderDto[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Tiền tố khoá cache của MỌI lượt đọc `/admin/sales-orders`.
 *
 * Invalidate theo tiền tố này sau khi phân đơn: đơn vừa phân không còn thuộc
 * pool nữa, và trang nào của lưới đang nằm trong cache cũng sai từ giây đó.
 */
export const ADMIN_SALES_ORDERS_KEY = ["admin-sales-orders"] as const;

export interface AdminSalesOrdersParams {
  page: number;
  /** Tối đa 100 — `AdminSalesOrderListQueryDto` chặn ở đó. */
  pageSize: number;
  /** `YYYY-MM-DD`; chỉ truyền khi bộ lọc đang theo NGÀY TẠO ĐƠN. */
  from?: string;
  to?: string;
  /** Nút "Nạp" của thanh hành động — đổi nonce là ép query chạy lại. */
  reloadNonce?: number;
}

export interface AdminSalesOrdersResult {
  rows: OrderRow[];
  total: number;
  /** Tổng của TRANG hiện tại, như lưới chi nhánh — server không trả tổng toàn tập. */
  totals: Partial<Record<OrderColumnKey, number>>;
  /** Dòng hàng đã có sẵn trong lượt danh sách — panel chi tiết không gọi thêm. */
  linesByOrderId: Record<string, OrderLineRow[]>;
  /**
   * Mã chứng từ theo id đơn. `OrderRow` không mang mã đơn (chỉ có mã HOÁ ĐƠN,
   * mà đơn trong pool thì chưa có), nên nút "Lưu" của màn Điều phối lấy nhãn
   * từ đây để báo lỗi đúng từng đơn thay vì đọc ra một UUID.
   */
  codeById: Record<string, string>;
}

/**
 * POOL đơn chưa phân cho màn `/orders/dispatch` (AC-09).
 *
 * LUÔN gửi `unassigned=true`, và đó không phải là một mặc định tiện tay:
 * `GET /admin/sales-orders` không kèm `unassigned` đòi THÊM quyền
 * `pos.sales-order.read-all` và trả 403 cho người chỉ có `pos.sales-order.dispatch`
 * (xem `SalesOrderService.listForOrganization`). Màn này là màn pool — bỏ cờ đi
 * là biến một lưới chạy được thành một màn 403 cho đúng nhóm người dùng nó
 * sinh ra để phục vụ.
 *
 * Không có `X-Branch-Id` trong khoá cache: controller là CẤP TỔ CHỨC, không
 * `BranchScopeGuard` (ADR-07), nên đổi chi nhánh đang chọn không đổi kết quả.
 */
export function useAdminSalesOrders(
  params: AdminSalesOrdersParams,
): UseQueryResult<AdminSalesOrdersResult> {
  const { page, pageSize, from, to, reloadNonce } = params;

  return useQuery({
    queryKey: [
      ...ADMIN_SALES_ORDERS_KEY,
      "unassigned",
      page,
      pageSize,
      from ?? null,
      to ?? null,
      reloadNonce ?? 0,
    ],
    queryFn: async (): Promise<AdminSalesOrdersResult> => {
      const response = requireErpData(
        await erpApi.GET<AdminSalesOrderListResponse>("/admin/sales-orders", {
          params: {
            query: {
              page,
              limit: pageSize,
              unassigned: true,
              // Khoảng ngày so với `so.created_at` (timestamp). Gửi trần
              // `YYYY-MM-DD` là giao cho server hiểu thành 00:00 UTC — đơn đặt
              // buổi sáng giờ VN rơi ra ngoài khoảng. Kẹp hai đầu ngày ĐỊA
              // PHƯƠNG ở đây, giống lưới chi nhánh.
              ...(from ? { from: `${from}T00:00:00.000` } : {}),
              ...(to ? { to: `${to}T23:59:59.999` } : {}),
            },
          },
        }),
      );

      const dtos = Array.isArray(response?.data) ? response.data : [];
      const rows = dtos.map(toOrderRow);

      const totals: Partial<Record<OrderColumnKey, number>> = {};
      for (const key of ORDER_SUMMARY_KEYS) {
        totals[key] = rows.reduce((sum, row) => {
          const value = row[key];
          return sum + (typeof value === "number" ? value : 0);
        }, 0);
      }

      const linesByOrderId: Record<string, OrderLineRow[]> = {};
      const codeById: Record<string, string> = {};
      for (const dto of dtos) {
        linesByOrderId[dto.id] = toOrderLineRows(dto);
        codeById[dto.id] = dto.code ?? "";
      }

      return {
        rows,
        total: typeof response?.total === "number" ? response.total : rows.length,
        totals,
        linesByOrderId,
        codeById,
      };
    },
    placeholderData: keepPreviousData,
  });
}

/**
 * Mã lỗi 409 của `POST /admin/sales-orders/:id/dispatch` → câu tiếng Việt.
 *
 * `ORDER_ALREADY_DISPATCHED` KHÔNG phải ca biên: hai Admin nhìn cùng một pool
 * là tình huống thường ngày, và bên thua phải đọc được "người khác lấy mất",
 * không phải một mã lỗi viết hoa.
 */
const DISPATCH_ERROR_MESSAGES: Record<string, string> = {
  ORDER_ALREADY_DISPATCHED: "Một người khác vừa phân đơn này cho chi nhánh khác.",
  ORDER_NOT_DISPATCHABLE: "Đơn không còn ở trạng thái chờ phân.",
};

export interface DispatchFailure {
  orderId: string;
  code: string;
  message: string;
}

export interface DispatchBatchResult {
  /** Id các đơn đã phân được. */
  dispatched: string[];
  failed: DispatchFailure[];
}

/** Một đơn và chi nhánh Admin chọn cho CHÍNH nó trên lưới (ADR-11). */
export interface DispatchAssignment {
  orderId: string;
  branchId: string;
}

function describeOrderActionError(
  error: unknown,
  messages: Record<string, string>,
  fallback: string,
): { code: string; message: string } {
  if (error instanceof HttpError) {
    const { code, message } = error.error;
    // Lỗi 400 "chi nhánh không thuộc tổ chức" đã là câu tiếng Việt từ server —
    // giữ nguyên thay vì thay bằng một câu chung chung.
    return { code, message: messages[code] ?? message };
  }
  return {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : fallback,
  };
}

/**
 * Phân một MẺ đơn, mỗi đơn về chi nhánh của riêng nó (AC-42, ADR-11).
 *
 * Gọi TUẦN TỰ và không bao giờ reject: mỗi đơn là một quyết định riêng, nên
 * một đơn 409 không được huỷ kết quả của những đơn đã phân xong. Trả về cả hai
 * danh sách để dialog nói đúng "2 thành công, 1 không" thay vì nuốt cả mẻ.
 *
 * Invalidate ở `onSettled`, không ở `onSuccess`: khi mọi đơn đều 409
 * `ORDER_ALREADY_DISPATCHED` thì lưới càng phải tải lại — những dòng đó đã có
 * chi nhánh và không còn thuộc pool nữa.
 */
export function useDispatchSalesOrders(): UseMutationResult<
  DispatchBatchResult,
  Error,
  DispatchAssignment[]
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      assignments: DispatchAssignment[],
    ): Promise<DispatchBatchResult> => {
      const dispatched: string[] = [];
      const failed: DispatchFailure[] = [];

      for (const { orderId, branchId } of assignments) {
        try {
          requireErpData(
            await erpApi.POST<unknown>("/admin/sales-orders/{id}/dispatch", {
              params: { path: { id: orderId } },
              body: { branchId },
            }),
          );
          dispatched.push(orderId);
        } catch (error) {
          failed.push({
            orderId,
            ...describeOrderActionError(
              error,
              DISPATCH_ERROR_MESSAGES,
              "Không phân được đơn.",
            ),
          });
        }
      }

      return { dispatched, failed };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_SALES_ORDERS_KEY });
    },
  });
}

/** Một dòng hàng trong kết quả `POST /admin/sales-orders/stock-check` (ADR-09). */
export interface StockCheckLine {
  itemId: string;
  itemCode: string;
  itemName: string;
  /** Tổng SL cần của món trong đơn (dòng trùng món đã gộp). */
  required: number;
  /** Tồn trong phạm vi đối chiếu — toàn chuỗi khi không gửi `branchId`. Có thể âm. */
  available: number;
  /** `max(0, required - available)`; 0 = đủ. */
  shortBy: number;
}

export interface StockCheckOrder {
  orderId: string;
  orderCode: string;
  /** `null` = đối chiếu trên tồn toàn chuỗi. */
  branchId: string | null;
  sufficient: boolean;
  shortLineCount: number;
  /** Dòng đủ trước dòng thiếu — server đã xếp. */
  lines: StockCheckLine[];
}

interface StockCheckResponse {
  orders: StockCheckOrder[];
}

/** Một đơn cần đối chiếu; `branchId` bỏ trống = đối chiếu trên tồn toàn chuỗi. */
export interface StockCheckInput {
  orderId: string;
  branchId?: string;
}

/**
 * Đối chiếu đủ/thiếu tồn cho một mẻ đơn trong pool.
 *
 * "Validate" của màn Điều phối gửi `branchId` Admin đã chọn cho TỪNG đơn
 * (A-39) — tồn tại chính chi nhánh đó. Bỏ trống `branchId` = tồn toàn chuỗi.
 *
 * Kết quả giữ NGUYÊN thứ tự server trả — đủ → thiếu (A-39); sắp lại ở client
 * là hai nơi cùng quyết một thứ tự.
 *
 * Là mutation chứ không phải query: đây là ảnh chụp ngay lúc bấm nút, không
 * phải dữ liệu nên nằm trong cache rồi tái dùng ở lượt bấm sau.
 */
export function useStockCheck(): UseMutationResult<
  StockCheckOrder[],
  Error,
  StockCheckInput[]
> {
  return useMutation({
    mutationFn: async (orders: StockCheckInput[]): Promise<StockCheckOrder[]> => {
      const response = requireErpData(
        await erpApi.POST<StockCheckResponse>("/admin/sales-orders/stock-check", {
          body: {
            orders: orders.map(({ orderId, branchId }) =>
              branchId ? { orderId, branchId } : { orderId },
            ),
          },
        }),
      );
      return Array.isArray(response?.orders) ? response.orders : [];
    },
  });
}
