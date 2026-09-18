import { GRANULARITY, type Granularity } from "../_lib/granularity";
import type { OverviewPeriod } from "../_lib/period";
import { mockDelay } from "./mockDelay";
import { createRandom, hashSeed, randomMoney } from "./seededRandom";

export interface RevenueCostProfitPoint {
  label: string;
  revenue: number;
  cost: number;
  profit: number;
}

export interface RevenueCostProfitTimeData {
  updatedAt: string;
  points: RevenueCostProfitPoint[];
  /** Tiêu đề trục X, đổi theo "Thống kê theo". */
  axisTitle: string;
}

export interface RevenueCostProfitTimeParams {
  scopeKey: string;
  period: OverviewPeriod;
  granularity: Granularity;
}

/**
 * Trục X của widget này khác các widget khác: kỳ luôn là MỘT NĂM (`year_YYYY`)
 * hoặc "3 năm gần nhất", và nhãn là số trần ("1".."12") chứ không phải `MM/YYYY`.
 */
function buildBuckets(
  period: OverviewPeriod,
  granularity: Granularity,
  now: Date,
): { buckets: { key: string; label: string }[]; axisTitle: string } {
  const year = period.startsWith("year_")
    ? Number(period.slice(5))
    : now.getFullYear();

  if (granularity === GRANULARITY.QUARTER) {
    return {
      buckets: Array.from({ length: 4 }, (_, i) => ({
        key: `${year}-q${i + 1}`,
        label: `Quý ${i + 1}`,
      })),
      axisTitle: "Quý",
    };
  }

  if (granularity === GRANULARITY.YEAR) {
    const current = now.getFullYear();
    return {
      buckets: Array.from({ length: 3 }, (_, i) => {
        const y = current - 2 + i;
        return { key: `${y}`, label: `${y}` };
      }),
      axisTitle: "Năm",
    };
  }

  return {
    buckets: Array.from({ length: 12 }, (_, i) => ({
      key: `${year}-${i + 1}`,
      label: `${i + 1}`,
    })),
    axisTitle: "Tháng",
  };
}

/** MOCK — thay bằng API "doanh thu, chi phí, lợi nhuận theo thời gian". */
export function fetchRevenueCostProfitTime({
  scopeKey,
  period,
  granularity,
}: RevenueCostProfitTimeParams): Promise<RevenueCostProfitTimeData> {
  const { buckets, axisTitle } = buildBuckets(period, granularity, new Date());

  const points: RevenueCostProfitPoint[] = buckets.map((bucket) => {
    const random = createRandom(
      hashSeed("revenue-cost-profit-time", scopeKey, bucket.key),
    );
    const active = random() > 0.65;
    const revenue = active ? randomMoney(random, 0, 700_000_000, 1_000_000) : 0;
    const cost = Math.round(revenue * (0.4 + random() * 0.65));
    // Bất biến của spec: Lợi nhuận = Doanh thu − Chi phí (có thể âm).
    return { label: bucket.label, revenue, cost, profit: revenue - cost };
  });

  return mockDelay({ updatedAt: new Date().toISOString(), points, axisTitle });
}
