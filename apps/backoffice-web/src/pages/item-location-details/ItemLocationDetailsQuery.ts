import type { ColumnFilter } from "../../components/table/pagination.dto";
import type { StockBalancesQuery } from "../../api/stock-balances";

export const STRING_FILTER_KEYS = [
  "locationName",
  "itemCode",
  "itemName",
  "categoryName",
  "unit",
] as const;

export type StringFilterKey = (typeof STRING_FILTER_KEYS)[number];

/**
 * Giá trị sentinel của option "Trừ {kho showroom}" trong bộ lọc cột Kho. Dùng
 * sentinel thay vì id kho để mặc định áp được ngay lần render đầu, trước khi
 * danh sách kho tải xong.
 */
export const EXCLUDE_SHOWROOM_FILTER_VALUE = "__exclude_showroom__";

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
  if (storageId === EXCLUDE_SHOWROOM_FILTER_VALUE) extra.excludeShowroom = true;
  else if (storageId) extra.storageId = storageId;
  // Cột số dùng toán tử ≤ (number-range), giống các cột số khác trong app.
  const q = filters.quantity;
  if (q?.value?.trim()) {
    const n = Number(q.value.trim());
    if (!Number.isNaN(n)) {
      extra.quantity = n;
      extra.quantityOp = "lte";
    }
  }
  // Trạng thái: mặc định chỉ hiện vị trí đang theo dõi; "" (Tất cả) bỏ lọc.
  const status = filters.isTracked?.value;
  if (status === "false") extra.isTracked = false;
  else if (status === "true") extra.isTracked = true;
  else if (status === undefined) extra.isTracked = true;
  return { page, pageSize, ...extra };
}
