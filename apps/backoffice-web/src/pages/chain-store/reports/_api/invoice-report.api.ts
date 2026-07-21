import {
  ReportColumnDataType,
  type ColumnFilter,
  type InvoiceDetailView,
  type InvoiceReportColumnsResult,
  type InvoiceReportFilterPayload,
  type InvoiceReportResult,
  type InvoiceReportSearchPayload,
  type ReportCellValue,
  type ReportColumnHeader,
  type ReportGroupBy,
} from "@erp/shared-interfaces";
import { erpApi, requireErpData } from "../../../../lib/erp-api";
import { REPORT_FILTERS_LINE } from "../../../../constants/reports/report-filters.constant";
import type {
  ReportColumnDataType as FeColumnDataType,
  ReportTableConfig,
} from "../../../../constants/reports/report.interface";
import { DEFAULT_REPORT_COLUMN_WIDTH } from "../../../../lib/table";
import type {
  ReportColumnFilter,
  ReportFilterValues,
} from "../../../../store/page-stores/report/report.interface";

// Một dòng data từ API: object keyed theo field của cột.
export type ReportRow = Record<string, ReportCellValue>;

// ===== API calls =====

export async function fetchReportColumns(
  reportType: string,
  statBy?: "item" | "parent" | "group",
  store?: { scope: "all" | "group"; storeIds: string[] },
): Promise<InvoiceReportColumnsResult> {
  return requireErpData(
    await erpApi.GET<InvoiceReportColumnsResult>("/reports/invoices/columns", {
      params: {
        query: {
          reportType,
          statBy,
          storeScope: store?.scope,
          storeIds: store?.storeIds?.length ? store.storeIds.join(",") : undefined,
        },
      },
    }),
  );
}

export async function fetchReportData(
  payload: InvoiceReportSearchPayload,
): Promise<InvoiceReportResult> {
  return requireErpData(
    await erpApi.POST<InvoiceReportResult>("/reports/invoices/search", {
      body: payload as unknown as Record<string, unknown>,
    }),
  );
}

// Chi tiết một hóa đơn (line items + thanh toán) cho dialog drill-down, tra theo mã hóa đơn.
export async function fetchInvoiceDetail(
  code: string,
): Promise<InvoiceDetailView> {
  return requireErpData(
    await erpApi.GET<InvoiceDetailView>("/reports/invoices/detail", {
      params: { query: { code } },
    }),
  );
}

// ===== Mappers: API → shape mà table store/view đang dùng =====

function feDataType(type: ReportColumnDataType): FeColumnDataType {
  switch (type) {
    case ReportColumnDataType.CURRENCY:
    case ReportColumnDataType.NUMBER:
    case ReportColumnDataType.PERCENT:
      return "number";
    case ReportColumnDataType.DATE:
    case ReportColumnDataType.DATETIME:
      return "date";
    default:
      return "text";
  }
}

// columns API → ReportTableConfig. Backend giờ là nguồn sự thật cho filterKind/filterOptions/
// align/pinned/link; FE chỉ map thẳng, không tự suy ra nữa.
export function mapHeadersToTableConfig(
  result: InvoiceReportColumnsResult,
): ReportTableConfig {
  return {
    summaryLabel: result.summaryLabel ?? "Tổng",
    columns: result.columns.map((h: ReportColumnHeader, index) => ({
      column: h.col,
      order: index + 1,
      label: h.name ?? h.col,
      group: h.group?.name ?? null,
      visible: true,
      backendField: h.col,
      formulaDisplay: h.desc ?? undefined,
      tableConfig: {
        dataType: feDataType(h.type),
        width: DEFAULT_REPORT_COLUMN_WIDTH,
        align: h.align,
        pinned: h.pinned ?? undefined,
        link: h.link ?? false,
        filterKind: h.filterKind,
        filterOptions: h.filterOptions,
      },
    })),
  };
}

// ===== Mappers: store filter → backend payload =====

