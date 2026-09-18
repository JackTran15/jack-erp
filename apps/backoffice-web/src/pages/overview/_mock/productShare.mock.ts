import { PIE_TOP_N, OTHERS_SLICE_LABEL } from "../../../store/page-stores/overview/overview.constant";
import type {
  DisplayMode,
  ShareDimension,
} from "../../../store/page-stores/overview/overview.interface";
import type { OverviewPeriod } from "../_lib/period";
import { mockProducts, mockVariants } from "./catalog.mock";
import { mockDelay } from "./mockDelay";
import { createRandom, hashSeed, randomMoney } from "./seededRandom";

export interface ShareSlice {
  key: string;
  label: string;
  value: number;
  percent: number;
  isOthers?: boolean;
}

export interface ProductShareData {
  updatedAt: string;
  slices: ShareSlice[];
}

export interface ProductShareParams {
  scopeKey: string;
  dimension: ShareDimension;
  /** Nhãn nhóm hàng hóa đang chọn (để sinh lát khi thống kê theo nhóm). */
  categoryLabels: string[];
  categoryKey: string;
  variantKey: string;
  displayMode: DisplayMode;
  period: OverviewPeriod;
}

/** MOCK — thay bằng API "tỉ trọng doanh thu hàng hóa". */
export function fetchProductShare({
  scopeKey,
  dimension,
  categoryLabels,
  categoryKey,
  variantKey,
  displayMode,
  period,
}: ProductShareParams): Promise<ProductShareData> {
  const seed = hashSeed(
    "product-share",
    scopeKey,
    dimension,
    categoryKey,
    variantKey,
    period,
  );
  const random = createRandom(seed);

  const entries: { key: string; label: string }[] =
    dimension === "product_group"
      ? categoryLabels.map((label, i) => ({ key: `group:${i}`, label }))
      : dimension === "variant"
        ? mockVariants(categoryKey).map((v) => ({
            key: v.value,
            label: displayMode === "sku" ? v.sku : v.label,
          }))
        : mockProducts(`${categoryKey}|${variantKey}`).map((p) => ({
            key: p.value,
            label: displayMode === "sku" ? p.sku : p.label,
          }));

  const valued = entries
    .map((entry) => ({ ...entry, value: randomMoney(random, 0, 800_000_000, 100_000) }))
    .sort((a, b) => b.value - a.value);

  // Gom phần ngoài Top N thành một lát "Nhóm khác".
  const top = valued.slice(0, PIE_TOP_N);
  const restValue = valued.slice(PIE_TOP_N).reduce((acc, e) => acc + e.value, 0);
  const shown = restValue > 0
    ? [...top, { key: "others", label: OTHERS_SLICE_LABEL, value: restValue }]
    : top;

  const total = shown.reduce((acc, e) => acc + e.value, 0);

  const slices: ShareSlice[] = shown.map((entry) => ({
    key: entry.key,
    label: entry.label,
    value: entry.value,
    percent: total > 0 ? Math.round((entry.value / total) * 100) : 0,
    isOthers: entry.key === "others",
  }));

  return mockDelay({ updatedAt: new Date().toISOString(), slices });
}
