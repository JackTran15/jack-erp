/**
 * Chia một kỳ báo cáo thành các "ô" trên trục X của chart theo thời gian.
 *
 * Hỗ trợ đủ 7 granularity của "Thống kê theo". Với `hour_of_day` và
 * `day_of_week`, các ô là chu kỳ cố định (24 giờ / 7 thứ) — kỳ báo cáo chỉ quyết
 * định phạm vi gộp dữ liệu, không quyết định số ô.
 */
import { GRANULARITY, type Granularity } from "./granularity";
import { resolveOverviewPeriodRange, type OverviewPeriod } from "./period";

export type TimeBucketGranularity = Granularity;

export interface TimeBucket {
  /** Khoá ổn định, dùng làm hạt giống cho mock. */
  key: string;
  /** Nhãn hiển thị trên trục X. */
  label: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

const WEEKDAY_LABELS = [
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
  "Chủ nhật",
];

const AXIS_TITLE: Record<Granularity, string> = {
  hour_of_day: "Giờ",
  day_of_week: "Thứ",
  day: "Ngày",
  week: "Tuần",
  month: "Tháng",
  quarter: "Quý",
  year: "Năm",
};

/** Góc xoay nhãn trục X — nhãn ngày dài nên phải dựng đứng. */
const AXIS_ROTATE: Record<Granularity, number> = {
  hour_of_day: 0,
  day_of_week: 0,
  day: -90,
  week: -45,
  month: -45,
  quarter: 0,
  year: 0,
};

export function timeAxisTitle(granularity: Granularity): string {
  return AXIS_TITLE[granularity];
}

export function timeAxisRotate(granularity: Granularity): number {
  return AXIS_ROTATE[granularity];
}

export function buildTimeBuckets(
  period: OverviewPeriod,
  granularity: Granularity,
  now: Date = new Date(),
): TimeBucket[] {
  if (granularity === GRANULARITY.HOUR_OF_DAY) {
    return Array.from({ length: 24 }, (_, h) => ({
      key: `h${h}`,
      label: `${h}h`,
    }));
  }

  if (granularity === GRANULARITY.DAY_OF_WEEK) {
    return WEEKDAY_LABELS.map((label, i) => ({ key: `d${i}`, label }));
  }

  const { from, to } = resolveOverviewPeriodRange(period, now);
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const buckets: TimeBucket[] = [];

  if (granularity === GRANULARITY.DAY) {
    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      buckets.push({
        key: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`,
        label: `${pad(cursor.getDate())}/${pad(cursor.getMonth() + 1)}/${cursor.getFullYear()}`,
      });
    }
    return buckets;
  }

  if (granularity === GRANULARITY.WEEK) {
    let index = 1;
    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setDate(cursor.getDate() + 7)
    ) {
      buckets.push({
        key: `${cursor.getFullYear()}-w${index}`,
        label: `Tuần ${index}`,
      });
      index += 1;
    }
    return buckets;
  }

  if (granularity === GRANULARITY.QUARTER) {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      const quarter = Math.floor(cursor.getMonth() / 3) + 1;
      buckets.push({
        key: `${cursor.getFullYear()}-q${quarter}`,
        label: `Quý ${quarter}/${cursor.getFullYear()}`,
      });
      cursor.setMonth(cursor.getMonth() + 3);
    }
    return buckets;
  }

  if (granularity === GRANULARITY.YEAR) {
    for (let y = start.getFullYear(); y <= end.getFullYear(); y += 1) {
      buckets.push({ key: `${y}`, label: `${y}` });
    }
    return buckets;
  }

  // GRANULARITY.MONTH
  for (
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    cursor <= end;
    cursor.setMonth(cursor.getMonth() + 1)
  ) {
    buckets.push({
      key: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`,
      label: `${pad(cursor.getMonth() + 1)}/${cursor.getFullYear()}`,
    });
  }
  return buckets;
}
