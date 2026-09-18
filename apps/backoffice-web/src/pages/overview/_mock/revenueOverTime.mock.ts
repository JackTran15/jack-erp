import type { Granularity } from "../_lib/granularity";
import type { OverviewPeriod } from "../_lib/period";
import { buildTimeBuckets } from "../_lib/timeBuckets";
import { mockDelay } from "./mockDelay";
import { createRandom, hashSeed, randomMoney } from "./seededRandom";

export interface RevenuePoint {
  label: string;
  revenue: number;
}

export interface RevenueOverTimeData {
  updatedAt: string;
  points: RevenuePoint[];
}

export interface RevenueOverTimeParams {
  scopeKey: string;
  period: OverviewPeriod;
  granularity: Granularity;
}

/** MOCK — thay bằng API "doanh thu theo thời gian". */
export function fetchRevenueOverTime({
  scopeKey,
  period,
  granularity,
}: RevenueOverTimeParams): Promise<RevenueOverTimeData> {
  const points = buildTimeBuckets(period, granularity).map((bucket) => {
    const random = createRandom(hashSeed("revenue-over-time", scopeKey, bucket.key));
    // Phần lớn ô không phát sinh → chart thưa như dữ liệu thật.
    const active = random() > 0.65;
    return {
      label: bucket.label,
      revenue: active ? randomMoney(random, 0, 700_000_000, 1_000_000) : 0,
    };
  });

  return mockDelay({ updatedAt: new Date().toISOString(), points });
}
