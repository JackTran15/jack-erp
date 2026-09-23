import {
  keepPreviousData,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../lib/erp-api";
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
import { useBranchStore } from "../../store/common/branch/branch.store";

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
  rows: OrderRow[];
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
