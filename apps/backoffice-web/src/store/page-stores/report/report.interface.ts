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

// Giá trị 1 lựa chọn từ ô search-select (LookupField) — lưu cả id lẫn label
// hiển thị, vì id không đủ để vẽ lại input khi component remount (VD: đóng/mở
// lại dialog filter) mà không phải gọi lại API để tra tên.
export interface ReportLookupSelection {
  id: string;
  label: string;
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
  [REPORT_FILTERS_LINE.SOURCE_STORE]: string;
  [REPORT_FILTERS_LINE.RECEIVING_STORE]: string;
  [REPORT_FILTERS_LINE.STORE_SINGLE]: string;
  [REPORT_FILTERS_LINE.PRODUCT_TYPE]: string;
  [REPORT_FILTERS_LINE.SKU]: string;
  [REPORT_FILTERS_LINE.TRANSFER_LEG]: string;
  [REPORT_FILTERS_LINE.CHECKBOX_ALLOCATE_COMBO]: boolean;
  [REPORT_FILTERS_LINE.CUSTOMER_GROUP]: string;
  [REPORT_FILTERS_LINE.CUSTOMER_SEARCH]: ReportLookupSelection | null;
  [REPORT_FILTERS_LINE.SUPPLIER]: ReportLookupSelection | null;
  [REPORT_FILTERS_LINE.SUPPLIER_GROUP]: string;
  [REPORT_FILTERS_LINE.STATISTIC_GROUP_BY_ITEM_OR_TEMPLATE]: string;
  [REPORT_FILTERS_LINE.STORE_IN_CHAIN_OPTIONAL]: string;
  [REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS]: string;
  [REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS_RANGE]: ReportDateRangeValue;
  [REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT]: string;
  [REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT_RANGE]: ReportDateRangeValue;
}

// Bộ filter đã "áp dụng" (commit khi bấm Lấy dữ liệu / Đồng ý) — nguồn gọi API data.
export interface AppliedReportRequest {
  reportType: string;
  filters: Partial<ReportFilterValues>;
  columnFilters: Record<string, ReportColumnFilter>;
}

/**
 * Hoá đơn đang mở chi tiết. `id` là khoá duy nhất — mã hoá đơn chỉ unique theo
 * từng chi nhánh, nên tra theo mã có thể ra hoá đơn trùng số của chi nhánh khác.
 * `code` giữ lại cho các dòng/báo cáo chưa kèm `id`.
 */
export interface InvoiceDetailTarget {
  code: string;
  id: string | null;
}

/**
 * Một drill-down đã được giải xong: report type đích, tiêu đề hiển thị, và bộ
 * filter đã thu hẹp sẵn. Dialog chỉ việc dựng một report lồng từ đây — nó không
 * biết gì về dòng nào vừa được click.
 *
 * `filters` là allow-list, KHÔNG phải bản sao filter của báo cáo cha: báo cáo
 * nguồn và báo cáo đích không cùng bộ filter line (xem `_lib/report-drilldown`).
 */
export interface ReportDrillDown {
  /**
   * Tên chi nhánh neo, để dialog con gọi đúng tên trong phụ đề.
   *
   * Cần thiết vì dòng của dialog cha là các chi nhánh ĐỐI ỨNG — tên của chính
   * chi nhánh neo không nằm trên dòng nào, chỉ có ở phụ đề của dialog cha. Tuỳ
   * chọn: bốn drill-down bán hàng không set nó và không đổi hành vi.
   */
  anchorName?: string;
  reportType: string;
  title: string;
  subtitle: string;
  filters: Partial<ReportFilterValues>;
}

// State khởi tạo store (provider nhận, factory dựng từ metadata category + branch).
export interface ReportInitialState {
  /** Tên chi nhánh neo, do dialog cha truyền xuống. Undefined ở trang gốc. */
  anchorName?: string;
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
  // Áp dụng ngay filter cột (dòng đầu bảng) mà không bấm "Lấy dữ liệu".
  commitColumnFilters: () => void;
  /** Bỏ filter của những cột không còn trong catalog (đổi "Thống kê theo"/chế độ xem). */
  pruneColumnFilters: (knownColumns: string[]) => void;
  // Chốt filter hiện tại → appliedRequest (kích hoạt fetch data).
  applyFilters: () => void;
  resetFilters: () => void;
  reset: () => void;
  // Hóa đơn đang xem chi tiết (mở dialog); null = đóng.
  setDetailInvoice: (target: InvoiceDetailTarget | null) => void;
  // Drill-down đang mở (dialog báo cáo lồng); null = đóng.
  setDrillDown: (drillDown: ReportDrillDown | null) => void;
}

export interface ReportState extends ReportInitialState {
  // UI state cho dialog chi tiết hóa đơn (không thuộc initial metadata).
  detailInvoice: InvoiceDetailTarget | null;
  // UI state cho dialog drill-down (báo cáo lồng); song song với cái trên, không thay thế.
  drillDown: ReportDrillDown | null;
  actions: ReportActions;
}
