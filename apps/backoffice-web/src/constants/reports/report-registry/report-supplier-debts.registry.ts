import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import { ReportTableColumn } from "../report-table.constant";
import { ReportColumnConfig, ReportTableConfig } from "../report.interface";

// Cột dự phòng (fallback) — nguồn sự thật là GET /reports/debts/columns. Chỉ 2
// cột định danh (Mã NCC/Tên NCC) cố định — xem docs/24-debt-reports-spec.md #3.
const columns: ReportColumnConfig[] = [
  {
    column: ReportTableColumn.SUPPLIER_CODE,
    backendField: "supplierCode",
    order: 1,
    visible: true,
    tableConfig: { width: 120, pinned: "left", align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.SUPPLIER_NAME,
    backendField: "supplierName",
    order: 2,
    visible: true,
    tableConfig: { width: 180, pinned: "left", align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.DEBT_OPENING,
    backendField: "debtOpening",
    order: 3,
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.DEBT_INCREASE,
    backendField: "debtIncrease",
    order: 4,
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.DEBT_DECREASE,
    backendField: "debtDecrease",
    order: 5,
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.DEBT_CLOSING,
    backendField: "debtClosing",
    order: 6,
    visible: true,
    tableConfig: { width: 130 },
  },
];

export const single_tableRegistryReportSupplierDebts: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns,
};

export const chain_tableRegistryReportSupplierDebts: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns,
};

// Nhóm NCC tạm ẩn khỏi báo cáo này (theo yêu cầu) — vẫn giữ trong enum filter
// dùng chung, chỉ không đưa vào danh sách hiển thị bên dưới.
// Chế độ 1 chi nhánh: không có filter "Cửa hàng" phụ (đã ở ngữ cảnh 1 chi nhánh).
export const single_filterRegistryReportSupplierDebts = [
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];

// Chế độ Chuỗi cửa hàng: có filter "Cửa hàng" phụ, mặc định gộp toàn chuỗi.
export const chain_filterRegistryReportSupplierDebts = [
  REPORT_FILTERS_LINE.STORE_IN_CHAIN_OPTIONAL,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
