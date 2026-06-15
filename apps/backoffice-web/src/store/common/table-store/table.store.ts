import { createStore, type StoreApi } from "zustand";
import type { PaginationState, Updater } from "@tanstack/react-table";
import type { TableInitialState, TableState } from "./table.interface";

export type TableStoreApi = StoreApi<TableState>;

// TanStack truyền Updater<T> = T | ((old: T) => T); chuẩn hoá về giá trị mới.
function applyUpdater<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === "function" ? (updater as (old: T) => T)(prev) : updater;
}

export function createTableStore(initialState: TableInitialState): TableStoreApi {
  return createStore<TableState>((set) => ({
    ...initialState,

    columnsActions: {
      setVisibility: (updater) =>
        set((s) => ({
          columns: { ...s.columns, visibility: applyUpdater(updater, s.columns.visibility) },
        })),
      setOrder: (updater) =>
        set((s) => ({ columns: { ...s.columns, order: applyUpdater(updater, s.columns.order) } })),
      setPinning: (updater) =>
        set((s) => ({
          columns: { ...s.columns, pinning: applyUpdater(updater, s.columns.pinning) },
        })),
      setSizing: (updater) =>
        set((s) => ({ columns: { ...s.columns, sizing: applyUpdater(updater, s.columns.sizing) } })),
      toggleVisibility: (columnId) =>
        set((s) => ({
          columns: {
            ...s.columns,
            visibility: { ...s.columns.visibility, [columnId]: s.columns.visibility[columnId] === false },
          },
        })),
      togglePinned: (columnId, side) =>
        set((s) => {
          const { left = [], right = [] } = s.columns.pinning;
          const wasPinned = (side === "left" ? left : right).includes(columnId);
          const stripped = {
            left: left.filter((id) => id !== columnId),
            right: right.filter((id) => id !== columnId),
          };
          const pinning = wasPinned
            ? stripped
            : { ...stripped, [side]: [...stripped[side], columnId] };
          return { columns: { ...s.columns, pinning } };
        }),
    },

    filtersActions: {
      setGlobal: (value) => set((s) => ({ filters: { ...s.filters, global: value } })),
      setColumnFilter: (columnId, patch) =>
        set((s) => {
          const existing = s.filters.columns[columnId] ?? { operator: "", value: "" };
          return {
            filters: {
              ...s.filters,
              columns: { ...s.filters.columns, [columnId]: { ...existing, ...patch } },
            },
          };
        }),
      reset: () => set((s) => ({ filters: { ...s.filters, global: "", columns: {} } })),
    },

    sortingActions: {
      setSorting: (updater) =>
        set((s) => ({ sorting: { items: applyUpdater(updater, s.sorting.items) } })),
    },

    paginationActions: {
      setPagination: (updater) =>
        set((s) => {
          const prev: PaginationState = {
            pageIndex: s.pagination.pageIndex,
            pageSize: s.pagination.pageSize,
          };
          return { pagination: applyUpdater(updater, prev) };
        }),
      setPageIndex: (pageIndex) => set((s) => ({ pagination: { ...s.pagination, pageIndex } })),
      // Đổi page size → quay về trang đầu để tránh pageIndex vượt khỏi tổng số trang.
      setPageSize: (pageSize) => set(() => ({ pagination: { pageIndex: 0, pageSize } })),
    },
  }));
}
