import { resolvePeriodRange } from "@erp/ui";
import type { REPORT_CATEGORY } from "../../../constants/reports/report-category.constant";
import { REPORT_FILTERS_LINE } from "../../../constants/reports/report-filters.constant";
import type { ReportBranchConfig } from "../../../constants/reports/report.interface";
import { STORE_TYPE } from "../../../constants/store.constant";
import type { ReportFilterValues, ReportInitialState } from "./report.interface";

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

  // Mặc định kỳ báo cáo = tháng này.
  const range = resolvePeriodRange("this_month");
  const filters: Partial<ReportFilterValues> = {
    [REPORT_FILTERS_LINE.REPORT_PERIOD]: "this_month",
    [REPORT_FILTERS_LINE.RANGE_DATE]: {
      fromDate: range.from,
      toDate: range.to,
    },
  };

  // Chuỗi cửa hàng (CHAIN): tự fill data ngay (không cần bấm "Đồng ý").
  // Chi nhánh (SINGLE): giữ thủ công (appliedRequest = null → chờ áp dụng).
  const appliedRequest =
    branch === STORE_TYPE.CHAIN
      ? { reportType: initialReportType, filters, columnFilters: {} }
      : null;

  return {
    category,
    branch,
    listReport: list,
    reportType: initialReportType,
    filters,
    columnFilters: {},
    appliedRequest,
    reloadNonce: 0,
  };
}
