import {
  listStockSummary,
  type InventoryReportFilters,
  type InventoryReportPreset,
  type StockPeriodRow,
} from "../../../../api/inventory-reports";
import { REPORT_FILTERS_LINE } from "../../../../constants/reports/report-filters.constant";
import type { ReportFilterValues } from "../../../../store/page-stores/report/report.interface";
import type { ReportRow } from "./invoice-report.api";
import type { ReportDataFetcher, ReportDataResult } from "./report-data-source";

// Cột số cần cộng tổng (footer "Tổng").
const NUMERIC_COLUMNS = [
  "openingQty",
  "openingValue",
  "inQty",
  "inValue",
  "outQty",
  "outValue",
  "endingQty",
  "endingValue",
  "transferOutQty",
  "transferOutValue",
  "incomingQty",
  "incomingValue",
] as const;

// Filter dòng (report store) → query của endpoint kho.
function buildInventoryFilters(
  filters: Partial<ReportFilterValues>,
  page: number,
  limit: number,
): InventoryReportFilters {
  const out: InventoryReportFilters = { page, pageSize: limit };

  const store = filters[REPORT_FILTERS_LINE.STORE];
  if (store && store.scope === "group" && store.storeIds.length > 0) {
    out.branchIds = store.storeIds;
  }

  const range = filters[REPORT_FILTERS_LINE.RANGE_DATE];
  if (range?.fromDate || range?.toDate) {
    if (range.fromDate) out.startDate = range.fromDate;
    if (range.toDate) out.endDate = range.toDate;
  } else {
    const preset = filters[REPORT_FILTERS_LINE.REPORT_PERIOD];
    if (preset) out.preset = preset as InventoryReportPreset;
  }
  return out;
}

// StockPeriodRow (BE) → row keyed theo column id của registry stock-summary.
function mapStockRow(row: StockPeriodRow): ReportRow {
  const endingQty = row.openingQty + row.inQty - row.outQty;
  const endingValue = row.openingValue + row.inValue - row.outValue;
  return {
    name: row.itemName,
    parentSku: row.parentSku ?? "",
    parentName: row.parentName ?? "",
    color: "",
    size: "",
    unit: row.unit,
    group: row.categoryName ?? "",
    brand: "",
    sku: row.sku,
    positionCode: row.locationCode ?? "",
    positionName: row.locationName ?? "",
    openingQty: row.openingQty,
    openingValue: row.openingValue,
    inQty: row.inQty,
    inValue: row.inValue,
    outQty: row.outQty,
    outValue: row.outValue,
    endingQty,
    endingValue,
    transferOutQty: 0,
    transferOutValue: 0,
    incomingQty: 0,
    incomingValue: 0,
    supplier: "",
  };
}

function sumTotals(rows: ReportRow[]): ReportRow {
  const totals: ReportRow = {};
  for (const key of NUMERIC_COLUMNS) {
    let sum = 0;
    for (const row of rows) sum += (row[key] as number) ?? 0;
    totals[key] = sum;
  }
  return totals;
}

// "Tổng hợp nhập xuất tồn kho" — data từ backend kho thật (/reports/inventory/stock-summary).
export const fetchStockSummary: ReportDataFetcher = async (
  args,
): Promise<ReportDataResult> => {
  const res = await listStockSummary(
    buildInventoryFilters(args.filters, args.page, args.limit),
  );
  const rows = (res.data ?? []).map(mapStockRow);
  return { rows, totals: sumTotals(rows), total: res.total ?? rows.length };
};
