import { REPORT_FILTERS_LINE } from "../../../constants/reports/report-filters.constant";
import { REPORT_CATEGORY } from "../../../constants/reports/report-category.constant";
import { STORE_TYPE } from "../../../constants/store.constant";

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
  [REPORT_FILTERS_LINE.WAREHOUSE]: string;
  [REPORT_FILTERS_LINE.PRODUCT_GROUP]: string;
  [REPORT_FILTERS_LINE.STATISTIC_BY]: string;
  [REPORT_FILTERS_LINE.UNIT]: string;
  [REPORT_FILTERS_LINE.BRAND]: string;
  [REPORT_FILTERS_LINE.WORK_SHIFT]: string;
  [REPORT_FILTERS_LINE.RECEIVING_STORE]: string;
  [REPORT_FILTERS_LINE.STORE_SINGLE]: string;
  [REPORT_FILTERS_LINE.PRODUCT_TYPE]: string;
  [REPORT_FILTERS_LINE.CHECKBOX_ALLOCATE_COMBO]: boolean;
}

// Bộ filter đã "áp dụng" (commit khi bấm Lấy dữ liệu / Đồng ý) — nguồn gọi API data.
export interface AppliedReportRequest {
  reportType: string;
  filters: Partial<ReportFilterValues>;
  columnFilters: Record<string, ReportColumnFilter>;
}

// State khởi tạo store (provider nhận, factory dựng từ metadata category + branch).
export interface ReportInitialState {
  category: REPORT_CATEGORY;
  branch: STORE_TYPE;
  listReport: string[];
  reportType: string;
  // Sparse như columnFilters: chỉ chứa line đã được set (không default dư thừa theo report type).
  filters: Partial<ReportFilterValues>;
  columnFilters: Record<string, ReportColumnFilter>;
  // null = chưa áp dụng → table chưa gọi API data.
  appliedRequest: AppliedReportRequest | null;
  // Tăng mỗi lần bấm "Lấy dữ liệu" để ép refetch (queryKey đổi kể cả khi filter không đổi).
  reloadNonce: number;
}

export interface ReportActions {
  setReportType: (type: string) => void;
  setFilterValue: <K extends keyof ReportFilterValues>(
    line: K,
    value: ReportFilterValues[K],
  ) => void;
  setColumnFilter: (columnId: string, patch: Partial<ReportColumnFilter>) => void;
  // Chốt filter hiện tại → appliedRequest (kích hoạt fetch data).
  applyFilters: () => void;
  resetFilters: () => void;
  reset: () => void;
  // Mã hóa đơn đang xem chi tiết (mở dialog); null = đóng.
  setDetailInvoiceCode: (code: string | null) => void;
}

export interface ReportState extends ReportInitialState {
  // UI state cho dialog chi tiết hóa đơn (không thuộc initial metadata).
  detailInvoiceCode: string | null;
  actions: ReportActions;
}
