import { ReportColumnDataType } from './column';

/** Inclusive date range (ISO date strings). */
export interface ReportDateRangeFilter {
  from?: string;
  to?: string;
}

export interface ReportEnumFilter {
  value: string | null;
}

/** Scope filters applied PRE-aggregate (at SQL level), like the existing search APIs. */
export interface InvoiceReportFilterPayload {
  /** Report period — required (daily aggregate over an unbounded range is meaningless). */
  issuedAt: ReportDateRangeFilter;
  status?: ReportEnumFilter;
  type?: ReportEnumFilter;
  branchId?: string;
  /** Optional person filters (used by per-line reports; null/absent = all). */
  customerId?: string;
  /** Cashier — matches invoice.staffId. */
  cashierId?: string;
  /** Salesperson — matches invoice.salespersonId. */
  salespersonId?: string;
}

/** Per-column filter applied POST-aggregate on a day's value (the "=" / "≤" widget row). */
export interface ColumnFilter {
  col: string;
  eq?: number | string;
  lt?: number;
  lte?: number;
  gt?: number;
  gte?: number;
  from?: string;
  to?: string;
}

export interface InvoiceReportSearchPayload {
  /** Which backend report definition to run (see InvoiceReportTypeOption.key). */
  reportType: string;
  columns: string[];
  filters: InvoiceReportFilterPayload;
  columnFilters?: ColumnFilter[];
  branchId?: string;
  page?: number;
  limit?: number;
}

export type ReportCellValue = string | number | null;

/** A self-describing cell — carries its own col + type so the FE renders without re-joining headers. */
export interface ReportCell {
  col: string;
  type: ReportColumnDataType;
  value: ReportCellValue;
}

/** One row = one day. */
export type ReportDataRow = ReportCell[];

/** Response of the search API — only data, no headers (those come from the columns API). */
export interface InvoiceReportResult {
  dataRaw: ReportDataRow[];
  totals: ReportCell[] | null;
  total: number;
  page: number;
  limit: number;
}
