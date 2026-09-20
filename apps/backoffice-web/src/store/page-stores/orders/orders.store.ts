import { resolvePeriodRange } from "@erp/ui";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ORDER_COLUMNS,
  ORDER_COLUMN_ORDER,
  ORDER_FROZEN_KEYS,
} from "../../../pages/orders/_lib/order-columns";
import { ORDERS_DEFAULT_PAGE_SIZE, ORDERS_STORE_KEY } from "./orders.constant";
import type { OrdersColumnPrefs, OrdersState } from "./orders.interface";

function defaultColumnPrefs(): OrdersColumnPrefs {
  return {
    order: [...ORDER_COLUMN_ORDER],
    visibility: Object.fromEntries(ORDER_COLUMNS.map((c) => [c.key, true])),
    frozen: [...ORDER_FROZEN_KEYS],
  };
}

const initialRange = resolvePeriodRange("this_year");

/**
 * State UI của trang Đơn hàng. Dữ liệu lưới đi qua TanStack Query — store chỉ
 * giữ lựa chọn của người dùng.
 *
 * `applied` tách khỏi `period`/`dateField`/`tagFilter` vì bộ lọc là "khai báo
 * điều kiện": người dùng chỉnh thoải mái, lưới chỉ tải lại khi bấm "Lấy dữ liệu".
 */
export const useOrdersStore = create<OrdersState>()(
  persist(
    (set, get) => ({
      dateField: "createdDate",
      period: { preset: "this_year", ...initialRange },
      tagFilter: [],
      applied: { dateField: "createdDate", ...initialRange, tags: [] },
      focusedOrderId: null,
      checkedOrderIds: [],
      detailTab: "detail",
      columns: defaultColumnPrefs(),
      page: 1,
      pageSize: ORDERS_DEFAULT_PAGE_SIZE,
      reloadNonce: 0,
      actions: {
        setDateField: (dateField) => set({ dateField }),
        setPeriod: (period) => set({ period }),
        setTagFilter: (tags) => set({ tagFilter: tags }),
        applyFilter: () => {
          const { dateField, period, tagFilter } = get();
          set({
            applied: {
              dateField,
              from: period.from,
              to: period.to,
              tags: tagFilter,
            },
            page: 1,
          });
        },
        setFocusedOrderId: (focusedOrderId) => set({ focusedOrderId }),
        toggleChecked: (id) =>
          set((state) => ({
            checkedOrderIds: state.checkedOrderIds.includes(id)
              ? state.checkedOrderIds.filter((item) => item !== id)
              : [...state.checkedOrderIds, id],
          })),
        setCheckedOrderIds: (checkedOrderIds) => set({ checkedOrderIds }),
        setDetailTab: (detailTab) => set({ detailTab }),
        setColumns: (columns) => set({ columns }),
        resetColumns: () => set({ columns: defaultColumnPrefs() }),
        setPage: (page) => set({ page }),
        setPageSize: (pageSize) => set({ pageSize, page: 1 }),
        reload: () => set((state) => ({ reloadNonce: state.reloadNonce + 1 })),
      },
    }),
    {
      name: ORDERS_STORE_KEY,
      // Chỉ giữ sticky UI pref qua reload; dòng đang chọn và bộ lọc đã áp thì không.
      partialize: (state) => ({
        columns: state.columns,
        pageSize: state.pageSize,
        dateField: state.dateField,
      }),
      // Cột mới thêm vào registry sau khi người dùng đã lưu thiết lập cũ sẽ
      // thiếu trong `order`/`visibility` — bù lại để lưới không mất cột.
      merge: (persisted, current) => {
        const saved = persisted as Partial<OrdersState> | undefined;
        if (!saved?.columns) return { ...current, ...saved };
        const known = new Set(ORDER_COLUMN_ORDER);
        const order = saved.columns.order.filter((key) => known.has(key));
        const missing = ORDER_COLUMN_ORDER.filter((key) => !order.includes(key));
        return {
          ...current,
          ...saved,
          columns: {
            order: [...order, ...missing],
            visibility: {
              ...Object.fromEntries(ORDER_COLUMNS.map((c) => [c.key, true])),
              ...saved.columns.visibility,
            },
            frozen: saved.columns.frozen.filter((key) => known.has(key)),
          },
        };
      },
    },
  ),
);

export const useOrdersActions = () => useOrdersStore((s) => s.actions);
