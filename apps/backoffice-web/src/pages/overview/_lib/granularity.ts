/**
 * "Thống kê theo" và bảng tra "Kỳ báo cáo" phụ thuộc vào nó.
 *
 * Các bảng dưới đây là NGUỒN SỰ THẬT DUY NHẤT: dropdown ở header widget và field
 * "Kỳ báo cáo" trong modal "Tùy chọn" đều đọc từ đây nên không thể lệch nhau.
 *
 * Lưu ý: cùng một granularity có thể có danh sách kỳ khác nhau tuỳ widget (vd
 * `month` ở "Doanh thu theo thời gian" khác ở "Doanh thu, chi phí, lợi nhuận
 * theo thời gian") → mỗi widget có bảng riêng.
 */
import { MONTH_PERIODS, yearPeriods, type OverviewPeriod } from "./period";

export const GRANULARITY = {
  HOUR_OF_DAY: "hour_of_day",
  DAY_OF_WEEK: "day_of_week",
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  QUARTER: "quarter",
  YEAR: "year",
} as const;

export type Granularity = (typeof GRANULARITY)[keyof typeof GRANULARITY];

export const GRANULARITY_LABEL: Record<Granularity, string> = {
  hour_of_day: "Giờ trong ngày",
  day_of_week: "Thứ trong tuần",
  day: "Ngày",
  week: "Tuần",
  month: "Tháng",
  quarter: "Quý",
  year: "Năm",
};

export function granularityOptions(
  values: readonly Granularity[],
): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: GRANULARITY_LABEL[v] }));
}

/** Row 2 — "Tình hình thu chi tiền theo thời gian" (radio Ngày / Tháng). */
export const CASH_FLOW_GRANULARITIES: readonly Granularity[] = [
  GRANULARITY.DAY,
  GRANULARITY.MONTH,
];

export const CASH_FLOW_PERIODS: Record<string, readonly OverviewPeriod[]> = {
  [GRANULARITY.DAY]: ["this_month", "last_month", ...MONTH_PERIODS],
  [GRANULARITY.MONTH]: [
    "this_quarter",
    "last_quarter",
    "this_year",
    "last_year",
    "last_six_months",
  ],
};

/** Row 3 right — "Doanh thu theo thời gian" (select đủ 7 giá trị). */
export const REVENUE_OVER_TIME_GRANULARITIES: readonly Granularity[] = [
  GRANULARITY.HOUR_OF_DAY,
  GRANULARITY.DAY_OF_WEEK,
  GRANULARITY.DAY,
  GRANULARITY.WEEK,
  GRANULARITY.MONTH,
  GRANULARITY.QUARTER,
  GRANULARITY.YEAR,
];

export const REVENUE_OVER_TIME_PERIODS: Record<string, readonly OverviewPeriod[]> = {
  [GRANULARITY.HOUR_OF_DAY]: [
    "today",
    "yesterday",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
  ],
  [GRANULARITY.DAY_OF_WEEK]: ["this_week", "last_week", "last_4_weeks"],
  [GRANULARITY.DAY]: ["this_month", "last_month", ...MONTH_PERIODS],
  [GRANULARITY.WEEK]: ["last_4_weeks"],
  [GRANULARITY.MONTH]: [
    "this_quarter",
    "last_quarter",
    "this_year",
    "last_year",
    "last_six_months",
  ],
  [GRANULARITY.QUARTER]: ["this_year", "last_year"],
  [GRANULARITY.YEAR]: ["last_3_years"],
};

/** Row 3 right — "Lợi nhuận hàng hóa theo thời gian" (radio Ngày / Tháng). */
export const PRODUCT_PROFIT_GRANULARITIES = CASH_FLOW_GRANULARITIES;
export const PRODUCT_PROFIT_PERIODS = CASH_FLOW_PERIODS;

/** Row 3 right — "Doanh thu, chi phí, lợi nhuận theo thời gian" (radio Tháng/Quý/Năm). */
export const REVENUE_COST_PROFIT_GRANULARITIES: readonly Granularity[] = [
  GRANULARITY.MONTH,
  GRANULARITY.QUARTER,
  GRANULARITY.YEAR,
];

export function revenueCostProfitPeriods(
  now: Date = new Date(),
): Record<string, readonly OverviewPeriod[]> {
  const years = yearPeriods(3, now);
  return {
    [GRANULARITY.MONTH]: years,
    [GRANULARITY.QUARTER]: years,
    [GRANULARITY.YEAR]: ["last_3_years"],
  };
}

/**
 * Khi đổi "Thống kê theo": giữ kỳ đang chọn nếu còn hợp lệ, ngược lại lùi về
 * phần tử đầu của danh sách mới.
 */
export function keepOrResetPeriod(
  current: OverviewPeriod,
  allowed: readonly OverviewPeriod[],
): OverviewPeriod {
  return allowed.includes(current) ? current : allowed[0]!;
}
