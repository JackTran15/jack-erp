import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DocumentListShell } from "@erp/ui";
import { BaseDataTable } from "../../../components/table/BaseDataTable";
import { useBranches } from "../../../hooks/iam/useBranches";
import { ADMIN_SALES_ORDERS_KEY } from "../../../hooks/orders/use-admin-sales-orders";
import { useColumnFilters } from "../../../components/table/useColumnFilters";
import { erpApi, requireErpData } from "../../../lib/erp-api";
import type { OrdersColumnPrefs } from "../../../store/page-stores/orders/orders.interface";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../../store/page-stores/orders/orders.store";
import { buildOrderColumns } from "../_lib/build-order-columns";
import {
  BRANCH_DELETED_LABEL,
  BRANCH_UNASSIGNED_FILTER,
  BRANCH_UNASSIGNED_LABEL,
  ORDERS_ALL_COLUMN_ORDER,
  ORDER_SUMMARY_KEYS,
  type OrderColumnKey,
} from "../_lib/order-columns";
import {
  toOrderLineRows,
  toOrderRow,
  type SalesOrderDto,
} from "../_lib/order-mapper";
import type { OrderLineRow, OrderRow } from "../_mock/orders.mock";
import { OrdersDetailPanel } from "../OrdersDetailPanel/OrdersDetailPanel";
import { OrdersPageFilterBar } from "../OrdersPageFilterBar/OrdersPageFilterBar";
import { OrdersPagePagination } from "../OrdersPagePagination/OrdersPagePagination";

/**
 * `OrgSalesOrderView` của `GET /admin/sales-orders`: y hệt `SalesOrderView`,
 * cộng chi nhánh đang giữ đơn NGAY TRÊN DÒNG.
 *
 * `branchId: null` là đơn còn trong pool. `branchId` có giá trị mà
 * `branchName: null` là chi nhánh đã bị xoá — server vẫn trả đơn về chứ không
 * giấu nó đi, nên lưới cũng phải gọi tên được trạng thái đó.
 */
type OrgSalesOrderDto = SalesOrderDto & {
  branchId?: string | null;
  branchName?: string | null;
};

interface AdminSalesOrderListResponse {
  data: OrgSalesOrderDto[];
  total: number;
  page: number;
  limit: number;
}

function branchLabel(dto: OrgSalesOrderDto): string {
  if (!dto.branchId) return BRANCH_UNASSIGNED_LABEL;
  return dto.branchName?.trim() || BRANCH_DELETED_LABEL;
}

interface OrdersAllResult {
  rows: OrderRow[];
  total: number;
  /** Tổng của TRANG hiện tại — server không trả tổng toàn tập. */
  totals: Partial<Record<OrderColumnKey, number>>;
  linesByOrderId: Record<string, OrderLineRow[]>;
}

// Ô của cột ghim đè lên phần lưới cuộn ngang nên nền phải ĐỤC — màu có alpha sẽ
// để lộ nội dung chạy bên dưới. Giống `OrdersPageTable`, vốn không nhận được
// cột thêm từ ngoài vào (xem ghi chú ở `columns` bên dưới).
const FOCUSED_ROW_BG =
  "[&>td]:!bg-[color-mix(in_srgb,hsl(var(--info))_18%,hsl(var(--background)))]";
const HOVER_ROW_BG =
  "[&:hover>td]:!bg-[color-mix(in_srgb,hsl(var(--info))_10%,hsl(var(--background)))]";

/**
 * Màn TẤT CẢ ĐƠN: lưới tra cứu toàn chuỗi (A-19, AC-14, AC-15).
 *
 * Route riêng chứ không phải tab của `/orders`, cùng lý do với màn điều phối:
 * `/orders` là lưới của CHI NHÁNH đang đăng nhập, màn này đọc CẤP TỔ CHỨC.
 * Endpoint đòi `pos.sales-order.read-all` khi không kèm `unassigned` — quyền
 * chỉ "Quản lý tổng" và "Quản trị hệ thống" có; nav gate bằng đúng quyền đó.
 *
 * Đây là màn TRA CỨU: không tick dòng, không phân / trả / huỷ (ngoài phạm vi
 * UoW-03), nên trang không đụng tới `checkedOrderIds` của store.
 */
