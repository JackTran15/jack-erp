import type { Granularity } from "../_lib/granularity";
import type { OverviewPeriod } from "../_lib/period";
import { buildTimeBuckets } from "../_lib/timeBuckets";
import { mockDelay } from "./mockDelay";
import { createRandom, hashSeed, randomMoney } from "./seededRandom";

export interface ProductProfitPoint {
  label: string;
  revenue: number;
  cogs: number;
  profit: number;
}

export interface ProductProfitData {
  updatedAt: string;
  totals: { revenue: number; cogs: number; profit: number };
  points: ProductProfitPoint[];
}

export interface ProductProfitParams {
  scopeKey: string;
  period: OverviewPeriod;
  granularity: Granularity;
  /** Rỗng = "Tất cả". Chỉ dùng làm hạt giống cho mock. */
  productGroupIds: string[];
  variantIds: string[];
  productIds: string[];
}

/** MOCK — thay bằng API "lợi nhuận hàng hóa theo thời gian". */
export function fetchProductProfit({
  scopeKey,
  period,
  granularity,
  productGroupIds,
  variantIds,
  productIds,
}: ProductProfitParams): Promise<ProductProfitData> {
  const filterKey = [
    productGroupIds.join(","),
    variantIds.join(","),
    productIds.join(","),
  ].join("|");

  const points: ProductProfitPoint[] = buildTimeBuckets(period, granularity).map(
    (bucket) => {
      const random = createRandom(
        hashSeed("product-profit", scopeKey, filterKey, bucket.key),
      );
      const active = random() > 0.6;
      const revenue = active ? randomMoney(random, 0, 60_000_000, 100_000) : 0;
      // Giá vốn 55–95% doanh thu → lợi nhuận đôi khi âm, giống thực tế.
      const cogs = Math.round(revenue * (0.55 + random() * 0.45));
      return { label: bucket.label, revenue, cogs, profit: revenue - cogs };
    },
  );

  const totals = points.reduce(
    (acc, p) => ({
      revenue: acc.revenue + p.revenue,
      cogs: acc.cogs + p.cogs,
      profit: acc.profit + p.profit,
    }),
    { revenue: 0, cogs: 0, profit: 0 },
  );

  return mockDelay({ updatedAt: new Date().toISOString(), totals, points });
}
