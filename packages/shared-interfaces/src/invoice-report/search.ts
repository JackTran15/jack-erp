/** Inclusive date range (ISO date strings). */
export interface ReportDateRangeFilter {
  from?: string;
  to?: string;
}

export interface ReportEnumFilter {
  value: string | null;
}

/** Row grain for the revenue-by-item report ("Thống kê theo"). */
export enum ReportGroupBy {
  ITEM = 'item',
  PARENT = 'parent',
  GROUP = 'group',
}

/** Multi-store scope for chain consolidation. */
export interface ReportStoreScope {
  /** "all" = every branch the actor may read; "group" = the listed storeIds. */
  scope: 'all' | 'group';
  storeIds: string[];
}

/** Which invoice date the report period filters on. */
export type ReportStatDateType = 'invoice_date' | 'created_date';

/** Product kind filter (revenue-by-item). */
export type ReportProductType = 'product' | 'service' | 'combo';

/** Scope filters applied PRE-aggregate (at SQL level), like the existing search APIs. */
export interface InvoiceReportFilterPayload {
  /** Report period — required (daily aggregate over an unbounded range is meaningless). */
  issuedAt: ReportDateRangeFilter;
  /** Multi-store consolidation scope. Absent ⇒ actor's own branch. */
  store?: ReportStoreScope;
  /** Multi-select invoice status. Preferred over the single `status` below. */
  invoiceStatus?: string[];
  /** Which date column `issuedAt` filters on (default invoice_date). */
  statDateType?: ReportStatDateType;
  /** Legacy single-status filter; kept for back-compat (use invoiceStatus). */
  status?: ReportEnumFilter;
  type?: ReportEnumFilter;
  branchId?: string;
  /** Optional person filters (used by per-line reports; null/absent = all). */
  customerId?: string;
  /** Cashier — matches invoice.staffId. */
  cashierId?: string;
  /** Salesperson — matches invoice.salespersonId. */
  salespersonId?: string;
  /** revenue-by-item only — row grain (default item); ignored by other reports. */
  statBy?: ReportGroupBy;
  /** revenue-by-item only — filter by item category (Nhóm hàng hóa). */
  categoryId?: string;
  /** revenue-by-item only — filter by denormalized item brand (Thương hiệu). */
  brand?: string;
  /** revenue-by-item only — product kind filter. */
  productType?: ReportProductType;
  /** Add a brand-grain split (daily-summary / revenue-by-item). */
  statisticByBrand?: boolean;
  /** revenue-by-item only — split combo revenue across components. */
  allocateComboRevenue?: boolean;
}

/**
 * Per-column filter applied POST-aggregate on a row's value.
 * Numeric/date columns use eq/lt/lte/gt/gte/from/to; text columns use the
 * string operators. Present operators on one column are AND'd together.
 */
export interface ColumnFilter {
  col: string;
  // numeric / date operators
  eq?: number | string;
  lt?: number;
  lte?: number;
  gt?: number;
  gte?: number;
  from?: string;
  to?: string;
  // text operators
  contains?: string;
  equals?: string;
  startsWith?: string;
  endsWith?: string;
  notContains?: string;
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

/**
 * One row, keyed by column `field`. Cell types are read from the columns API
 * (the FE joins header.type → value for vi-VN formatting), so rows carry values only.
 */
export type ReportRow = Record<string, ReportCellValue>;

/** Response of the search API — only data, no headers (those come from the columns API). */
export interface InvoiceReportResult {
  rows: ReportRow[];
  /** Totals row (number columns summed); null when there are no rows. */
  totals: ReportRow | null;
  /** Total row count before pagination. */
  total: number;
}
