import type { OverviewPeriod } from "../_lib/period";
import {
  buildTimeBuckets,
  type TimeBucketGranularity,
} from "../_lib/timeBuckets";
import { mockDelay } from "./mockDelay";
import { createRandom, hashSeed, randomMoney } from "./seededRandom";

export interface CashFlowPoint {
  label: string;
  cashIn: number;
  cashOut: number;
  diff: number;
}

export interface CashFlowData {
  updatedAt: string;
  totals: { cashIn: number; cashOut: number; diff: number };
  points: CashFlowPoint[];
}

export interface CashFlowParams {
  scopeKey: string;
  period: OverviewPeriod;
  granularity: TimeBucketGranularity;
}

/** MOCK — thay bằng API "tình hình thu chi tiền theo thời gian". */
export function fetchCashFlow({
  scopeKey,
  period,
  granularity,
}: CashFlowParams): Promise<CashFlowData> {
  const buckets = buildTimeBuckets(period, granularity);

  const points: CashFlowPoint[] = buckets.map((bucket) => {
    const random = createRandom(hashSeed("cash-flow", scopeKey, bucket.key));
    // Phần lớn ô không phát sinh → chart có hình dạng thưa như dữ liệu thật.
    const active = random() > 0.6;
    const cashIn = active ? randomMoney(random, 0, 40_000_000, 100_000) : 0;
    const cashOut = active ? randomMoney(random, 0, 30_000_000, 100_000) : 0;
    return { label: bucket.label, cashIn, cashOut, diff: cashIn - cashOut };
  });

  const totals = points.reduce(
    (acc, point) => ({
      cashIn: acc.cashIn + point.cashIn,
      cashOut: acc.cashOut + point.cashOut,
      diff: acc.diff + point.diff,
    }),
    { cashIn: 0, cashOut: 0, diff: 0 },
  );

  return mockDelay({ updatedAt: new Date().toISOString(), totals, points });
}
