import { useCallback, useEffect, useState } from "react";
import { DocumentListShell, PageToolbar, type ToolbarItem } from "@erp/ui";
import { History, RefreshCw, Store } from "lucide-react";
import { useColumnFilters } from "../../../components/table/useColumnFilters";
import { useAdminSalesOrders } from "../../../hooks/orders/use-admin-sales-orders";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../../store/page-stores/orders/orders.store";
import { ORDER_COLUMN_ORDER } from "../_lib/order-columns";
import { OrderHistoryModal } from "../OrderHistoryModal/OrderHistoryModal";
import { OrdersDetailPanel } from "../OrdersDetailPanel/OrdersDetailPanel";
import { OrdersPageFilterBar } from "../OrdersPageFilterBar/OrdersPageFilterBar";
import { OrdersPagePagination } from "../OrdersPagePagination/OrdersPagePagination";
import { OrdersPageTable } from "../OrdersPageTable/OrdersPageTable";
import {
  DispatchOrdersDialog,
  type DispatchCandidate,
} from "./DispatchOrdersDialog";

/**
 * Màn ĐIỀU PHỐI: pool đơn chưa phân chi nhánh (A-19, AC-09).
 *
 * Route riêng chứ không phải một tab của `/orders` — `/orders` là lưới của CHI
 * NHÁNH đang đăng nhập, màn này là lưới CẤP TỔ CHỨC. Trộn hai phạm vi quyền
 * vào một trang là cách nhanh nhất để rò đơn của chi nhánh khác.
 *
 * Nguồn dữ liệu là `GET /admin/sales-orders?unassigned=true`; lưới, cột và
 * panel chi tiết dùng lại nguyên của `/orders`. Admin tick đơn trên lưới rồi bấm
 * "Điều phối (n)": chọn chi nhánh TỪNG đơn, Validate và Lưu đều nằm trong
 * `DispatchOrdersDialog` (A-48, ADR-13). Màn này chỉ phân, không duyệt: duyệt là
 * việc của chi nhánh nhận đơn (A-41).
 *
 * Trạng thái UI (cột, trang, dòng đã tick) dùng chung `useOrdersStore` với
 * `/orders`: `OrdersPageTable` đọc thẳng store đó. Hai màn không bao giờ mount
 * cùng lúc, nên chỉ cần dọn phần mang sang được — xem hai `useEffect` bên dưới.
 */
export function OrdersDispatchPage() {
  const applied = useOrdersStore((s) => s.applied);
  const page = useOrdersStore((s) => s.page);
  const pageSize = useOrdersStore((s) => s.pageSize);
  const reloadNonce = useOrdersStore((s) => s.reloadNonce);
  const focusedOrderId = useOrdersStore((s) => s.focusedOrderId);
  const checkedOrderIds = useOrdersStore((s) => s.checkedOrderIds);
  const { setPage, setCheckedOrderIds, setFocusedOrderId, reload } =
    useOrdersActions();

  const [dispatchOpen, setDispatchOpen] = useState(false);
  /** Các đơn đã tick, chụp lúc bấm "Điều phối" — dialog không co theo lưới tải lại. */
  const [dispatchOrders, setDispatchOrders] = useState<DispatchCandidate[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Vào màn là về trang 1: số trang mang sang từ `/orders` trỏ vào một tập kết
  // quả khác hẳn, và trang 4 của một pool 3 đơn là một lưới rỗng khó hiểu.
  useEffect(() => {
    setPage(1);
  }, [setPage]);

  // Tick dòng là chuyện của TRANG đang xem: id tick ở trang khác thì lưới không
  // còn cầm mã đơn để gọi tên nó trong dialog. Đổi trang (và cả lúc vào màn) là bỏ tick.
  useEffect(() => {
    setCheckedOrderIds([]);
    setFocusedOrderId(null);
  }, [page, setCheckedOrderIds, setFocusedOrderId]);

  const resetPage = useCallback(() => setPage(1), [setPage]);
  const { control } = useColumnFilters(ORDER_COLUMN_ORDER, {
    onChange: resetPage,
  });

  // Khoảng ngày chỉ gửi lên khi đang lọc theo NGÀY TẠO ĐƠN — trường ngày duy
  // nhất có thật trên đơn, giống `/orders`.
  const filterByCreatedDate = applied.dateField === "createdDate";

  const ordersQuery = useAdminSalesOrders({
    page,
    pageSize,
    from: filterByCreatedDate ? applied.from : undefined,
    to: filterByCreatedDate ? applied.to : undefined,
    reloadNonce,
  });

  const rows = ordersQuery.data?.rows ?? [];
  const codeById = ordersQuery.data?.codeById ?? {};
  const focusedOrder = rows.find((row) => row.id === focusedOrderId) ?? null;
  const lines = focusedOrderId
    ? (ordersQuery.data?.linesByOrderId[focusedOrderId] ?? [])
    : [];

  const selectedOrders: DispatchCandidate[] = rows
    .filter((row) => checkedOrderIds.includes(row.id))
    .map((row) => ({
      id: row.id,
      code: codeById[row.id] ?? "",
      recipient: row.recipientName,
    }));
  const noSelection = selectedOrders.length === 0;

  const openDispatch = () => {
    if (noSelection) return;
    setDispatchOrders(selectedOrders);
    setDispatchOpen(true);
  };

  const toolbarItems: ToolbarItem[] = [
    {
      id: "dispatch",
      label: noSelection ? "Điều phối" : `Điều phối (${selectedOrders.length})`,
      icon: Store,
      onClick: openDispatch,
      disabled: noSelection,
      tooltip: noSelection
        ? "Tick ít nhất một đơn để điều phối"
        : `Chọn chi nhánh cho ${selectedOrders.length} đơn đã tick`,
    },
    {
      id: "history",
      label: "Lịch sử",
      icon: History,
      onClick: () => setHistoryOpen(true),
      disabled: !focusedOrder,
      tooltip: "Chọn một đơn để xem lịch sử",
    },
    { id: "sep-1", type: "separator" },
    { id: "reload", label: "Nạp", icon: RefreshCw, onClick: reload },
  ];

  return (
    <DocumentListShell
      title="Điều phối đơn hàng"
      toolbar={
        <>
          <PageToolbar items={toolbarItems} tone="primary" className="m-2 rounded-md" />
          <DispatchOrdersDialog
            open={dispatchOpen}
            onOpenChange={setDispatchOpen}
            orders={dispatchOrders}
            onDispatched={(dispatchedIds) =>
              setCheckedOrderIds(
                useOrdersStore
                  .getState()
                  .checkedOrderIds.filter((id) => !dispatchedIds.includes(id)),
              )
            }
          />
          <OrderHistoryModal
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            orderId={focusedOrder?.id ?? null}
            scope="admin"
          />
        </>
      }
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
