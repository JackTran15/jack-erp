import { getReportBackendKey } from "../../../../constants/reports/report-type.constant";
import { REPORT_TYPE_INVENTORY } from "../../../../constants/reports/report-type.constant";
import type { STORE_TYPE } from "../../../../constants/store.constant";
import type {
  ReportColumnFilter,
  ReportFilterValues,
} from "../../../../store/page-stores/report/report.interface";
import {
  buildColumnFilters,
  buildSearchFilters,
  fetchReportData,
  mapDataRows,
  mapTotals,
  type ReportRow,
} from "./invoice-report.api";
import { fetchStockSummary } from "./inventory-report.api";

// Tham số chuẩn hóa truyền cho mọi fetcher data của report.
export interface ReportDataArgs {
  reportType: string;
  branch: STORE_TYPE;
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

// Mặc định: report đi qua backend report invoice generic (theo backendKey).
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
    rows: mapDataRows(res.dataRaw),
    totals: mapTotals(res.totals ?? null),
    total: res.total ?? 0,
  };
};

// Report kho dùng endpoint riêng (mỗi report 1 fetcher).
const CUSTOM_FETCHERS: Record<string, ReportDataFetcher> = {
  [REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_SUMMARY]: fetchStockSummary,
};

// Chọn nguồn data theo report type:
// fetcher riêng (kho) → ưu tiên; else có backendKey → invoice; else undefined (chưa hỗ trợ).
export function getReportDataFetcher(
  reportType: string,
): ReportDataFetcher | undefined {
  const custom = CUSTOM_FETCHERS[reportType];
  if (custom) return custom;
  if (getReportBackendKey(reportType)) return invoiceDataFetcher;
  return undefined;
}
