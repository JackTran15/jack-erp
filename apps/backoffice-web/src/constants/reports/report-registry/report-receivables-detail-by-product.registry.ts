import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import { ReportTableColumn } from "../report-table.constant";
import { ReportColumnConfig, ReportTableConfig } from "../report.interface";

// Cột dự phòng (fallback) — nguồn sự thật là GET /reports/debts/columns. Sổ chi
// tiết công nợ của 1 khách hàng cụ thể, group theo chứng từ + dòng "Cộng", số dư
// luỹ kế chạy theo dòng (xem docs/24-debt-reports-spec.md #2).
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
    tableConfig: { width: 160, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.DOCUMENT_DESCRIPTION,
    backendField: "documentDescription",
    order: 4,
    visible: true,
    tableConfig: { width: 220, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.SKU,
    backendField: "sku",
    order: 5,
    visible: true,
    tableConfig: { width: 110, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.PRODUCT_NAME,
    backendField: "itemName",
    order: 6,
    visible: true,
    tableConfig: { width: 200, align: "left", dataType: "text" },
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
    column: ReportTableColumn.REVENUE_GOODS,
    backendField: "revenueGoods",
    order: 11,
    visible: true,
    tableConfig: { width: 120 },
  },
  {
    column: ReportTableColumn.REVENUE_PROMOTION,
    backendField: "revenuePromotion",
    order: 12,
    visible: true,
    tableConfig: { width: 110 },
  },
  {
    column: ReportTableColumn.REVENUE_TOTAL,
    backendField: "revenueTotal",
    order: 13,
    visible: true,
    tableConfig: { width: 120 },
  },
  {
    column: ReportTableColumn.LINE_COLLECTED_AMOUNT,
    backendField: "lineCollected",
    order: 14,
    visible: true,
    tableConfig: { width: 110 },
  },
  {
    column: ReportTableColumn.LINE_DEBT_INCREASE,
    backendField: "lineDebtIncrease",
    order: 15,
    visible: true,
    tableConfig: { width: 110 },
  },
  {
    column: ReportTableColumn.LINE_DEBT_DECREASE,
    backendField: "lineDebtDecrease",
    order: 16,
    visible: true,
    tableConfig: { width: 110 },
  },
  {
    column: ReportTableColumn.RUNNING_BALANCE,
    backendField: "runningBalance",
    order: 17,
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.STORE_NAME,
    backendField: "branchName",
    order: 18,
    visible: true,
    tableConfig: { width: 150, align: "left", dataType: "text" },
  },
];

export const single_tableRegistryReportReceivablesDetailByProduct: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns,
};

export const chain_tableRegistryReportReceivablesDetailByProduct: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns,
};

// Khách hàng bắt buộc chọn (báo cáo luôn xem theo 1 khách hàng cụ thể) — không
// có filter chọn cửa hàng (luôn gộp mọi chi nhánh khách hàng từng giao dịch).
// Nhóm khách hàng tạm ẩn khỏi báo cáo này (theo yêu cầu) — vẫn giữ trong enum
// filter dùng chung, chỉ không đưa vào danh sách hiển thị bên dưới.
export const single_filterRegistryReportReceivablesDetailByProduct = [
  REPORT_FILTERS_LINE.CUSTOMER_SEARCH,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];

export const chain_filterRegistryReportReceivablesDetailByProduct = [
  REPORT_FILTERS_LINE.CUSTOMER_SEARCH,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
