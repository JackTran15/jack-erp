import type { ColumnFilter } from "../../../components/table/pagination.dto";
import { mockDelay } from "../_mock/mockDelay";
import { getOrderRows, type OrderRow } from "../_mock/orders.mock";
import {
  ORDER_COLUMN_BY_KEY,
  ORDER_SUMMARY_KEYS,
  type OrderColumnKey,
} from "./order-columns";

/** Trường ngày mà filter bar đang lọc theo (ô select đầu tiên). */
export type OrderDateField = "createdDate" | "deliveryDate" | "invoiceDate";

export interface OrderAppliedFilter {
  dateField: OrderDateField;
  from: string;
  to: string;
  tags: string[];
}

export interface OrdersQueryParams {
  applied: OrderAppliedFilter;
  columnFilters: Record<string, ColumnFilter>;
  page: number;
  pageSize: number;
}

export interface OrdersQueryResult {
  rows: OrderRow[];
  total: number;
  /** Tổng tính trên TOÀN BỘ kết quả lọc, không chỉ trang hiện tại (spec §4.3.F). */
  totals: Partial<Record<OrderColumnKey, number>>;
}

function matchesText(cell: string, filter: ColumnFilter): boolean {
  const needle = filter.value.trim().toLowerCase();
  if (!needle) return true;
  const haystack = cell.toLowerCase();
  switch (filter.mode) {
    case "equals":
      return haystack === needle;
    case "startsWith":
      return haystack.startsWith(needle);
    case "endsWith":
      return haystack.endsWith(needle);
    case "notContains":
      return !haystack.includes(needle);
    default:
      return haystack.includes(needle);
  }
}

function matchesDate(cell: string, filter: ColumnFilter): boolean {
  if (!filter.value) return true;
  // Ô trống không khớp bất kỳ phép so sánh ngày nào.
  if (!cell) return false;
  switch (filter.compareOp ?? "=") {
    case "<":
      return cell < filter.value;
    case "<=":
      return cell <= filter.value;
    case ">":
      return cell > filter.value;
    case ">=":
      return cell >= filter.value;
    default:
      return cell === filter.value;
  }
}

/** Ô `number-range` của BaseDataTable là chip `≤` cố định. */
function matchesNumber(cell: number, filter: ColumnFilter): boolean {
  if (!filter.value.trim()) return true;
  const limit = Number(filter.value);
  return Number.isNaN(limit) ? true : cell <= limit;
}

function matchesColumnFilters(
  row: OrderRow,
  columnFilters: Record<string, ColumnFilter>,
): boolean {
  for (const [key, filter] of Object.entries(columnFilters)) {
    if (!filter || (!filter.value && !filter.from && !filter.to)) continue;
    const column = ORDER_COLUMN_BY_KEY.get(key as OrderColumnKey);
    if (!column) continue;
    const cell = row[column.key];

    if (column.filterKind === "number-range") {
      if (!matchesNumber(typeof cell === "number" ? cell : 0, filter)) return false;
      continue;
    }
    if (column.filterKind === "date-compare" || column.filterKind === "date") {
      if (!matchesDate(String(cell ?? ""), filter)) return false;
      continue;
    }
    if (column.filterKind === "select") {
      if (filter.value && String(cell ?? "") !== filter.value) return false;
      continue;
    }
    if (column.filterKind === "none") continue;
    if (!matchesText(String(cell ?? ""), filter)) return false;
  }
  return true;
}

function matchesApplied(row: OrderRow, applied: OrderAppliedFilter): boolean {
  if (applied.tags.length > 0 && !row.tags.some((tag) => applied.tags.includes(tag))) {
    return false;
  }
  const date = row[applied.dateField];
  // Đơn chưa có ngày ở trường đang lọc thì không bị kỳ loại bỏ — ảnh chụp cho
  // thấy các đơn chưa giao / chưa xuất hóa đơn vẫn nằm trong danh sách.
  if (!date) return true;
  if (applied.from && date < applied.from) return false;
  if (applied.to && date > applied.to) return false;
  return true;
}

export function fetchOrders(params: OrdersQueryParams): Promise<OrdersQueryResult> {
  const filtered = getOrderRows().filter(
    (row) =>
      matchesApplied(row, params.applied) &&
      matchesColumnFilters(row, params.columnFilters),
  );

  const totals: Partial<Record<OrderColumnKey, number>> = {};
  for (const key of ORDER_SUMMARY_KEYS) {
    totals[key] = filtered.reduce((sum, row) => {
      const value = row[key];
      return sum + (typeof value === "number" ? value : 0);
    }, 0);
  }

  const start = (params.page - 1) * params.pageSize;
  return mockDelay({
    rows: filtered.slice(start, start + params.pageSize),
    total: filtered.length,
    totals,
  });
}
