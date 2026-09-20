import { useCallback } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DocumentListShell } from "@erp/ui";
import { useColumnFilters } from "../../components/table/useColumnFilters";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../store/page-stores/orders/orders.store";
import { ORDER_COLUMN_ORDER } from "./_lib/order-columns";
import { fetchOrders } from "./_lib/order-filter";
import { useDebouncedValue } from "./_lib/useDebouncedValue";
import { fetchOrderLines, getOrderRows } from "./_mock/orders.mock";
import { OrdersDetailPanel } from "./OrdersDetailPanel/OrdersDetailPanel";
import { OrdersPageFilterBar } from "./OrdersPageFilterBar/OrdersPageFilterBar";
import { OrdersPagePagination } from "./OrdersPagePagination/OrdersPagePagination";
import { OrdersPageTable } from "./OrdersPageTable/OrdersPageTable";
import { OrdersPageToolbar } from "./OrdersPageToolbar/OrdersPageToolbar";

/**
 * Danh sách đơn hàng & đối soát.
 *
 * Dữ liệu hiện là mock: backend chưa có domain đơn hàng (12/27 cột của màn hình
 * không tồn tại ở `apps/api`). Khi API sẵn sàng, chỉ cần đổi `_lib/order-filter`
 * + `_mock/` sang một `_api/` — phần còn lại của trang không phải sửa.
 */
export function OrdersPage() {
  const applied = useOrdersStore((s) => s.applied);
  const page = useOrdersStore((s) => s.page);
  const pageSize = useOrdersStore((s) => s.pageSize);
  const reloadNonce = useOrdersStore((s) => s.reloadNonce);
  const focusedOrderId = useOrdersStore((s) => s.focusedOrderId);
  const { setPage } = useOrdersActions();

  const resetPage = useCallback(() => setPage(1), [setPage]);
  const { filters, control } = useColumnFilters(ORDER_COLUMN_ORDER, {
    onChange: resetPage,
  });
  const debouncedFilters = useDebouncedValue(filters);

  const ordersQuery = useQuery({
    queryKey: ["orders", applied, debouncedFilters, page, pageSize, reloadNonce],
    queryFn: () =>
      fetchOrders({
        applied,
        columnFilters: debouncedFilters,
        page,
        pageSize,
      }),
    placeholderData: keepPreviousData,
  });

  const linesQuery = useQuery({
    queryKey: ["order-lines", focusedOrderId, reloadNonce],
    queryFn: () => fetchOrderLines(focusedOrderId),
    enabled: Boolean(focusedOrderId),
  });

  const focusedOrder =
    getOrderRows().find((row) => row.id === focusedOrderId) ?? null;

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
          lines={linesQuery.data ?? []}
          loading={linesQuery.isFetching}
        />
      }
      detailInitialHeight={220}
    >
      <OrdersPageTable
        rows={ordersQuery.data?.rows ?? []}
        totals={ordersQuery.data?.totals ?? {}}
        loading={ordersQuery.isPending}
        columnFilterControl={control}
      />
    </DocumentListShell>
  );
}
