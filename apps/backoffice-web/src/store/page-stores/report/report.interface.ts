import { REPORT_FILTERS_LINE } from "../../../constants/reports/report-filters.constant";
import { REPORT_CATEGORY } from "../../../constants/reports/report-category.constant";
import { REPORT_BRANCH } from "../../../constants/reports/report.constant";
import type { ReportTableConfig } from "../../../constants/reports/report.interface";

export interface StoreScopeValue {
  scope: "all" | "group";
  storeIds: string[];
}

export interface ReportDateRangeValue {
  fromDate: string; // ISO YYYY-MM-DD
  toDate: string; // ISO YYYY-MM-DD
}

// Filter của một cột trong bảng (toán tử + giá trị) — gom chung vào report store.
export interface ReportColumnFilter {
  operator: string;
  value: string;
}

// Giá trị các dòng filter (TYPE tách riêng thành reportType ở state).
export interface ReportFilterValues {
  [REPORT_FILTERS_LINE.STORE]: StoreScopeValue;
  [REPORT_FILTERS_LINE.INVOICE_STATUS]: string[];
  [REPORT_FILTERS_LINE.STAT_DATE_TYPE]: string;
  [REPORT_FILTERS_LINE.REPORT_PERIOD]: string;
  [REPORT_FILTERS_LINE.RANGE_DATE]: ReportDateRangeValue;
  [REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND]: boolean;
  [REPORT_FILTERS_LINE.CASHIER]: string;
  [REPORT_FILTERS_LINE.SALESPERSON]: string;
  [REPORT_FILTERS_LINE.CUSTOMER]: string;
}

// State khởi tạo store (provider nhận, factory dựng từ metadata category + branch).
export interface ReportInitialState {
  category: REPORT_CATEGORY;
  branch: REPORT_BRANCH;
  listReport: string[];
  tableConfig: ReportTableConfig;
  reportType: string;
  // Sparse như columnFilters: chỉ chứa line đã được set (không default dư thừa theo report type).
  filters: Partial<ReportFilterValues>;
  columnFilters: Record<string, ReportColumnFilter>;
}

export interface ReportActions {
  setReportType: (type: string) => void;
  setFilterValue: <K extends keyof ReportFilterValues>(
    line: K,
    value: ReportFilterValues[K],
  ) => void;
  setColumnFilter: (columnId: string, patch: Partial<ReportColumnFilter>) => void;
  resetFilters: () => void;
  reset: () => void;
}

export interface ReportState extends ReportInitialState {
  actions: ReportActions;
}
