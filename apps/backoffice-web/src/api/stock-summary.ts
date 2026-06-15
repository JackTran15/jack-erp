import { erpApi, requireErpData } from "../lib/erp-api";

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
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  closingQty: number;
  closingValue: number;
  transferOutQty: number;
  incomingQty: number;
  reservedQty: number;
}

export interface StockSummaryResponse {
  data: StockSummaryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalQuantity: number;
}

export type StockStateFilter = "ALL" | "IN_STOCK" | "OUT_OF_STOCK" | "NEGATIVE";

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
  /** YYYY-MM-DD */
  startDate?: string;
  /** YYYY-MM-DD */
  endDate?: string;
  excludeReservations?: boolean;
}

export async function listStockSummary(
  query: StockSummaryQuery,
): Promise<StockSummaryResponse> {
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params[key] = value as string | number | boolean;
  }
  return requireErpData(
    await erpApi.GET<StockSummaryResponse>("/inventory/stock/summary", {
      params: { query: params },
    }),
  );
}

export async function searchStockSummary(
  body: Record<string, unknown>,
): Promise<StockSummaryResponse> {
  return requireErpData(
    await erpApi.POST<StockSummaryResponse>(
      "/v2/inventory/stock/summary/search",
      { body },
    ),
  );
}

export interface StockSummaryFilterOptions {
  brands: string[];
  units: string[];
}

export async function getStockSummaryFilterOptions(): Promise<StockSummaryFilterOptions> {
  return requireErpData(
    await erpApi.GET<StockSummaryFilterOptions>(
      "/inventory/stock/summary/filter-options",
    ),
  );
}

export interface StockSummaryDetailRow {
  referenceType: string;
  referenceId: string;
  postedAt: string;
  quantity: number;
  unitCost: number;
  lineValue: number;
  notes: string | null;
}

export interface StockSummaryDetailsResponse {
  data: StockSummaryDetailRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listStockSummaryDetails(params: {
  itemId: string;
  storageId: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}): Promise<StockSummaryDetailsResponse> {
  return requireErpData(
    await erpApi.GET<StockSummaryDetailsResponse>(
      "/inventory/stock/summary/details",
      { params: { query: params } },
    ),
  );
}
