import type { REPORT_CATEGORY } from "../../../constants/reports/report-category.constant";
import type { ReportBranchConfig } from "../../../constants/reports/report.interface";
import { STORE_TYPE } from "../../../constants/store.constant";
import type { ReportInitialState } from "./report.interface";

interface BuildArgs {
  category: REPORT_CATEGORY;
  branch: STORE_TYPE;
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
    appliedRequest: null,
  };
}
