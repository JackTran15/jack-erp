import type {
  ColumnOrderState,
  ColumnPinningState,
  ColumnSizingState,
  PaginationState,
  SortingState,
  Updater,
  VisibilityState,
} from "@tanstack/react-table";
import type { ReportTableConfig } from "../../../constants/reports/report.interface";

// State liên quan đến cột — gom nhóm (ẩn/hiện, thứ tự, ghim, bề rộng).
export interface TableColumnsState {
  visibility: VisibilityState;
  order: ColumnOrderState;
  pinning: ColumnPinningState;
  sizing: ColumnSizingState;
}

export interface TableColumnFilter {
  operator: string;
  value: string;
}

// State liên quan đến filter — filter toàn bảng + filter từng cột.
export interface TableFiltersState {
  global: string;
  columns: Record<string, TableColumnFilter>;
}

// State liên quan đến sort.
export interface TableSortingState {
  items: SortingState;
}

// State liên quan đến phân trang.
export interface TablePaginationState {
  pageIndex: number;
  pageSize: number;
}

// Dữ liệu khởi tạo store (provider nhận, factory dựng từ registry).
export interface TableInitialState {
  tableId: string;
  config: ReportTableConfig;
  columns: TableColumnsState;
  filters: TableFiltersState;
  sorting: TableSortingState;
  pagination: TablePaginationState;
}

// Actions gom theo từng nhóm state; setter nhận Updater<T> để khớp với TanStack Table.
export interface TableColumnsActions {
  setVisibility: (updater: Updater<VisibilityState>) => void;
  setOrder: (updater: Updater<ColumnOrderState>) => void;
  setPinning: (updater: Updater<ColumnPinningState>) => void;
  setSizing: (updater: Updater<ColumnSizingState>) => void;
  toggleVisibility: (columnId: string) => void;
  togglePinned: (columnId: string, side: "left" | "right") => void;
}

export interface TableFiltersActions {
  setGlobal: (value: string) => void;
  setColumnFilter: (columnId: string, patch: Partial<TableColumnFilter>) => void;
  reset: () => void;
}

export interface TableSortingActions {
  setSorting: (updater: Updater<SortingState>) => void;
}

export interface TablePaginationActions {
  setPagination: (updater: Updater<PaginationState>) => void;
  setPageIndex: (pageIndex: number) => void;
  setPageSize: (pageSize: number) => void;
}

export interface TableState extends TableInitialState {
  columnsActions: TableColumnsActions;
  filtersActions: TableFiltersActions;
  sortingActions: TableSortingActions;
  paginationActions: TablePaginationActions;
}
