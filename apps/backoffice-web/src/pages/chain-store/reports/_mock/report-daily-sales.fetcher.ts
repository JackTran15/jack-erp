import type {
  TableFiltersState,
  TablePaginationState,
  TableSortingState,
} from "../../../../store/common/table-store/table.interface";
import {
  dailySalesSummaryRows,
  dailySalesSummaryTotals,
  type ReportRow,
} from "./report-daily-sales.mock";

export interface ReportQueryParams {
  filters: TableFiltersState;
  sorting: TableSortingState;
  pagination: TablePaginationState;
}

export interface ReportQueryResult {
  rows: ReportRow[];
  totals: ReportRow;
  total: number;
}

// Mock fetcher: lọc/sắp/phân trang mảng mock theo state từ store.
// Khi có API report thật, chỉ cần thay thân hàm bằng erpApi + requireErpData, giữ nguyên chữ ký.
export async function fetchDailySalesSummary(
  params: ReportQueryParams,
): Promise<ReportQueryResult> {
  let data = [...dailySalesSummaryRows];

  const activeFilters = Object.entries(params.filters.columns).filter(
    ([, f]) => f.value.trim() !== "",
  );
  if (activeFilters.length > 0) {
    data = data.filter((row) => {
      const cells = row as Record<string, string | number | undefined>;
      return activeFilters.every(([id, f]) =>
        String(cells[id] ?? "")
          .toLowerCase()
          .includes(f.value.trim().toLowerCase()),
      );
    });
  }

  const sort = params.sorting.items[0];
  if (sort) {
    data.sort((a, b) => {
      const av = (a as Record<string, string | number | undefined>)[sort.id];
      const bv = (b as Record<string, string | number | undefined>)[sort.id];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sort.desc ? -cmp : cmp;
    });
  }

  const total = data.length;
  const start = params.pagination.pageIndex * params.pagination.pageSize;
  const rows = data.slice(start, start + params.pagination.pageSize);

  return { rows, totals: dailySalesSummaryTotals, total };
}
