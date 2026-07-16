import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import { ReportTableColumn } from "../report-table.constant";
import { ReportColumnConfig, ReportTableConfig } from "../report.interface";

// Cột dự phòng (fallback) khi backend chưa trả cột — nguồn sự thật thật sự là
// GET /reports/debts/columns (xem ReportTableConfigSync). Báo cáo #1 luôn gộp
// toàn bộ chi nhánh khách hàng từng giao dịch — không có filter chọn cửa hàng.
const columns: ReportColumnConfig[] = [
  {
    column: ReportTableColumn.CUSTOMER_CODE,
    backendField: "customerCode",
    order: 1,
    visible: true,
    tableConfig: { width: 120, pinned: "left", align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.CUSTOMER_NAME,
    backendField: "customerName",
    order: 2,
    visible: true,
    tableConfig: { width: 180, pinned: "left", align: "left", dataType: "text", link: true },
  },
  {
    column: ReportTableColumn.CUSTOMER_GROUP,
    backendField: "customerGroup",
    order: 3,
    visible: true,
    tableConfig: { width: 140, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.CUSTOMER_PHONE,
    backendField: "customerPhone",
    order: 4,
    visible: true,
    tableConfig: { width: 120, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.CUSTOMER_EMAIL,
    backendField: "customerEmail",
    order: 5,
    visible: true,
    tableConfig: { width: 160, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.DEBT_OPENING,
    backendField: "debtOpening",
    order: 6,
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.DEBT_INCREASE,
    backendField: "debtIncrease",
    order: 7,
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.DEBT_DECREASE,
    backendField: "debtDecrease",
    order: 8,
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.DEBT_CLOSING,
    backendField: "debtClosing",
    order: 9,
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.ADDRESS,
    backendField: "address",
    order: 10,
    visible: true,
    tableConfig: { width: 200, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.MEMBERSHIP_CARD_NUMBER,
    backendField: "membershipCardNumber",
    order: 11,
    visible: true,
    tableConfig: { width: 140, align: "left", dataType: "text" },
  },
  {
    column: ReportTableColumn.MEMBERSHIP_TIER,
    backendField: "membershipTier",
    order: 12,
    visible: true,
    tableConfig: { width: 110, align: "left", dataType: "text" },
  },
];

export const single_tableRegistryReportCustomerDebts: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns,
};

export const chain_tableRegistryReportCustomerDebts: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns,
};

export const single_filterRegistryReportCustomerDebts = [
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];

export const chain_filterRegistryReportCustomerDebts = [
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
