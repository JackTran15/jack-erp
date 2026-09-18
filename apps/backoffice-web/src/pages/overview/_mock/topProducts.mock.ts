import { TOP_PRODUCTS_LIMIT } from "../../../store/page-stores/overview/overview.constant";
import type {
  DisplayMode,
  TopProductsSortBy,
} from "../../../store/page-stores/overview/overview.interface";
import type { OverviewPeriod } from "../_lib/period";
import { UNITS, mockProducts } from "./catalog.mock";
import { mockDelay } from "./mockDelay";
import { createRandom, hashSeed, randomInt, randomMoney } from "./seededRandom";

export interface TopProductRow {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  revenue: number;
}

export interface TopProductsData {
  updatedAt: string;
  rows: TopProductRow[];
}

export interface TopProductsParams {
  scopeKey: string;
  categoryKey: string;
  variantKey: string;
  displayMode: DisplayMode;
  period: OverviewPeriod;
  sortBy: TopProductsSortBy;
}

/** MOCK — thay bằng API "hàng hóa bán chạy" (sắp xếp phía server). */
export function fetchTopProducts({
  scopeKey,
  categoryKey,
  variantKey,
  displayMode,
  period,
  sortBy,
}: TopProductsParams): Promise<TopProductsData> {
  const random = createRandom(
    hashSeed("top-products", scopeKey, categoryKey, variantKey, period),
  );

  // Sinh nhiều hơn Top-N rồi cắt, để đổi tiêu chí sắp xếp cho ra tập khác nhau —
  // giống server thật, không phải chỉ sắp xếp lại cùng một tập.
  const rows: TopProductRow[] = mockProducts(`${categoryKey}|${variantKey}`).map(
    (product) => ({
      productId: product.value,
      name: displayMode === "sku" ? product.sku : product.label,
      unit: UNITS[randomInt(random, 0, UNITS.length - 1)]!,
      quantity: randomInt(random, 1, 40),
      revenue: randomMoney(random, 500_000, 12_000_000, 10_000),
    }),
  );

  rows.sort((a, b) =>
    sortBy === "revenue" ? b.revenue - a.revenue : b.quantity - a.quantity,
  );

  return mockDelay({
    updatedAt: new Date().toISOString(),
    rows: rows.slice(0, TOP_PRODUCTS_LIMIT),
  });
}
