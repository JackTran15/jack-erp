import {
  ReportColumnDataType,
  type ColumnFilter,
  type InvoiceReportColumnsResult,
  type InvoiceReportFilterPayload,
  type InvoiceReportResult,
  type InvoiceReportSearchPayload,
  type ReportCell,
  type ReportCellValue,
  type ReportColumnHeader,
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

// Một dòng data từ API: object keyed theo col (cell tự mô tả col/type/value).
export type ReportRow = Record<string, ReportCellValue>;

// ===== API calls =====

export async function fetchReportColumns(
  reportType: string,
): Promise<ReportColumnHeader[]> {
  const res = requireErpData(
    await erpApi.GET<InvoiceReportColumnsResult>("/reports/invoices/columns", {
      params: { query: { reportType } },
    }),
  );
  return res.headers;
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

// headers (API) → ReportTableConfig (giữ band/group, type, công thức desc).
export function mapHeadersToTableConfig(
  headers: ReportColumnHeader[],
): ReportTableConfig {
  return {
    summaryLabel: "Tổng",
    columns: headers.map((h, index) => ({
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
        link: h.col === "invoiceCode",
      },
    })),
  };
}

function cellsToRow(cells: ReportCell[]): ReportRow {
  const row: ReportRow = {};
  for (const cell of cells) row[cell.col] = cell.value;
  return row;
}

export function mapDataRows(dataRaw: ReportCell[][]): ReportRow[] {
  return dataRaw.map(cellsToRow);
}

export function mapTotals(totals: ReportCell[] | null): ReportRow {
  return totals ? cellsToRow(totals) : {};
}

// ===== Mappers: store filter → backend payload =====

export function buildSearchFilters(
  filters: Partial<ReportFilterValues>,
): InvoiceReportFilterPayload {
  const range = filters[REPORT_FILTERS_LINE.RANGE_DATE];
  const status = filters[REPORT_FILTERS_LINE.INVOICE_STATUS];
  const cashier = filters[REPORT_FILTERS_LINE.CASHIER];
  const salesperson = filters[REPORT_FILTERS_LINE.SALESPERSON];
  const customer = filters[REPORT_FILTERS_LINE.CUSTOMER];

  const payload: InvoiceReportFilterPayload = {
    issuedAt: {
      from: range?.fromDate || undefined,
      to: range?.toDate || undefined,
    },
  };
  // status BE là single → lấy phần tử đầu (FE đang multi-select).
  if (status && status.length > 0) payload.status = { value: status[0] };
  if (cashier && cashier !== "all") payload.cashierId = cashier;
  if (salesperson && salesperson !== "all") payload.salespersonId = salesperson;
  if (customer && customer !== "all") payload.customerId = customer;
  return payload;
}

// Column filter (chip header) → backend columnFilters. BE chỉ eq/range nên chỉ map `equals`.
export function buildColumnFilters(
  columnFilters: Record<string, ReportColumnFilter>,
  numericCols: Set<string>,
): ColumnFilter[] {
  const out: ColumnFilter[] = [];
  for (const [col, filter] of Object.entries(columnFilters)) {
    const value = filter.value.trim();
    if (!value || filter.operator !== "equals") continue;
    out.push({ col, eq: numericCols.has(col) ? Number(value) : value });
  }
  return out;
}
