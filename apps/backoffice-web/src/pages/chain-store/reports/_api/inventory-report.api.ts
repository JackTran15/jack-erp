import {
  listStockByBranch,
  listStockDocumentDetails,
  listStockQuantityDetails,
  listStockSummary,
  listStockSummaryByBranch,
  listTransferByBranch,
  listTransferSummary,
  listTemporaryWarehouseOutGoods,
  type DocumentDetailRow,
  type InventoryReportFilters,
  type InventoryReportPreset,
  type StockByBranchRow,
  type StockPeriodRow,
  type TransferByBranchRow,
  type TransferSummaryRow,
} from "../../../../api/inventory-reports";
import { REPORT_FILTERS_LINE } from "../../../../constants/reports/report-filters.constant";
import type { ReportFilterValues } from "../../../../store/page-stores/report/report.interface";
import type { ReportRow } from "./invoice-report.api";
import type { ReportDataFetcher, ReportDataResult } from "./report-data-source";

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

  // Line "Cửa hàng" single-select (chuỗi cửa hàng) → lọc theo 1 chi nhánh.
  const singleStore = filters[REPORT_FILTERS_LINE.STORE_SINGLE];
  if (singleStore) out.branchIds = [singleStore];

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

// Cộng tổng các cột số → footer "Tổng".
function sumTotals(rows: ReportRow[], numericKeys: readonly string[]): ReportRow {
  const totals: ReportRow = {};
  for (const key of numericKeys) {
    let sum = 0;
    for (const row of rows) sum += (row[key] as number) ?? 0;
    totals[key] = sum;
  }
  return totals;
}

const DATE_FMT = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DOC_KIND_LABEL: Record<DocumentDetailRow["docKind"], string> = {
  GOODS_RECEIPT: "Phiếu nhập kho mua hàng",
  GOODS_ISSUE: "Phiếu xuất kho bán hàng",
  STOCK_TRANSFER: "Phiếu điều chuyển kho",
};

// ===== #1 Tổng hợp nhập xuất tồn kho =====

const STOCK_SUMMARY_NUMERIC = [
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

function mapStockRow(row: StockPeriodRow): ReportRow {
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
    endingQty: row.openingQty + row.inQty - row.outQty,
    endingValue: row.openingValue + row.inValue - row.outValue,
    transferOutQty: 0,
    transferOutValue: 0,
    incomingQty: 0,
    incomingValue: 0,
    supplier: "",
  };
}

export const fetchStockSummary: ReportDataFetcher = async (
  args,
): Promise<ReportDataResult> => {
  const res = await listStockSummary(
    buildInventoryFilters(args.filters, args.page, args.limit),
  );
  const rows = (res.data ?? []).map(mapStockRow);
  return { rows, totals: sumTotals(rows, STOCK_SUMMARY_NUMERIC), total: res.total ?? rows.length };
};

// ===== #2 Bảng kê chi tiết phiếu nhập xuất kho =====

const DOC_DETAILS_NUMERIC = ["inQty", "inValue", "outQty", "outValue"] as const;

function mapDocumentRow(row: DocumentDetailRow, index: number): ReportRow {
  const posted = new Date(row.postedAt);
  return {
    date: Number.isNaN(posted.valueOf()) ? "" : DATE_FMT.format(posted),
    documentType: DOC_KIND_LABEL[row.docKind] ?? row.docKind,
    warehouse: row.locationName ?? row.branchName ?? "",
    documentNumber: row.documentNumber,
    reference: row.referenceNumber ?? "",
    sku: row.sku,
    name: row.itemName,
    unit: row.unit,
    notes: row.notes ?? "",
    group: row.categoryName ?? "",
    parentSku: row.parentSku ?? "",
    parentName: row.parentName ?? "",
    color: "",
    size: "",
    inQty: row.inQty,
    inUnitPrice: row.inUnitPrice,
    inValue: row.inValue,
    inSalePrice: 0,
    outQty: row.outQty,
    outUnitPrice: row.outUnitPrice,
    outValue: row.outValue,
    outSalePrice: 0,
    customer: row.customerName ?? "",
    branchCode: "",
    branchName: row.branchName ?? "",
    receiverBranchCode: "",
    receiverBranchName: row.receiverBranchName ?? "",
    _key: `${row.documentNumber}-${row.sku}-${index}`,
  };
}

