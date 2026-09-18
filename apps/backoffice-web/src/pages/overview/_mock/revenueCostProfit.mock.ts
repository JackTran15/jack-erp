import type { OverviewPeriod } from "../_lib/period";
import { mockDelay } from "./mockDelay";
import { createRandom, hashSeed, randomMoney } from "./seededRandom";
import { mockStoreNames } from "./stores.mock";

export interface StoreRevenuePoint {
  storeName: string;
  revenue: number;
  cost: number;
  profit: number;
}

export interface RevenueCostProfitData {
  updatedAt: string;
  totals: { revenue: number; cost: number; profit: number };
  byStore: StoreRevenuePoint[];
}

export interface RevenueCostProfitParams {
  scopeKey: string;
  scopeLabel: string;
  period: OverviewPeriod;
}

/** MOCK — thay bằng API "doanh thu / chi phí / lợi nhuận theo cửa hàng". */
export function fetchRevenueCostProfit({
  scopeKey,
  scopeLabel,
  period,
}: RevenueCostProfitParams): Promise<RevenueCostProfitData> {
  const random = createRandom(hashSeed("revenue-cost-profit", scopeKey, period));

  const byStore: StoreRevenuePoint[] = mockStoreNames(scopeKey, scopeLabel).map(
    (storeName) => {
      const revenue = randomMoney(random, 0, 900_000_000, 100_000);
      // Chi phí bám theo doanh thu (55–95%) để lợi nhuận trông hợp lý, thỉnh
      // thoảng vượt 100% → lợi nhuận âm, đúng như mẫu trong spec.
      const cost = Math.round(revenue * (0.55 + random() * 0.5));
      return { storeName, revenue, cost, profit: revenue - cost };
    },
  );

  const totals = byStore.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      cost: acc.cost + row.cost,
      profit: acc.profit + row.profit,
    }),
    { revenue: 0, cost: 0, profit: 0 },
  );

  return mockDelay({ updatedAt: new Date().toISOString(), totals, byStore });
}
