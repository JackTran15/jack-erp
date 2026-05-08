import type { DateRangeFilterChoice } from "./types";

export const DATE_RANGE_FILTER_CHOICES: ReadonlyArray<DateRangeFilterChoice> = [
  { value: "ALL", label: "Toàn bộ" },
  { value: "TODAY", label: "Hôm nay" },
  { value: "YESTERDAY", label: "Hôm qua" },
  { value: "LAST_7_DAYS", label: "7 ngày gần đây" },
  { value: "LAST_14_DAYS", label: "14 ngày gần đây" },
  { value: "THIS_WEEK", label: "Tuần này" },
  { value: "LAST_WEEK", label: "Tuần trước" },
  { value: "THIS_MONTH", label: "Tháng này" },
  { value: "LAST_MONTH", label: "Tháng trước" },
  { value: "THREE_MONTHS_AGO", label: "Ba tháng trước" },
  { value: "SIX_MONTHS_AGO", label: "Sáu tháng trước" },
  { value: "OTHER", label: "Khác" },
];
