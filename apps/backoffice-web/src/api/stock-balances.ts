import { apiClient } from "../lib/api-axios";
import type { StockByLocationResponse } from "@erp/shared-interfaces";

export type StringFilterMode =
  | "contains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "notContains";

export type NumericFilterOp = "eq" | "lte" | "gte" | "lt" | "gt";

export interface StockBalanceRow {
  id: string;
  itemId: string;
  locationId: string;
  quantity: number;
  lastMovementAt?: string | null;
  item: {
    id: string;
    code: string;
    name: string;
    unit: string;
    categoryName: string | null;
  };
  location: {
    id: string;
    code: string;
    name: string;
    storageId: string;
    storageName: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StockBalancesQuery {
  page: number;
  pageSize: number;
  sortBy?:
    | "createdAt"
    | "itemCode"
    | "itemName"
    | "quantity"
    | "lastMovementAt"
    | "locationCode"
    | "locationName"
    | "storageName";
  sortOrder?: "asc" | "desc";
  // Direct ID filters (backend pre-existing, not per-column)
  itemId?: string;
  locationId?: string;
  storageId?: string;
  // Per-column symbol filters
  locationCode?: string;
  locationCodeMode?: StringFilterMode;
  locationName?: string;
  locationNameMode?: StringFilterMode;
  itemCode?: string;
  itemCodeMode?: StringFilterMode;
  itemName?: string;
  itemNameMode?: StringFilterMode;
  categoryName?: string;
  categoryNameMode?: StringFilterMode;
  unit?: string;
  unitMode?: StringFilterMode;
  storageName?: string;
  storageNameMode?: StringFilterMode;
  quantity?: number;
  quantityOp?: NumericFilterOp;
}

export async function listStockBalances(
  query: StockBalancesQuery,
): Promise<PaginatedResponse<StockBalanceRow>> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params[key] = value as string | number;
  }
  const { data } = await apiClient.get<PaginatedResponse<StockBalanceRow>>(
    "/inventory/stock/balances",
    { params },
  );
  return data;
}

export interface LocationStockItemsQuery {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: "code" | "name" | "quantity" | "lastMovementAt";
  sortOrder?: "asc" | "desc";
}

export async function listLocationStockItems(
  locationId: string,
  query: LocationStockItemsQuery,
): Promise<StockByLocationResponse> {
  const params: Record<string, string | number> = {
    page: query.page,
    pageSize: query.pageSize,
  };
  if (query.search?.trim()) params.search = query.search.trim();
  if (query.sortBy) params.sortBy = query.sortBy;
  if (query.sortOrder) params.sortOrder = query.sortOrder;

  const { data } = await apiClient.get<StockByLocationResponse>(
    `/inventory/locations/${locationId}/stock-items`,
    { params },
  );
  return data;
}

export interface AssignBatchRow {
  itemId: string;
  locationId: string;
}

export interface AssignBatchResult {
  created: number;
  skipped: number;
}

export async function assignItemsBatch(
  rows: AssignBatchRow[],
): Promise<AssignBatchResult> {
  const { data } = await apiClient.post<AssignBatchResult>(
    "/inventory/locations/stock-items/batch",
    { rows },
  );
  return data;
}
