import type { REPORT_CATEGORY } from "../../../constants/reports/report-category.constant";
import type { ReportBranchConfig } from "../../../constants/reports/report.interface";
import { STORE_TYPE } from "../../../constants/store.constant";
import type { ReportInitialState } from "./report.interface";

interface BuildArgs {
  category: REPORT_CATEGORY;
  branch: STORE_TYPE;
  configs: ReportBranchConfig;
  /** Report type khởi tạo (vd lấy từ URL hash); chỉ dùng nếu thuộc listReport. */
  reportType?: string;
}

export function buildInitialReportState({
  category,
  branch,
  configs,
  reportType,
}: BuildArgs): ReportInitialState {
  const list = configs.listReport;
  const initialReportType =
    reportType && list.includes(reportType) ? reportType : (list[0] ?? "");
  return {
    category,
    branch,
    listReport: list,
    reportType: initialReportType,
    filters: {},
    columnFilters: {},
    appliedRequest: null,
  };
}
