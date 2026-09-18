/**
 * "Kỳ báo cáo" của trang Tổng quan.
 *
 * Tái dùng `PeriodPreset` / `resolvePeriodRange` của `@erp/ui` cho các preset đã
 * có sẵn trong app, và bổ sung tại chỗ những kỳ chỉ trang này cần:
 * `month_1..month_12`, `last_4_weeks`, `last_3_years`, `year_<YYYY>`.
 */
import { resolvePeriodRange, type PeriodPreset } from "@erp/ui";

/** Preset của `@erp/ui` mà trang Tổng quan dùng lại ("custom" không dùng). */
export type SharedPeriod = Exclude<PeriodPreset, "custom">;

export type MonthPeriod = `month_${number}`;
export type YearPeriod = `year_${number}`;

export type OverviewPeriod =
  | SharedPeriod
  | MonthPeriod
  | YearPeriod
  | "last_4_weeks"
  | "last_3_years";

const SHARED_LABELS: Record<SharedPeriod, string> = {
  today: "Hôm nay",
  yesterday: "Hôm qua",
  this_week: "Tuần này",
  last_week: "Tuần trước",
  this_month: "Tháng này",
  last_month: "Tháng trước",
  this_quarter: "Quý này",
  last_quarter: "Quý trước",
  last_six_months: "6 tháng trước",
  this_year: "Năm nay",
  last_year: "Năm trước",
};

export function periodLabel(period: OverviewPeriod): string {
  if (period in SHARED_LABELS) return SHARED_LABELS[period as SharedPeriod];
  if (period === "last_4_weeks") return "4 tuần gần đây";
  if (period === "last_3_years") return "3 năm gần nhất";
  if (period.startsWith("month_")) return `Tháng ${period.slice(6)}`;
  if (period.startsWith("year_")) return `Năm ${period.slice(5)}`;
  return period;
}

export function periodOptions(
  periods: readonly OverviewPeriod[],
): { value: string; label: string }[] {
  return periods.map((p) => ({ value: p, label: periodLabel(p) }));
}

/** `month_1` … `month_12` — dùng lại ở nhiều bảng kỳ báo cáo. */
export const MONTH_PERIODS: readonly OverviewPeriod[] = Array.from(
  { length: 12 },
  (_, i) => `month_${i + 1}` as MonthPeriod,
);

/** `year_2026`, `year_2025`, `year_2024` … đếm lùi từ năm hiện tại. */
export function yearPeriods(count: number, now: Date = new Date()): OverviewPeriod[] {
  const current = now.getFullYear();
  return Array.from({ length: count }, (_, i) => `year_${current - i}` as YearPeriod);
}

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfWeek(d: Date): Date {
  const day = d.getDay() || 7; // Mon=1..Sun=7 — cùng quy ước với @erp/ui
  const out = new Date(d);
  out.setDate(d.getDate() - (day - 1));
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Khoảng [from, to] (ISO date) của một kỳ, neo tại `now`. */
export function resolveOverviewPeriodRange(
  period: OverviewPeriod,
  now: Date = new Date(),
): { from: string; to: string } {
  if (period in SHARED_LABELS) {
    return resolvePeriodRange(period as PeriodPreset, now);
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  if (period === "last_4_weeks") {
    const to = startOfWeek(today);
    to.setDate(to.getDate() + 6);
    const from = startOfWeek(today);
    from.setDate(from.getDate() - 21);
    return { from: toIsoDate(from), to: toIsoDate(to) };
  }

  if (period === "last_3_years") {
    return {
      from: toIsoDate(new Date(today.getFullYear() - 2, 0, 1)),
      to: toIsoDate(new Date(today.getFullYear(), 11, 31)),
    };
  }

  if (period.startsWith("month_")) {
    // "Tháng 1…12" = tháng đó của năm hiện tại.
    const month = Number(period.slice(6)) - 1;
    return {
      from: toIsoDate(new Date(today.getFullYear(), month, 1)),
      to: toIsoDate(new Date(today.getFullYear(), month + 1, 0)),
    };
  }

  if (period.startsWith("year_")) {
    const year = Number(period.slice(5));
    return {
      from: toIsoDate(new Date(year, 0, 1)),
      to: toIsoDate(new Date(year, 11, 31)),
    };
  }

  const iso = toIsoDate(today);
  return { from: iso, to: iso };
}
