import { resolvePeriodRange, type PeriodPreset } from "@erp/ui";
import { REPORT_FILTERS_LINE } from "../../../constants/reports/report-filters.constant";
import type { REPORT_CATEGORY } from "../../../constants/reports/report-category.constant";
import type { REPORT_BRANCH } from "../../../constants/reports/report.constant";
import type { ReportBranchConfig } from "../../../constants/reports/report.interface";
import type { ReportInitialState } from "./report.interface";

export const DEFAULT_REPORT_PERIOD: PeriodPreset = "this_month";

interface BuildArgs {
  category: REPORT_CATEGORY;
  branch: REPORT_BRANCH;
  configs: ReportBranchConfig;
}

export function buildInitialReportState({
  category,
  branch,
  configs,
}: BuildArgs): ReportInitialState {
  const range = resolvePeriodRange(DEFAULT_REPORT_PERIOD);
  return {
    category,
    branch,
    listReport: configs.listReport,
    tableConfig: configs.tableConfig,
    reportType: configs.listReport[0] ?? "",
    filters: {
      [REPORT_FILTERS_LINE.STORE]: { scope: "all", storeIds: [] },
      [REPORT_FILTERS_LINE.REPORT_PERIOD]: DEFAULT_REPORT_PERIOD,
      [REPORT_FILTERS_LINE.RANGE_DATE]: { fromDate: range.from, toDate: range.to },
      [REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND]: false,
    },
  };
}
