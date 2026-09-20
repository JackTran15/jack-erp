import type { PeriodValue } from "@erp/ui";
import type { OrderColumnKey } from "../../../pages/orders/_lib/order-columns";
import type {
  OrderAppliedFilter,
  OrderDateField,
} from "../../../pages/orders/_lib/order-filter";

/** Thiết lập cột do dialog bánh răng điều khiển. */
export interface OrdersColumnPrefs {
  order: OrderColumnKey[];
  visibility: Record<string, boolean>;
  frozen: OrderColumnKey[];
}

export type OrdersDetailTab = "detail" | "tags";

export interface OrdersActions {
  setDateField: (dateField: OrderDateField) => void;
  setPeriod: (period: PeriodValue) => void;
  setTagFilter: (tags: string[]) => void;
  /** Chốt bộ lọc hiện tại — dữ liệu chỉ tải lại khi bấm "Lấy dữ liệu". */
  applyFilter: () => void;
  setFocusedOrderId: (id: string | null) => void;
  toggleChecked: (id: string) => void;
  setCheckedOrderIds: (ids: string[]) => void;
  setDetailTab: (tab: OrdersDetailTab) => void;
  setColumns: (columns: OrdersColumnPrefs) => void;
  resetColumns: () => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  /** Nút "Nạp": đổi nonce để ép query chạy lại. */
  reload: () => void;
}

export interface OrdersState {
  dateField: OrderDateField;
  period: PeriodValue;
  tagFilter: string[];
  applied: OrderAppliedFilter;
  focusedOrderId: string | null;
  checkedOrderIds: string[];
  detailTab: OrdersDetailTab;
  columns: OrdersColumnPrefs;
  page: number;
  pageSize: number;
  reloadNonce: number;
  actions: OrdersActions;
}