export function buildSearchFilters(
  filters: Partial<ReportFilterValues>,
): InvoiceReportFilterPayload {
  const range = filters[REPORT_FILTERS_LINE.RANGE_DATE];
  const store = filters[REPORT_FILTERS_LINE.STORE];
  const invoiceStatus = filters[REPORT_FILTERS_LINE.INVOICE_STATUS];
  const statDateType = filters[REPORT_FILTERS_LINE.STAT_DATE_TYPE];
  const cashier = filters[REPORT_FILTERS_LINE.CASHIER];
  const salesperson = filters[REPORT_FILTERS_LINE.SALESPERSON];
  const customer = filters[REPORT_FILTERS_LINE.CUSTOMER];
  const categoryId = filters[REPORT_FILTERS_LINE.PRODUCT_GROUP];
  const statBy = filters[REPORT_FILTERS_LINE.STATISTIC_BY];
  const brand = filters[REPORT_FILTERS_LINE.BRAND];
  const productType = filters[REPORT_FILTERS_LINE.PRODUCT_TYPE];
  const statisticByBrand = filters[REPORT_FILTERS_LINE.CHECKBOX_STATISTIC_BY_BRAND];
  const allocateComboRevenue =
    filters[REPORT_FILTERS_LINE.CHECKBOX_ALLOCATE_COMBO];

  const notAll = (v: string | undefined): v is string => !!v && v !== "all";

  const payload: InvoiceReportFilterPayload = {
    issuedAt: {
      from: range?.fromDate || undefined,
      to: range?.toDate || undefined,
    },
  };
  if (store?.scope) {
    payload.store = { scope: store.scope, storeIds: store.storeIds ?? [] };
  }
  if (invoiceStatus && invoiceStatus.length > 0) {
    payload.invoiceStatus = invoiceStatus;
  }
  if (statDateType) {
    payload.statDateType = statDateType as InvoiceReportFilterPayload["statDateType"];
  }
  if (notAll(cashier)) payload.cashierId = cashier;
  if (notAll(salesperson)) payload.salespersonId = salesperson;
  if (notAll(customer)) payload.customerId = customer;
  if (notAll(categoryId)) payload.categoryId = categoryId;
  if (statBy) payload.statBy = statBy as ReportGroupBy;
  if (notAll(brand)) payload.brand = brand;
  if (productType) {
    payload.productType = productType as InvoiceReportFilterPayload["productType"];
  }
  if (statisticByBrand) payload.statisticByBrand = true;
  if (allocateComboRevenue) payload.allocateComboRevenue = true;
  return payload;
}

const TEXT_OPERATORS = new Set([
  "contains",
  "equals",
  "startsWith",
  "endsWith",
  "notContains",
]);
const COMPARE_FIELD: Record<string, "eq" | "lt" | "lte" | "gt" | "gte"> = {
  "=": "eq",
  "<": "lt",
  "<=": "lte",
  ">": "gt",
  ">=": "gte",
};

// Column filter (chip header) → backend columnFilters. Text cột dùng contains/equals/startsWith/…;
// cột số dùng eq/lt/lte/gt/gte; cột ngày dùng eq + from/to (≤ → to, ≥ → from).
export function buildColumnFilters(
  columnFilters: Record<string, ReportColumnFilter>,
  numericCols: Set<string>,
): ColumnFilter[] {
  const out: ColumnFilter[] = [];
  for (const [col, filter] of Object.entries(columnFilters)) {
    const value = filter.value.trim();
    if (!value) continue;
    const op = filter.operator;
    if (TEXT_OPERATORS.has(op)) {
      out.push({ col, [op]: value } as ColumnFilter);
    } else if (numericCols.has(col)) {
      const field = COMPARE_FIELD[op] ?? "eq";
      out.push({ col, [field]: Number(value) } as ColumnFilter);
    } else if (op === "=") {
      out.push({ col, eq: value });
    } else if (op === "<" || op === "<=") {
      out.push({ col, to: value });
    } else if (op === ">" || op === ">=") {
      out.push({ col, from: value });
    }
  }
  return out;
}
