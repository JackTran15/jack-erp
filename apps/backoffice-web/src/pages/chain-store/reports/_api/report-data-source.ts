import {
  getReportBackendKey,
  getReportBackendSource,
} from "../../../../constants/reports/report-type.constant";
import type { STORE_TYPE } from "../../../../constants/store.constant";
import type {
  ReportColumnFilter,
  ReportFilterValues,
} from "../../../../store/page-stores/report/report.interface";
import {
  buildColumnFilters,
  buildSearchFilters,
  fetchReportData,
  type ReportRow,
} from "./invoice-report.api";
import {
  buildInventorySearchFilters,
  fetchInventoryReportData,
} from "./inventory-report-v2.api";

// Tham số chuẩn hóa truyền cho mọi fetcher data của report.
export interface ReportDataArgs {
  reportType: string;
  branch: STORE_TYPE;
  /** Chi nhánh đang chọn ở ERP header (null khi mode Chuỗi). */
  activeBranchId?: string | null;
  filters: Partial<ReportFilterValues>;
  columnFilters: Record<string, ReportColumnFilter>;
  columns: string[];
  numericCols: Set<string>;
  page: number; // 1-based
  limit: number;
}

export interface ReportDataResult {
  rows: ReportRow[];
  totals: ReportRow;
  total: number;
}

export type ReportDataFetcher = (args: ReportDataArgs) => Promise<ReportDataResult>;

// Báo cáo bán hàng: backend report invoice generic (theo backendKey).
const invoiceDataFetcher: ReportDataFetcher = async (args) => {
  const backendKey = getReportBackendKey(args.reportType);
  const res = await fetchReportData({
    reportType: backendKey as string,
    columns: args.columns,
    filters: buildSearchFilters(args.filters),
    columnFilters: buildColumnFilters(args.columnFilters, args.numericCols),
    page: args.page,
    limit: args.limit,
  });
  return {
    rows: res.rows,
    totals: res.totals ?? {},
    total: res.total ?? 0,
  };
};

// Báo cáo kho: cùng contract nhưng qua bộ endpoint /reports/inventory/*.
const inventoryDataFetcher: ReportDataFetcher = async (args) => {
  const backendKey = getReportBackendKey(args.reportType) as string;
  const res = await fetchInventoryReportData({
    reportType: backendKey,
    columns: args.columns,
    filters: buildInventorySearchFilters(args.filters, {
      branch: args.branch,
      activeBranchId: args.activeBranchId,
      backendKey,
    }),
    columnFilters: buildColumnFilters(args.columnFilters, args.numericCols),
    page: args.page,
    limit: args.limit,
  });
  return {
    rows: res.rows,
    totals: res.totals ?? {},
    total: res.total ?? 0,
  };
};

// Chọn nguồn data theo report type: backendKey quyết định BE có hỗ trợ không,
// backendSource quyết định bộ endpoint (invoice vs inventory).
export function getReportDataFetcher(
  reportType: string,
): ReportDataFetcher | undefined {
  if (!getReportBackendKey(reportType)) return undefined;
  return getReportBackendSource(reportType) === "inventory"
    ? inventoryDataFetcher
    : invoiceDataFetcher;
}
