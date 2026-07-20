import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import { ReportTableColumn } from "../report-table.constant";
import { ReportColumnConfig, ReportTableConfig } from "../report.interface";

// Cột dự phòng (fallback) — nguồn sự thật là GET /reports/debts/columns, vốn
// TRẢ CỘT KHÁC NHAU tuỳ filter "Thống kê theo" (item bỏ 6 cột %CK/Tiền CK/Thuế
// suất/Tiền thuế/Số lượng/Đơn giá khi ở chế độ "Mẫu mã" — xem
// ReportTableConfigSync + docs/24-debt-reports-spec.md #4). Danh sách dưới đây
// là bộ cột đầy đủ (chế độ "Hàng hóa"), chỉ dùng khi BE chưa trả gì.
const columns: ReportColumnConfig[] = [
  {
    column: ReportTableColumn.DATE,
    backendField: "date",
    order: 1,
    visible: true,
    tableConfig: { width: 96, pinned: "left", align: "left", dataType: "date" },
  },
  {
    column: ReportTableColumn.DOCUMENT_NUMBER,
    backendField: "documentNumber",
    order: 2,
    visible: true,
    tableConfig: { width: 130, pinned: "left", align: "left", dataType: "text", link: true },
  },
  {
    column: ReportTableColumn.DOCUMENT_TYPE,
    backendField: "documentType",
    order: 3,
    visible: true,
    tableConfig: { width: 200, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.SKU,
    backendField: "sku",
    order: 4,
    visible: true,
    tableConfig: { width: 130, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.PRODUCT_NAME,
    backendField: "itemName",
    order: 5,
    visible: true,
    tableConfig: { width: 200, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.DOCUMENT_DESCRIPTION,
    backendField: "documentDescription",
    order: 6,
    visible: true,
    tableConfig: { width: 180, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.PRODUCT_GROUP,
    backendField: "itemCategory",
    order: 7,
    visible: true,
    tableConfig: { width: 140, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.UNIT,
    backendField: "unit",
    order: 8,
    visible: true,
    tableConfig: { width: 80, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.QUANTITY,
    backendField: "quantity",
    order: 9,
    visible: true,
    tableConfig: { width: 90 },
  },
  {
    column: ReportTableColumn.UNIT_PRICE,
    backendField: "unitPrice",
    order: 10,
    visible: true,
    tableConfig: { width: 110 },
  },
  {
    column: ReportTableColumn.LINE_TOTAL_AMOUNT,
    backendField: "lineTotal",
    order: 11,
    visible: true,
    tableConfig: { width: 120 },
  },
  {
    column: ReportTableColumn.DISCOUNT_PERCENT,
    backendField: "discountPercent",
    order: 12,
    visible: true,
    tableConfig: { width: 80 },
  },
  {
    column: ReportTableColumn.DISCOUNT_AMOUNT,
    backendField: "discountAmount",
    order: 13,
    visible: true,
    tableConfig: { width: 110 },
  },
  {
    column: ReportTableColumn.TAX_RATE,
    backendField: "taxRate",
    order: 14,
    visible: true,
    tableConfig: { width: 90 },
  },
  {
    column: ReportTableColumn.TAX_AMOUNT,
    backendField: "taxAmount",
    order: 15,
    visible: true,
    tableConfig: { width: 110 },
  },
  {
    column: ReportTableColumn.PAYMENT_AMOUNT_TOTAL,
    backendField: "paymentAmount",
    order: 16,
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.CUMULATIVE_DEBT_INCREASE,
    backendField: "cumulativeDebtIncrease",
    order: 17,
    visible: true,
    tableConfig: { width: 150 },
  },
  {
    column: ReportTableColumn.CUMULATIVE_DEBT_DECREASE,
    backendField: "cumulativeDebtDecrease",
    order: 18,
    visible: true,
    tableConfig: { width: 150 },
  },
  {
    column: ReportTableColumn.DEBT_CLOSING,
    backendField: "closingBalance",
    order: 19,
    visible: true,
    tableConfig: { width: 130 },
  },
];

export const single_tableRegistryReportSupplierDebtsDetailByDocumentAndProduct: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns,
};

export const chain_tableRegistryReportSupplierDebtsDetailByDocumentAndProduct: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns,
};

// Nhóm NCC tạm ẩn khỏi báo cáo này (theo yêu cầu) — vẫn giữ trong enum filter
// dùng chung, chỉ không đưa vào danh sách hiển thị bên dưới.
// Chế độ 1 chi nhánh: không có filter "Cửa hàng" phụ.
export const single_filterRegistryReportSupplierDebtsDetailByDocumentAndProduct = [
  REPORT_FILTERS_LINE.STATISTIC_GROUP_BY_ITEM_OR_TEMPLATE,
  REPORT_FILTERS_LINE.SUPPLIER,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];

// Chế độ Chuỗi cửa hàng: có filter "Cửa hàng" phụ, mặc định gộp toàn chuỗi.
export const chain_filterRegistryReportSupplierDebtsDetailByDocumentAndProduct = [
  REPORT_FILTERS_LINE.STORE_IN_CHAIN_OPTIONAL,
  REPORT_FILTERS_LINE.STATISTIC_GROUP_BY_ITEM_OR_TEMPLATE,
  REPORT_FILTERS_LINE.SUPPLIER,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
