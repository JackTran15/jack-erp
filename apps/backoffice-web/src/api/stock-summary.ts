import { apiClient } from "../lib/api-axios";

export interface StockSummaryRow {
  itemId: string;
  storageId: string;
  item: {
    id: string;
    code: string;
    name: string;
    unit: string;
    brand: string | null;
    isActive: boolean;
    categoryName: string | null;
  };
  storage: {
    id: string;
    name: string;
    branchId: string;
  };
  quantity: number;
  lastMovementAt: string | null;
}

export interface StockSummaryResponse {
  data: StockSummaryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalQuantity: number;
}

export type StockStateFilter =
  | "ALL"
  | "IN_STOCK"
  | "OUT_OF_STOCK"
  | "NEGATIVE";

export interface StockSummaryQuery {
  page: number;
  pageSize: number;
  search?: string;
  branchId?: string;
  storageId?: string;
  categoryId?: string;
  brand?: string;
  unit?: string;
  isActive?: boolean;
  isPosVisible?: boolean;
  stockState?: StockStateFilter;
  /** YYYY-MM-DD */
  movementFrom?: string;
  /** YYYY-MM-DD */
  movementTo?: string;
}

export async function listStockSummary(
  query: StockSummaryQuery,
): Promise<StockSummaryResponse> {
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params[key] = value as string | number | boolean;
  }
  const { data } = await apiClient.get<StockSummaryResponse>(
    "/inventory/stock/summary",
    { params },
  );
  return data;
}

export interface StockSummaryFilterOptions {
  brands: string[];
  units: string[];
}

export async function getStockSummaryFilterOptions(): Promise<StockSummaryFilterOptions> {
  const { data } = await apiClient.get<StockSummaryFilterOptions>(
    "/inventory/stock/summary/filter-options",
  );
  return data;
}
