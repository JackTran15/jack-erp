import type { ReportTotals } from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../lib/erp-api";
import { apiClient } from "../lib/api-axios";

export type StockSummaryExportVariant =
  | "MODEL_AND_VARIANTS"
  | "VARIANTS"
  | "SPLIT_ATTRIBUTES"
  | "MODELS";

export interface StockSummaryRow {
  itemId: string;
  storageId: string;
  /**
   * Identity of the row's item dimension — the parent product id when the grid
   * groups by SKU, the item id otherwise. Row key and drill-down argument.
   */
  groupKey: string;
  productId: string | null;
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

/**
 * Tổng của **toàn bộ** kết quả lọc, do server tính — không phải tổng của trang
 * hiện tại. Đây là nguồn duy nhất cho dòng footer.
 */
export interface StockSummaryTotals extends ReportTotals {
  quantity: number;
  openingQty: number;
  inQty: number;
  outQty: number;
  closingQty: number;
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
  totals?: StockSummaryTotals;
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

export async function downloadStockSummaryExport(
  variant: StockSummaryExportVariant,
  filters: Record<string, unknown>,
): Promise<void> {
  const { data } = await apiClient.post<Blob>(
    "/inventory/stock/summary/export",
    { ...filters, page: undefined, limit: undefined, variant },
    { responseType: "blob" },
  );
  const url = URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "tong-hop-ton-kho.xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
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

export interface SkuBreakdownRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  quantity: number;
  openingQty: number;
  inQty: number;
  outQty: number;
  transferOutQty: number;
  incomingQty: number;
  /**
   * Pending transfers exist per (hàng hóa × kho), not per vị trí, so the server
   * puts the figure on one row per item and leaves the rest blank.
   */
  isPendingAnchor: boolean;
  reservedQty: number;
}

export interface SkuBreakdownTotals {
  quantity: number;
  openingQty: number;
  inQty: number;
  outQty: number;
  transferOutQty: number;
  incomingQty: number;
  reservedQty: number;
}

export interface SkuBreakdownResponse {
  data: SkuBreakdownRow[];
  total: number;
  page: number;
  pageSize: number;
  itemCount: number;
  totals: SkuBreakdownTotals;
}

export async function searchSkuBreakdown(
  body: Record<string, unknown>,
): Promise<SkuBreakdownResponse> {
  return requireErpData(
    await erpApi.POST<SkuBreakdownResponse>(
      "/v2/inventory/stock/summary/sku-breakdown",
      { body },
    ),
  );
}

export interface StockLedgerCardRow {
  id: string;
  documentType: string;
  documentTypeLabel: string;
  documentNumber: string | null;
  postedAt: string;
  description: string | null;
  inQty: number;
  outQty: number;
  /** Số dư luỹ kế tính từ số dư đầu kỳ. */
  balanceQty: number;
}

export interface StockLedgerCardResponse {
  data: StockLedgerCardRow[];
  total: number;
  page: number;
  pageSize: number;
  unit: string;
  openingQty: number;
  closingQty: number;
  totals: { inQty: number; outQty: number };
  pendingTransferOutQty: number;
  pendingIncomingQty: number;
  documentTypeOptions: Array<{ value: string; label: string }>;
}

export async function searchStockLedgerCard(
  body: Record<string, unknown>,
): Promise<StockLedgerCardResponse> {
  return requireErpData(
    await erpApi.POST<StockLedgerCardResponse>(
      "/v2/inventory/stock/summary/ledger-card",
      { body },
    ),
  );
}
