import type { ColumnFilter } from "../../components/table/pagination.dto";
import type { StockBalancesQuery } from "../../api/stock-balances";

export const STRING_FILTER_KEYS = [
  "locationCode",
  "locationName",
  "itemCode",
  "itemName",
  "categoryName",
  "unit",
] as const;

export type StringFilterKey = (typeof STRING_FILTER_KEYS)[number];

export function buildQuery(
  page: number,
  pageSize: number,
  filters: Record<string, ColumnFilter>,
): StockBalancesQuery {
  const extra: Partial<StockBalancesQuery> = {};
  for (const key of STRING_FILTER_KEYS) {
    const f = filters[key];
    const value = f?.value?.trim();
    if (!value) continue;
    extra[key] = value;
    extra[`${key as StringFilterKey}Mode`] = f.mode;
  }
  const storageId = filters.storageId?.value?.trim();
  if (storageId) extra.storageId = storageId;
  const q = filters.quantity;
  if (q?.value?.trim()) {
    const n = Number(q.value.trim());
    if (!Number.isNaN(n)) {
      extra.quantity = n;
      extra.quantityOp = "eq";
    }
  }
  // Trạng thái: mặc định chỉ hiện vị trí đang theo dõi; "" (Tất cả) bỏ lọc.
  const status = filters.isTracked?.value;
  if (status === "false") extra.isTracked = false;
  else if (status === "true") extra.isTracked = true;
  else if (status === undefined) extra.isTracked = true;
  return { page, pageSize, ...extra };
}
