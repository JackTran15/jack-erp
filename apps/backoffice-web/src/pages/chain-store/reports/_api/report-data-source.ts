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
  type ReportRow,
} from "./invoice-report.api";
import {
  fetchStockByBranch,
  fetchStockDocumentDetails,
  fetchStockQuantityDetails,
  fetchStockSummary,
  fetchStockSummaryByBranch,
  fetchTemporaryWarehouseOutGoods,
  fetchTransferByBranch,
  fetchTransferSummary,
} from "./inventory-report.api";

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
    rows: res.rows,
    totals: res.totals ?? {},
    total: res.total ?? 0,
  };
};

// Report kho dùng endpoint riêng (mỗi report 1 fetcher).
const CUSTOM_FETCHERS: Record<string, ReportDataFetcher> = {
  [REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_SUMMARY]: fetchStockSummary,
  [REPORT_TYPE_INVENTORY.WAREHOUSE_VOUCHER_DETAIL_LIST]: fetchStockDocumentDetails,
  [REPORT_TYPE_INVENTORY.INVENTORY_IN_OUT_STOCK_QUANTITY_DETAIL]:
    fetchStockQuantityDetails,
  [REPORT_TYPE_INVENTORY.STORE_INVENTORY_IN_OUT_STOCK_SUMMARY]:
    fetchStockSummaryByBranch,
  [REPORT_TYPE_INVENTORY.STOCK_QUANTITY_BY_STORE]: fetchStockByBranch,
  [REPORT_TYPE_INVENTORY.TRANSFER_IN_OUT_SUMMARY]: fetchTransferSummary,
  [REPORT_TYPE_INVENTORY.TRANSFERRED_GOODS_SUMMARY_BY_STORE]:
    fetchTransferByBranch,
  [REPORT_TYPE_INVENTORY.TEMPORARY_WAREHOUSE_OUT_GOODS]:
    fetchTemporaryWarehouseOutGoods,
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
