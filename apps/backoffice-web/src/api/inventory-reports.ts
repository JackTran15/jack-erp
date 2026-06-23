import { erpApi, requireErpData } from "../lib/erp-api";

// === Shared types ===

export interface ResolvedPeriod {
  startDate: string;
  endDate: string;
}

export interface InventoryReportPagination {
  page: number;
  pageSize: number;
  total: number;
}

// === Query input (UI filter shape) ===

export type InventoryReportPreset =
  | "today"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "custom";

/** Mirrors the backend ItemGroupBy enum. */
export type ItemGroupBy = "item" | "parent" | "group";

export interface InventoryReportFilters {
  preset?: InventoryReportPreset;
  /** yyyy-MM-dd */
  startDate?: string;
  /** yyyy-MM-dd */
  endDate?: string;
  branchIds?: string[];
  locationIds?: string[];
  categoryIds?: string[];
  /** Item-dimension grouping: per-SKU (item), per-product (parent), per-category (group). */
  itemGroupBy?: ItemGroupBy;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TransferByBranchFilters extends InventoryReportFilters {
  sourceBranchId?: string;
}

// === Response row types — must mirror backend services ===

export interface StockPeriodRow {
  itemId: string;
  sku: string;
  itemName: string;
  parentSku?: string | null;
  parentName?: string | null;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
  branchId: string | null;
  branchCode: string | null;
  branchName: string | null;
  openingQty: number;
  openingValue: number;
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  closingQty: number;
  closingValue: number;
  transferOutQty: number;
  transferOutValue: number;
  incomingQty: number;
  incomingValue: number;
  // Breakdown — populated only by stockQuantityDetails
  inQtyPurchase?: number;
  inQtyTransferIn?: number;
  inQtyReturn?: number;
  inQtyAdjustIn?: number;
  outQtySale?: number;
  outQtyTransferOut?: number;
  outQtyAdjustOut?: number;
}

export interface StockByBranchPerBranchValue {
  branchId: string;
  branchName: string;
  qty: number;
  value: number;
}

export interface StockByBranchRow {
  itemId: string;
  sku: string;
  name: string;
  parentSku?: string | null;
  parentName?: string | null;
  unit: string;
  categoryName: string | null;
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  totalQty: number;
  totalValue: number;
  perBranch: Record<string, StockByBranchPerBranchValue>;
}

export interface TransferSummaryRow {
  branchId: string;
  branchCode: string | null;
  branchName: string;
  qtyIn: number;
  valueIn: number;
  qtyOut: number;
  valueOut: number;
  qtyReceived: number;
  valueReceived: number;
  qtyDifference: number;
  valueDifference: number;
}

export interface TransferByBranchRow {
  itemId: string;
  sku: string;
  itemName: string;
  parentSku?: string | null;
  parentName?: string | null;
  unit: string;
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  destinationBranchId: string;
  destinationBranchName: string;
  outQty: number;
  outAvgPrice: number;
  outValue: number;
  inQty: number;
  inAvgPrice: number;
  inValue: number;
}

export interface DocumentDetailRow {
  docKind: "GOODS_RECEIPT" | "GOODS_ISSUE" | "STOCK_TRANSFER";
  /** ISO timestamp */
  postedAt: string;
  documentNumber: string;
  referenceNumber: string | null;
  sku: string;
  itemName: string;
  parentSku?: string | null;
  parentName?: string | null;
  unit: string;
  categoryName: string | null;
  brand?: string | null;
  color?: string | null;
  size?: string | null;
  branchId: string | null;
  branchName: string | null;
  receiverBranchId: string | null;
  receiverBranchName: string | null;
  locationCode: string | null;
  locationName: string | null;
  inQty: number;
  inUnitPrice: number;
  inValue: number;
  outQty: number;
  outUnitPrice: number;
  outValue: number;
  customerName: string | null;
  notes: string | null;
}

/**
 * Row for "Hàng hóa xuất kho tạm" (temp-warehouse out goods).
 * Mirrors backend `TempWarehouseIssueRow`. `saleQty`/`invoice` are always
 * 0/"" — there is no temp-warehouse ↔ POS invoice link in the backend yet.
 */
export interface TempWarehouseIssueRow {
  sku: string;
  name: string;
  unit: string;
  location: string | null;
  /** dd/MM/yyyy (Asia/Ho_Chi_Minh) */
  date: string;
  /** HH:mm:ss (Asia/Ho_Chi_Minh) */
  time: string;
  staff: string;
  outQty: number;
  returnQty: number;
  saleQty: number;
  remainingQty: number;
  status: string;
  invoice: string;
}

// === Response envelope ===

export interface InventoryReportResponse<TRow> extends InventoryReportPagination {
  data: TRow[];
  period: ResolvedPeriod;
}

export interface StockByBranchBranchHeader {
  id: string;
  code: string | null;
  name: string;
}

export interface StockByBranchResponse
  extends InventoryReportResponse<StockByBranchRow> {
  branches: StockByBranchBranchHeader[];
}

// === Helpers ===

type QueryRecord = Record<string, string | string[] | number | undefined>;

function buildBaseQuery(filters: InventoryReportFilters): QueryRecord {
  const out: QueryRecord = {};
  if (filters.preset) out.preset = filters.preset;
  if (filters.startDate) out.startDate = filters.startDate;
  if (filters.endDate) out.endDate = filters.endDate;
  if (filters.branchIds && filters.branchIds.length > 0)
    // backend DTO splits comma-delimited strings into arrays
    out.branchIds = filters.branchIds.join(",");
  if (filters.locationIds && filters.locationIds.length > 0)
    out.locationIds = filters.locationIds.join(",");
  if (filters.categoryIds && filters.categoryIds.length > 0)
    out.categoryIds = filters.categoryIds.join(",");
  if (filters.itemGroupBy) out.itemGroupBy = filters.itemGroupBy;
  if (filters.search) out.search = filters.search;
  if (filters.page) out.page = filters.page;
  if (filters.pageSize) out.pageSize = filters.pageSize;
  return out;
}

function buildTransferByBranchQuery(
  filters: TransferByBranchFilters,
): QueryRecord {
  const out = buildBaseQuery(filters);
  if (filters.sourceBranchId) out.sourceBranchId = filters.sourceBranchId;
  return out;
}

// === API wrapper functions ===
// NOTE: The OpenAPI generator emits `content?: never` for these responses
// (Nest doesn't have explicit @ApiResponse types yet), so we pass an explicit
// generic to `erpApi.GET<T>` and the typed-client returns `{ data: T }`.

export async function listStockSummary(filters: InventoryReportFilters) {
  return requireErpData(
    await erpApi.GET<InventoryReportResponse<StockPeriodRow>>(
      "/reports/inventory/stock-summary",
      { params: { query: buildBaseQuery(filters) } },
    ),
  );
}

export async function listStockDocumentDetails(
  filters: InventoryReportFilters,
) {
  return requireErpData(
    await erpApi.GET<InventoryReportResponse<DocumentDetailRow>>(
      "/reports/inventory/stock-document-details",
      { params: { query: buildBaseQuery(filters) } },
    ),
  );
}

export async function listTemporaryWarehouseOutGoods(
  filters: InventoryReportFilters,
) {
  return requireErpData(
    await erpApi.GET<InventoryReportResponse<TempWarehouseIssueRow>>(
      "/reports/inventory/temporary-warehouse-out-goods",
      { params: { query: buildBaseQuery(filters) } },
    ),
  );
}

export async function listStockQuantityDetails(
  filters: InventoryReportFilters,
) {
  return requireErpData(
    await erpApi.GET<InventoryReportResponse<StockPeriodRow>>(
      "/reports/inventory/stock-quantity-details",
      { params: { query: buildBaseQuery(filters) } },
    ),
  );
}

export async function listStockSummaryByBranch(
  filters: InventoryReportFilters,
) {
  return requireErpData(
    await erpApi.GET<InventoryReportResponse<StockPeriodRow>>(
      "/reports/inventory/stock-summary-by-branch",
      { params: { query: buildBaseQuery(filters) } },
    ),
  );
}

export async function listStockByBranch(filters: InventoryReportFilters) {
  return requireErpData(
    await erpApi.GET<StockByBranchResponse>(
      "/reports/inventory/stock-by-branch",
      { params: { query: buildBaseQuery(filters) } },
    ),
  );
}

export async function listTransferSummary(filters: InventoryReportFilters) {
  return requireErpData(
    await erpApi.GET<InventoryReportResponse<TransferSummaryRow>>(
      "/reports/inventory/transfer-summary",
      { params: { query: buildBaseQuery(filters) } },
    ),
  );
}

export async function listTransferByBranch(filters: TransferByBranchFilters) {
  return requireErpData(
    await erpApi.GET<InventoryReportResponse<TransferByBranchRow>>(
      "/reports/inventory/transfer-by-branch",
      { params: { query: buildTransferByBranchQuery(filters) } },
    ),
  );
}
