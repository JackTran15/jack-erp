import type { REPORT_CATEGORY } from "../../../constants/reports/report-category.constant";
import type { REPORT_BRANCH } from "../../../constants/reports/report.constant";
import type { ReportBranchConfig } from "../../../constants/reports/report.interface";
import type { ReportInitialState } from "./report.interface";

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
  return {
    category,
    branch,
    listReport: configs.listReport,
    reportType: configs.listReport[0] ?? "",
    filters: {},
    columnFilters: {},
  };
}
