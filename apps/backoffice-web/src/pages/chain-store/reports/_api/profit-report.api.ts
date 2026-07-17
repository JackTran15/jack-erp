import {
  type ColumnFilter,
  type InvoiceReportColumnsResult,
  type InvoiceReportResult,
} from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../../../lib/erp-api";
import { REPORT_FILTERS_LINE } from "../../../../constants/reports/report-filters.constant";
import type {
  ReportColumnFilter,
  ReportFilterValues,
} from "../../../../store/page-stores/report/report.interface";

/** Scope filters for a profit report search — mirrors backend ProfitReportFilterDto. */
export interface ProfitReportFilterPayload {
  issuedAt?: { from?: string; to?: string };
  previousPeriod?: { from?: string; to?: string };
  currentPeriod?: { from?: string; to?: string };
  branchId?: string;
  categoryId?: string;
  statBy?: "item" | "parent" | "group";
}

export interface ProfitReportSearchPayload {
  reportType: string;
  columns: string[];
  filters: ProfitReportFilterPayload;
  columnFilters?: ColumnFilter[];
  page?: number;
  limit?: number;
}

// ===== API calls =====

export async function fetchProfitReportColumns(
  reportType: string,
  statBy?: "item" | "parent" | "group",
): Promise<InvoiceReportColumnsResult> {
  return requireErpData(
    await erpApi.GET<InvoiceReportColumnsResult>("/reports/profit/columns", {
      params: { query: { reportType, statBy } },
    }),
  );
}

export async function fetchProfitReportData(
  payload: ProfitReportSearchPayload,
): Promise<InvoiceReportResult> {
  return requireErpData(
    await erpApi.POST<InvoiceReportResult>("/reports/profit/search", {
      body: payload as unknown as Record<string, unknown>,
    }),
  );
}

// ===== Mappers: store filter → backend payload =====

/** profit-by-item / gross-profit-by-invoice — 1 khoảng ngày, "Thống kê theo" tái dùng STATISTIC_BY. */
export function buildProfitSearchFilters(
  filters: Partial<ReportFilterValues>,
  opts: { activeBranchId?: string | null } = {},
): ProfitReportFilterPayload {
  const range = filters[REPORT_FILTERS_LINE.RANGE_DATE];
  const categoryId = filters[REPORT_FILTERS_LINE.PRODUCT_GROUP];
  const statBy = filters[REPORT_FILTERS_LINE.STATISTIC_BY];
  // "Cửa hàng" filter phụ chỉ xuất hiện ở chế độ Chuỗi cửa hàng; ở single-store
  // branchId đến từ ngữ cảnh (activeBranchId), giống pattern debt-reports #3/#4.
  const storeInChain = filters[REPORT_FILTERS_LINE.STORE_IN_CHAIN_OPTIONAL];

  const notAll = (v: string | undefined): v is string => !!v && v !== "all";

  const payload: ProfitReportFilterPayload = {
    issuedAt: {
      from: range?.fromDate || undefined,
      to: range?.toDate || undefined,
    },
  };
  if (notAll(categoryId)) payload.categoryId = categoryId;
  if (notAll(statBy)) payload.statBy = statBy as "item" | "parent" | "group";
  if (notAll(storeInChain)) payload.branchId = storeInChain;
  else if (opts.activeBranchId) payload.branchId = opts.activeBranchId;
  return payload;
}

/** business-results — 2 kỳ song song (kỳ trước/kỳ hiện tại), xem TKT-PRF-10. */
export function buildBusinessResultsSearchFilters(
  filters: Partial<ReportFilterValues>,
  opts: { activeBranchId?: string | null } = {},
): ProfitReportFilterPayload {
  const previousRange = filters[REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS_RANGE];
  const currentRange = filters[REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT_RANGE];
  const storeInChain = filters[REPORT_FILTERS_LINE.STORE_IN_CHAIN_OPTIONAL];
  const notAll = (v: string | undefined): v is string => !!v && v !== "all";

  const payload: ProfitReportFilterPayload = {
    previousPeriod: {
      from: previousRange?.fromDate || undefined,
      to: previousRange?.toDate || undefined,
    },
    currentPeriod: {
      from: currentRange?.fromDate || undefined,
      to: currentRange?.toDate || undefined,
    },
  };
  if (notAll(storeInChain)) payload.branchId = storeInChain;
  else if (opts.activeBranchId) payload.branchId = opts.activeBranchId;
  return payload;
}

const TEXT_OPERATORS = new Set([
  "contains",
  "equals",
  "startsWith",
  "endsWith",
  "notContains",
]);
const COMPARE_FIELD: Record<string, "eq" | "lt" | "lte" | "gt" | "gte"> = {
  "=": "eq",
  "<": "lt",
  "<=": "lte",
  ">": "gt",
  ">=": "gte",
};

// Column filter (chip header) → backend columnFilters. Cùng logic buildColumnFilters
// của invoice-report.api.ts (giữ bản riêng để module profit-report.api.ts độc lập).
export function buildProfitColumnFilters(
  columnFilters: Record<string, ReportColumnFilter>,
  numericCols: Set<string>,
): ColumnFilter[] {
  const out: ColumnFilter[] = [];
  for (const [col, filter] of Object.entries(columnFilters)) {
    const value = filter.value.trim();
    if (!value) continue;
    const op = filter.operator;
    if (TEXT_OPERATORS.has(op)) {
      out.push({ col, [op]: value } as ColumnFilter);
    } else if (numericCols.has(col)) {
      const field = COMPARE_FIELD[op] ?? "eq";
      out.push({ col, [field]: Number(value) } as ColumnFilter);
    } else if (op === "=") {
      out.push({ col, eq: value });
    } else if (op === "<" || op === "<=") {
      out.push({ col, to: value });
    } else if (op === ">" || op === ">=") {
      out.push({ col, from: value });
    }
  }
  return out;
}