export function OrdersAllPage() {
  const applied = useOrdersStore((s) => s.applied);
  const page = useOrdersStore((s) => s.page);
  const pageSize = useOrdersStore((s) => s.pageSize);
  const reloadNonce = useOrdersStore((s) => s.reloadNonce);
  const columnPrefs = useOrdersStore((s) => s.columns);
  const { setPage } = useOrdersActions();

  // Dòng đang xem là chuyện riêng của màn này: panel chi tiết đọc từ state cục
  // bộ thay vì `focusedOrderId` dùng chung, để rời màn là nó tự sạch.
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);

  // Vào màn là về trang 1 — số trang mang sang từ `/orders` trỏ vào một tập kết
  // quả khác hẳn.
  useEffect(() => {
    setPage(1);
  }, [setPage]);

  const resetPage = useCallback(() => {
    setPage(1);
    setFocusedOrderId(null);
  }, [setPage]);
  const { filters, control } = useColumnFilters(ORDERS_ALL_COLUMN_ORDER, {
    onChange: resetPage,
  });

  // "" = ô select đang ở "— Tất cả —". Không được gửi lên: `branchId=""` bị
  // server trả 400.
  const branchFilter = filters.branchName?.value ?? "";

  const branchesQuery = useBranches();
  const branchFilterOptions = useMemo(
    () => [
      { value: BRANCH_UNASSIGNED_FILTER, label: BRANCH_UNASSIGNED_LABEL },
      ...(branchesQuery.data ?? []).map((branch) => ({
        value: branch.id,
        label: branch.name,
      })),
    ],
    [branchesQuery.data],
  );

  // Khoảng ngày chỉ gửi lên khi đang lọc theo NGÀY TẠO ĐƠN — trường ngày duy
  // nhất có thật trên đơn, giống hai lưới kia.
  const filterByCreatedDate = applied.dateField === "createdDate";
  const from = filterByCreatedDate ? applied.from : undefined;
  const to = filterByCreatedDate ? applied.to : undefined;

  const ordersQuery = useQuery({
    // Cùng tiền tố với pool điều phối: phân một đơn làm sai cả hai lưới, và một
    // lần invalidate theo `ADMIN_SALES_ORDERS_KEY` phải dọn được cả hai.
    queryKey: [
      ...ADMIN_SALES_ORDERS_KEY,
      "all",
      branchFilter || null,
      page,
      pageSize,
      from ?? null,
      to ?? null,
      reloadNonce,
    ],
    queryFn: async (): Promise<OrdersAllResult> => {
      const response = requireErpData(
        await erpApi.GET<AdminSalesOrderListResponse>("/admin/sales-orders", {
          params: {
            query: {
              page,
              limit: pageSize,
              ...(branchFilter ? { branchId: branchFilter } : {}),
              // Kẹp hai đầu ngày ĐỊA PHƯƠNG: gửi trần `YYYY-MM-DD` là để server
              // hiểu thành 00:00 UTC, đơn đặt buổi sáng giờ VN rơi ra ngoài.
              ...(from ? { from: `${from}T00:00:00.000` } : {}),
              ...(to ? { to: `${to}T23:59:59.999` } : {}),
            },
          },
        }),
      );

      const dtos = Array.isArray(response?.data) ? response.data : [];
      const rows: OrderRow[] = dtos.map((dto) => ({
        ...toOrderRow(dto),
        branchName: branchLabel(dto),
      }));

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
    placeholderData: keepPreviousData,
  });

  const rows = ordersQuery.data?.rows ?? [];
  const totals = ordersQuery.data?.totals ?? {};
  const focusedOrder = rows.find((row) => row.id === focusedOrderId) ?? null;
  const lines = focusedOrderId
    ? (ordersQuery.data?.linesByOrderId[focusedOrderId] ?? [])
    : [];

  /**
   * Tập cột của màn này = thiết lập của người dùng + cột "Chi nhánh" ghim cứng
   * ở đầu khối cột thường.
   *
   * Cột `orgOnly` nằm ngoài `columnPrefs` (store dựng từ `ORDER_COLUMN_ORDER`),
   * nên phải chèn tại đây. `OrdersPageTable` đọc thẳng store và không nhận cột
   * thêm từ ngoài, nên màn này tự nối `BaseDataTable` — không có checkbox chọn
   * dòng vì đây là màn tra cứu.
   */
  const columns = useMemo(() => {
    const prefs: OrdersColumnPrefs = {
      order: [
        "branchName",
        ...columnPrefs.order.filter((key) => key !== "branchName"),
      ],
      visibility: { ...columnPrefs.visibility, branchName: true },
      frozen: columnPrefs.frozen,
    };

    return buildOrderColumns(prefs, totals).map((column) =>
      column.key === "branchName"
        ? { ...column, filterOptions: branchFilterOptions }
        : column,
    );
  }, [columnPrefs, totals, branchFilterOptions]);

  return (
    <DocumentListShell
      title="Tất cả đơn hàng"
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
      <BaseDataTable
        columns={columns}
        rows={rows}
        loading={ordersQuery.isPending}
        emptyLabel="Không có dữ liệu."
        getRowKey={(row) => row.id}
        onRowClick={(row) => setFocusedOrderId(row.id)}
        rowClassName={(row) =>
          [
            "[&>td]:h-[46px] [&>td]:align-top [&>td]:py-2",
            row.id === focusedOrderId ? FOCUSED_ROW_BG : HOVER_ROW_BG,
          ].join(" ")
        }
        columnFilterControl={control}
      />
    </DocumentListShell>
  );
}
