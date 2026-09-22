import { useCallback } from "react";
import { DocumentListShell } from "@erp/ui";
import { useColumnFilters } from "../../components/table/useColumnFilters";
import { useBranchSalesOrders } from "../../hooks/orders/use-branch-sales-orders";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../store/page-stores/orders/orders.store";
import { ORDER_COLUMN_ORDER } from "./_lib/order-columns";
import { OrdersDetailPanel } from "./OrdersDetailPanel/OrdersDetailPanel";
import { OrdersPageFilterBar } from "./OrdersPageFilterBar/OrdersPageFilterBar";
import { OrdersPagePagination } from "./OrdersPagePagination/OrdersPagePagination";
import { OrdersPageTable } from "./OrdersPageTable/OrdersPageTable";
import { OrdersPageToolbar } from "./OrdersPageToolbar/OrdersPageToolbar";

/**
 * Danh sách đơn hàng của CHI NHÁNH đang đăng nhập.
 *
 * Nguồn là `GET /mobile/sales-orders` (`useBranchSalesOrders`) — endpoint đã
 * hard-filter theo `X-Branch-Id`, nên đơn chưa phân và đơn của chi nhánh khác
 * không về tới lưới. `OrderRow` vẫn là hợp đồng của cột/bộ lọc; chỗ duy nhất
 * biết hình dạng API là `_lib/order-mapper`.
 *
 * Các cột chưa có backing (vận chuyển, đối soát, sàn, nhãn) ra chuỗi rỗng / 0
 * và sẽ bị ẩn khỏi dialog cột ở T-05-04 (A-12, A-20).
 */
export function OrdersPage() {
  const applied = useOrdersStore((s) => s.applied);
  const page = useOrdersStore((s) => s.page);
  const pageSize = useOrdersStore((s) => s.pageSize);
  const reloadNonce = useOrdersStore((s) => s.reloadNonce);
  const focusedOrderId = useOrdersStore((s) => s.focusedOrderId);
  const { setPage } = useOrdersActions();

  const resetPage = useCallback(() => setPage(1), [setPage]);
  const { control } = useColumnFilters(ORDER_COLUMN_ORDER, {
    onChange: resetPage,
  });

  // Khoảng ngày chỉ gửi lên khi đang lọc theo NGÀY TẠO ĐƠN: đó là trường ngày
  // duy nhất có thật trên đơn. Lấy ngày giao / ngày hoá đơn mà lọc theo
  // `created_at` là trả về đúng con số cho một câu hỏi khác.
  const filterByCreatedDate = applied.dateField === "createdDate";

  const ordersQuery = useBranchSalesOrders({
    page,
    pageSize,
    from: filterByCreatedDate ? applied.from : undefined,
    to: filterByCreatedDate ? applied.to : undefined,
    reloadNonce,
  });

  const rows = ordersQuery.data?.rows ?? [];
  const focusedOrder = rows.find((row) => row.id === focusedOrderId) ?? null;
  const lines = focusedOrderId
    ? (ordersQuery.data?.linesByOrderId[focusedOrderId] ?? [])
    : [];

  return (
    <DocumentListShell
      toolbar={<OrdersPageToolbar />}
      filters={<OrdersPageFilterBar />}
      pagination={
        <OrdersPagePagination
          total={ordersQuery.data?.total ?? 0}
          onRefresh={() => void ordersQuery.refetch()}
        />
      }
      detailPanel={
        <OrdersDetailPanel
          order={focusedOrder}
          lines={lines}
          loading={ordersQuery.isFetching}
        />
      }
      detailInitialHeight={220}
    >
      <OrdersPageTable
        rows={rows}
        totals={ordersQuery.data?.totals ?? {}}
        loading={ordersQuery.isPending}
        columnFilterControl={control}
      />
    </DocumentListShell>
  );
}
