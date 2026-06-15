import {
  applyColumnFilter,
  toComparableText,
  DEFAULT_COLUMN_FILTER_MODE,
  type ColumnFilterMode,
} from "../../../../components/table/pagination.dto";
import { REPORT_FILTERS_LINE } from "../../../../constants/reports/report-filters.constant";
import { ReportTableColumn } from "../../../../constants/reports/report-table.constant";
import type {
  TablePaginationState,
  TableSortingState,
} from "../../../../store/common/table-store/table.interface";
import type {
  ReportColumnFilter,
  ReportFilterValues,
} from "../../../../store/page-stores/report/report.interface";
import {
  dailySalesSummaryRows,
  dailySalesSummaryTotals,
  type ReportRow,
} from "./report-daily-sales.mock";

export interface ReportQueryParams {
  columnFilters: Record<string, ReportColumnFilter>;
  reportFilters: Partial<ReportFilterValues>;
  sorting: TableSortingState;
  pagination: TablePaginationState;
}

// "dd/MM/yyyy" -> "yyyy-MM-dd" để so sánh với khoảng ngày dạng ISO của filter.
function vnDateToIso(value: unknown): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
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

  // 1) Column filter (toán tử + giá trị) theo từng cột.
  const activeFilters = Object.entries(params.columnFilters).filter(
    ([, f]) => f.value.trim() !== "",
  );
  if (activeFilters.length > 0) {
    data = data.filter((row) => {
      const cells = row as Record<string, string | number | undefined>;
      return activeFilters.every(([id, f]) =>
        applyColumnFilter(toComparableText(cells[id]), {
          mode: (f.operator || DEFAULT_COLUMN_FILTER_MODE) as ColumnFilterMode,
          value: f.value,
        }),
      );
    });
  }

  // 2) Report-level filter: chỉ khoảng ngày map được sang cột DATE của mock.
  //    STORE / CHECKBOX / REPORT_PERIOD không có cột tương ứng → chỉ ảnh hưởng refetch.
  const range = params.reportFilters[REPORT_FILTERS_LINE.RANGE_DATE];
  if (range?.fromDate || range?.toDate) {
    data = data.filter((row) => {
      const iso = vnDateToIso((row as ReportRow)[ReportTableColumn.DATE]);
      if (!iso) return true;
      if (range.fromDate && iso < range.fromDate) return false;
      if (range.toDate && iso > range.toDate) return false;
      return true;
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