export const fetchStockDocumentDetails: ReportDataFetcher = async (args) => {
  const res = await listStockDocumentDetails(
    buildInventoryFilters(args.filters, args.page, args.limit),
  );
  const rows = (res.data ?? []).map(mapDocumentRow);
  return { rows, totals: sumTotals(rows, DOC_DETAILS_NUMERIC), total: res.total ?? rows.length };
};

// ===== #3 Chi tiết số lượng nhập xuất tồn kho =====

const QUANTITY_DETAILS_NUMERIC = [
  "openingQty",
  "inTotal",
  "inPurchase",
  "inTransfer",
  "inReturn",
  "inWh",
  "inAdjust",
  "inOther",
  "outTotal",
  "outSale",
  "outTransfer",
  "outPurchaseReturn",
  "outWh",
  "outAdjust",
  "outVoid",
  "outOther",
  "endingQty",
] as const;

function mapQuantityDetailRow(row: StockPeriodRow): ReportRow {
  return {
    sku: row.sku,
    name: row.itemName,
    parentSku: row.parentSku ?? "",
    parentName: row.parentName ?? "",
    color: "",
    size: "",
    unit: row.unit,
    group: row.categoryName ?? "",
    brand: "",
    openingQty: row.openingQty,
    inTotal: row.inQty,
    inPurchase: row.inQtyPurchase ?? 0,
    inTransfer: row.inQtyTransferIn ?? 0,
    inReturn: row.inQtyReturn ?? 0,
    inWh: 0,
    inAdjust: row.inQtyAdjustIn ?? 0,
    inOther: 0,
    outTotal: row.outQty,
    outSale: row.outQtySale ?? 0,
    outTransfer: row.outQtyTransferOut ?? 0,
    outPurchaseReturn: 0,
    outWh: 0,
    outAdjust: row.outQtyAdjustOut ?? 0,
    outVoid: 0,
    outOther: 0,
    endingQty: row.openingQty + row.inQty - row.outQty,
  };
}

export const fetchStockQuantityDetails: ReportDataFetcher = async (args) => {
  const res = await listStockQuantityDetails(
    buildInventoryFilters(args.filters, args.page, args.limit),
  );
  const rows = (res.data ?? []).map(mapQuantityDetailRow);
  return { rows, totals: sumTotals(rows, QUANTITY_DETAILS_NUMERIC), total: res.total ?? rows.length };
};

// ===== #4 Tổng hợp nhập xuất tồn kho theo cửa hàng =====

const SUMMARY_BY_BRANCH_NUMERIC = [
  "openingQty",
  "openingValue",
  "inQty",
  "inValue",
  "outQty",
  "outValue",
  "endingQty",
  "endingValue",
] as const;

function mapSummaryByBranchRow(row: StockPeriodRow): ReportRow {
  return {
    sku: row.sku,
    name: row.itemName,
    parentSku: row.parentSku ?? "",
    parentName: row.parentName ?? "",
    color: "",
    size: "",
    unit: row.unit,
    group: row.categoryName ?? "",
    brand: "",
    branchCode: row.branchCode ?? "",
    branch: row.branchName ?? "",
    openingQty: row.openingQty,
    openingValue: row.openingValue,
    inQty: row.inQty,
    inValue: row.inValue,
    outQty: row.outQty,
    outValue: row.outValue,
    endingQty: row.openingQty + row.inQty - row.outQty,
    endingValue: row.openingValue + row.inValue - row.outValue,
  };
}

export const fetchStockSummaryByBranch: ReportDataFetcher = async (args) => {
  const res = await listStockSummaryByBranch(
    buildInventoryFilters(args.filters, args.page, args.limit),
  );
  const rows = (res.data ?? []).map(mapSummaryByBranchRow);
  return { rows, totals: sumTotals(rows, SUMMARY_BY_BRANCH_NUMERIC), total: res.total ?? rows.length };
};

// ===== #5 Số lượng tồn kho theo cửa hàng =====
// NOTE: cột per-branch động (branches[]/perBranch) hoãn — chỉ map tổng tồn.

