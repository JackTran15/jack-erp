import { REPORT_FILTERS_LINE } from "../report-filters.constant";
import type { ReportTableConfig } from "../report.interface";

// Hai báo cáo chi tiết chỉ mở từ ô của "Kết quả kinh doanh". Cột lấy hoàn toàn
// từ GET /reports/profit/columns; dialog không vẽ dòng filter nào — phạm vi do
// ô vừa click quyết định (kỳ, cửa hàng, PROFIT_DRILL_SCOPE).
const tableConfig: ReportTableConfig = { summaryLabel: "Tổng", columns: [] };

const filterLines = [
  REPORT_FILTERS_LINE.RANGE_DATE,
  REPORT_FILTERS_LINE.PROFIT_DRILL_SCOPE,
];

export const single_tableRegistryReportBusinessResultsDetail = tableConfig;
export const chain_tableRegistryReportBusinessResultsDetail = tableConfig;
export const single_filterRegistryReportBusinessResultsDetail = filterLines;
export const chain_filterRegistryReportBusinessResultsDetail = [
  REPORT_FILTERS_LINE.STORE_IN_CHAIN_OPTIONAL,
  ...filterLines,
];
