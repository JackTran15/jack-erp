import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import { ReportTableColumn } from "../report-table.constant";
import { ReportColumnConfig, ReportTableConfig } from "../report.interface";

// Cột dự phòng (fallback) — nguồn sự thật là GET /reports/profit/columns.
// 1 dòng/1 NGÀY trong kỳ (không phải 1 dòng/1 hoá đơn — xem TKT-PRF-03).
const columns: ReportColumnConfig[] = [
  {
    column: ReportTableColumn.DATE,
    backendField: "date",
    order: 1,
    visible: true,
    tableConfig: { width: 110, pinned: "left", align: "left", dataType: "date" },
  },
  {
    column: ReportTableColumn.GROSS_GOODS_TOTAL,
    backendField: "grossGoods",
    order: 2,
    number: 1,
    visible: true,
    tableConfig: { width: 140 },
  },
  {
    column: ReportTableColumn.DISCOUNT_AMOUNT,
    backendField: "discount",
    label: "Giảm giá",
    order: 3,
    number: 2,
    visible: true,
    tableConfig: { width: 120 },
  },
  {
    column: ReportTableColumn.REVENUE_TOTAL,
    backendField: "revenue",
    label: "Doanh thu",
    order: 4,
    number: 3,
    formulaDisplay: "(3)=(1)-(2)",
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.COST_OF_GOODS,
    backendField: "costOfGoods",
    label: "Tổng giá vốn",
    order: 5,
    number: 4,
    visible: true,
    tableConfig: { width: 130 },
  },
  {
    column: ReportTableColumn.GROSS_PROFIT,
    backendField: "grossProfit",
    order: 6,
    number: 5,
    formulaDisplay: "(5)=(3)-(4)",
    visible: true,
    tableConfig: { width: 130 },
  },
];

export const single_tableRegistryReportGrossProfitByInvoice: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns,
};

export const chain_tableRegistryReportGrossProfitByInvoice: ReportTableConfig = {
  summaryLabel: "Tổng",
  columns,
};

export const single_filterRegistryReportGrossProfitByInvoice = [
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];

export const chain_filterRegistryReportGrossProfitByInvoice = [
  REPORT_FILTERS_LINE.STORE_IN_CHAIN_OPTIONAL,
  REPORT_FILTERS_LINE.REPORT_PERIOD,
  REPORT_FILTERS_LINE.RANGE_DATE,
];
