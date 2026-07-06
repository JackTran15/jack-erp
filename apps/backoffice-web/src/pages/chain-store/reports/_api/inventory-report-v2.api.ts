import type {
  InventoryReportFilterPayload,
  InventoryReportPreset,
  InventoryReportResult,
  InventoryReportSearchPayload,
  InvoiceReportColumnsResult,
} from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../../../lib/erp-api";
import { REPORT_FILTERS_LINE } from "../../../../constants/reports/report-filters.constant";
import { STORE_TYPE } from "../../../../constants/store.constant";
import type { ReportFilterValues } from "../../../../store/page-stores/report/report.interface";

/**
 * Báo cáo có dòng "Cửa hàng" ở chain mode — khi SINGLE (không hiện dòng đó)
 * FE tự inject store = chi nhánh đang chọn ở header để số liệu scope đúng.
 */
const SINGLE_MODE_HEADER_STORE_REPORTS = new Set([
  "inventory-stock-summary",
  "inventory-document-detail",
  "inventory-stock-quantity-detail",
  "inventory-transfer-summary",
]);

export interface InventorySearchContext {
  branch: STORE_TYPE;
  activeBranchId?: string | null;
  backendKey: string;
}

// ===== API calls (contract 3-API của báo cáo kho — mirror invoice-report.api.ts) =====

export async function fetchInventoryReportColumns(
  reportType: string,
): Promise<InvoiceReportColumnsResult> {
  return requireErpData(
    await erpApi.GET<InvoiceReportColumnsResult>("/reports/inventory/columns", {
      params: { query: { reportType } },
    }),
  );
}

export async function fetchInventoryReportData(
  payload: InventoryReportSearchPayload,
): Promise<InventoryReportResult> {
  return requireErpData(
    await erpApi.POST<InventoryReportResult>("/reports/inventory/search", {
      body: payload as unknown as Record<string, unknown>,
    }),
  );
}

// ===== Mapper: store filter lines → backend payload =====

// Bỏ sentinel "chọn tất cả" của dropdown (giá trị rỗng / all / __all__).
const notAll = (v: string | undefined): v is string =>
  !!v && v !== "all" && v !== "__all__";

export function buildInventorySearchFilters(
  filters: Partial<ReportFilterValues>,
  ctx?: InventorySearchContext,
): InventoryReportFilterPayload {
  const payload: InventoryReportFilterPayload = {};

  const store = filters[REPORT_FILTERS_LINE.STORE];
  if (store?.scope) {
    payload.store = { scope: store.scope, storeIds: store.storeIds ?? [] };
  }
  // Line "Cửa hàng" single-select (chuỗi cửa hàng) → scope 1 chi nhánh.
  const singleStore = filters[REPORT_FILTERS_LINE.STORE_SINGLE];
  if (notAll(singleStore)) {
    payload.store = { scope: "group", storeIds: [singleStore] };
  }
  // SINGLE mode: dòng Cửa hàng bị ẩn — cửa hàng cố định = chi nhánh header.
  if (
    ctx &&
    ctx.branch === STORE_TYPE.SINGLE &&
    ctx.activeBranchId &&
    SINGLE_MODE_HEADER_STORE_REPORTS.has(ctx.backendKey)
  ) {
    payload.store = { scope: "group", storeIds: [ctx.activeBranchId] };
  }

  const range = filters[REPORT_FILTERS_LINE.RANGE_DATE];
  if (range?.fromDate || range?.toDate) {
    payload.period = {
      from: range.fromDate || undefined,
      to: range.toDate || undefined,
    };
  } else {
    const preset = filters[REPORT_FILTERS_LINE.REPORT_PERIOD];
    if (preset) payload.preset = preset as InventoryReportPreset;
  }

  const warehouse = filters[REPORT_FILTERS_LINE.WAREHOUSE];
  if (notAll(warehouse)) payload.warehouseIds = [warehouse];

  const categoryId = filters[REPORT_FILTERS_LINE.PRODUCT_GROUP];
  if (notAll(categoryId)) payload.categoryId = categoryId;

  const statBy = filters[REPORT_FILTERS_LINE.STATISTIC_BY];
  if (statBy) payload.statBy = statBy as InventoryReportFilterPayload["statBy"];

  const unit = filters[REPORT_FILTERS_LINE.UNIT];
  if (notAll(unit)) payload.unit = unit;

  const brand = filters[REPORT_FILTERS_LINE.BRAND];
  if (notAll(brand)) payload.brand = brand;

  // "Cửa hàng xuất": CHAIN = giá trị user chọn; SINGLE = chi nhánh header.
  const sourceStore = filters[REPORT_FILTERS_LINE.SOURCE_STORE];
  if (notAll(sourceStore)) {
    payload.sourceStoreId = sourceStore;
  } else if (
    ctx &&
    ctx.branch === STORE_TYPE.SINGLE &&
    ctx.activeBranchId &&
    ctx.backendKey === "inventory-transfer-by-store"
  ) {
    payload.sourceStoreId = ctx.activeBranchId;
  }

  const receivingStore = filters[REPORT_FILTERS_LINE.RECEIVING_STORE];
  if (notAll(receivingStore)) payload.receivingStoreIds = [receivingStore];

  return payload;
}
