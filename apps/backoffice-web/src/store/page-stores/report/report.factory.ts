import { resolvePeriodRange, type PeriodPreset } from "@erp/ui";
import { REPORT_CATEGORY } from "../../../constants/reports/report-category.constant";
import { REPORT_FILTERS_LINE } from "../../../constants/reports/report-filters.constant";
import type { ReportBranchConfig } from "../../../constants/reports/report.interface";
import { STORE_TYPE } from "../../../constants/store.constant";
import type {
  ReportDrillDown,
  ReportFilterValues,
  ReportInitialState,
} from "./report.interface";

/** Kỳ báo cáo mở sẵn theo nhóm báo cáo; thiếu key ⇒ "Tháng này". */
const DEFAULT_PERIOD_PRESET: Partial<Record<REPORT_CATEGORY, PeriodPreset>> = {
  [REPORT_CATEGORY.SALES]: "today",
  [REPORT_CATEGORY.INVENTORY]: "today",
};

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

  // Mặc định kỳ báo cáo: Bán hàng + Kho mở ở "Hôm nay" (người dùng vào hai
  // nhóm này để xem số trong ngày); các nhóm còn lại giữ "Tháng này".
  const defaultPreset = DEFAULT_PERIOD_PRESET[category] ?? "this_month";
  const range = resolvePeriodRange(defaultPreset);
  // "Kết quả kinh doanh" (2 kỳ song song): kỳ trước = tháng trước, kỳ hiện tại
  // = tháng này — khớp mẫu UI đã xác nhận. Set luôn cho mọi report type, vô
  // hại với report không dùng 2 filter line này (giống cách REPORT_PERIOD/
  // RANGE_DATE đã seed sẵn dù không phải report nào cũng đọc).
  const previousRange = resolvePeriodRange("last_month");
  const currentMonthRange = resolvePeriodRange("this_month");
  const filters: Partial<ReportFilterValues> = {
    [REPORT_FILTERS_LINE.REPORT_PERIOD]: defaultPreset,
    [REPORT_FILTERS_LINE.RANGE_DATE]: {
      fromDate: range.from,
      toDate: range.to,
    },
    [REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS]: "last_month",
    [REPORT_FILTERS_LINE.PERIOD_COMPARE_PREVIOUS_RANGE]: {
      fromDate: previousRange.from,
      toDate: previousRange.to,
    },
    [REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT]: "this_month",
    [REPORT_FILTERS_LINE.PERIOD_COMPARE_CURRENT_RANGE]: {
      fromDate: currentMonthRange.from,
      toDate: currentMonthRange.to,
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

/**
 * State khởi tạo cho báo cáo lồng bên trong một dialog drill-down.
 *
 * Khác `buildInitialReportState` ở ba chỗ, và cả ba đều quan trọng:
 *
 * - `filters` lấy nguyên từ descriptor, không seed "tháng này" — descriptor đã
 *   thu hẹp đúng kỳ cần xem (một ngày, hoặc kỳ của báo cáo cha).
 * - `appliedRequest` luôn khác null, kể cả ở chi nhánh đơn: người dùng vừa click
 *   một dòng, họ không cần bấm "Lấy dữ liệu" lần nữa.
 * - `branch` kế thừa từ store cha để query key và đường xuất khẩu trùng nhau.
 *
 * `listReport` chỉ chứa đúng report type của dialog: không có ô chọn báo cáo
 * trong dialog, và một danh sách dài hơn chỉ mời gọi trạng thái không hợp lệ.
 */
export function buildDrillDownReportState(
  parent: Pick<ReportInitialState, "category" | "branch">,
  drillDown: ReportDrillDown,
): ReportInitialState {
  return {
    category: parent.category,
    branch: parent.branch,
    listReport: [drillDown.reportType],
    reportType: drillDown.reportType,
    filters: drillDown.filters,
    columnFilters: {},
    appliedRequest: {
      reportType: drillDown.reportType,
      filters: drillDown.filters,
      columnFilters: {},
    },
    reloadNonce: 0,
  };
}
