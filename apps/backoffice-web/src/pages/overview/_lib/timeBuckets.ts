/**
 * Chia một kỳ báo cáo thành các "ô" trên trục X của chart theo thời gian.
 *
 * Hiện hỗ trợ `day` và `month` — đủ cho row 2. Các granularity còn lại (giờ
 * trong ngày, thứ trong tuần, tuần, quý, năm) sẽ được bổ sung ở row 3.
 */
import { resolveOverviewPeriodRange, type OverviewPeriod } from "./period";

export type TimeBucketGranularity = "day" | "month";

export interface TimeBucket {
  /** Khoá ổn định, dùng làm hạt giống cho mock. */
  key: string;
  /** Nhãn hiển thị trên trục X. */
  label: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Nhãn trục X: `DD/MM/YYYY` cho ngày, `MM/YYYY` cho tháng. */
export function buildTimeBuckets(
  period: OverviewPeriod,
  granularity: TimeBucketGranularity,
  now: Date = new Date(),
): TimeBucket[] {
  const { from, to } = resolveOverviewPeriodRange(period, now);
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const buckets: TimeBucket[] = [];

  if (granularity === "day") {
    for (
      const cursor = new Date(start);
      cursor <= end;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
      buckets.push({
        key,
        label: `${pad(cursor.getDate())}/${pad(cursor.getMonth() + 1)}/${cursor.getFullYear()}`,
      });
    }
    return buckets;
  }

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

/** Tiêu đề trục X đi kèm granularity. */
export function timeAxisTitle(granularity: TimeBucketGranularity): string {
  return granularity === "day" ? "Ngày" : "Tháng";
}