const STOCK_BY_BRANCH_NUMERIC = ["total"] as const;

function mapStockByBranchRow(row: StockByBranchRow): ReportRow {
  return {
    sku: row.sku,
    name: row.name,
    parentSku: row.parentSku ?? "",
    parentName: row.parentName ?? "",
    color: "",
    size: "",
    unit: row.unit,
    group: row.categoryName ?? "",
    brand: "",
    total: row.totalQty,
  };
}

export const fetchStockByBranch: ReportDataFetcher = async (args) => {
  const res = await listStockByBranch(
    buildInventoryFilters(args.filters, args.page, args.limit),
  );
  const rows = (res.data ?? []).map(mapStockByBranchRow);
  return { rows, totals: sumTotals(rows, STOCK_BY_BRANCH_NUMERIC), total: res.total ?? rows.length };
};

// ===== #6 Tổng hợp nhập xuất điều chuyển =====

const TRANSFER_SUMMARY_NUMERIC = [
  "inQty",
  "inValue",
  "outQty",
  "outValue",
  "receivedQty",
  "receivedValue",
  "diffQty",
  "diffValue",
  "inOutDiffQty",
  "inOutDiffValue",
] as const;

function mapTransferSummaryRow(row: TransferSummaryRow): ReportRow {
  return {
    branchCode: row.branchCode ?? "",
    branchName: row.branchName,
    inQty: row.qtyIn,
    inValue: row.valueIn,
    outQty: row.qtyOut,
    outValue: row.valueOut,
    receivedQty: row.qtyReceived,
    receivedValue: row.valueReceived,
    diffQty: row.qtyDifference,
    diffValue: row.valueDifference,
    inOutDiffQty: row.qtyDifference,
    inOutDiffValue: row.valueDifference,
  };
}

export const fetchTransferSummary: ReportDataFetcher = async (args) => {
  const res = await listTransferSummary(
    buildInventoryFilters(args.filters, args.page, args.limit),
  );
  const rows = (res.data ?? []).map(mapTransferSummaryRow);
  return { rows, totals: sumTotals(rows, TRANSFER_SUMMARY_NUMERIC), total: res.total ?? rows.length };
};

// ===== #7 Tổng hợp hàng hóa điều chuyển theo cửa hàng =====
// NOTE: sourceBranchId chưa có filter line → không gửi.

const TRANSFER_BY_BRANCH_NUMERIC = ["outQty", "outValue", "inQty", "inValue"] as const;

function mapTransferByBranchRow(row: TransferByBranchRow): ReportRow {
  return {
    sku: row.sku,
    name: row.itemName,
    parentSku: row.parentSku ?? "",
    parentName: row.parentName ?? "",
    color: "",
    size: "",
    unit: row.unit,
    group: "",
    brand: "",
    targetBranch: row.destinationBranchName,
    outQty: row.outQty,
    outAvgPrice: row.outAvgPrice,
    outValue: row.outValue,
    inQty: row.inQty,
    inAvgPrice: row.inAvgPrice,
    inValue: row.inValue,
  };
}

export const fetchTransferByBranch: ReportDataFetcher = async (args) => {
  const res = await listTransferByBranch(
    buildInventoryFilters(args.filters, args.page, args.limit),
  );
  const rows = (res.data ?? []).map(mapTransferByBranchRow);
  return { rows, totals: sumTotals(rows, TRANSFER_BY_BRANCH_NUMERIC), total: res.total ?? rows.length };
};

// ===== #8 Hàng hóa xuất kho tạm =====

const TEMPORARY_OUT_NUMERIC = [
  "outQty",
  "returnQty",
  "saleQty",
  "remainingQty",
] as const;

export const fetchTemporaryWarehouseOutGoods: ReportDataFetcher = async (
  args,
) => {
  const res = await listTemporaryWarehouseOutGoods(
    buildInventoryFilters(args.filters, args.page, args.limit),
  );
  const rows: ReportRow[] = (res.data ?? []).map((r) => ({ ...r }));
  return {
    rows,
    totals: sumTotals(rows, TEMPORARY_OUT_NUMERIC),
    total: res.total ?? rows.length,
  };
};
