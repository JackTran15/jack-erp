import {
  ColumnFilter,
  InvoiceReportResult,
  ReportDateRangeFilter,
  ReportStoreScope,
} from '../invoice-report/search';

/** Period presets accepted by the inventory report date-range resolver. */
export type InventoryReportPreset =
  | 'today'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'custom';

/** Row grain of the item dimension ("Thống kê theo"). */
export type InventoryReportStatBy = 'item' | 'parent' | 'group';

/** Scope filters applied PRE-aggregate (engine level) for inventory reports. */
export interface InventoryReportFilterPayload {
  /** Custom period (inclusive ISO dates). Wins over `preset` when set. */
  period?: ReportDateRangeFilter;
  /** Period preset; used when `period` absent. Default: this_month. */
  preset?: InventoryReportPreset;
  /** Multi-store scope. Absent or scope="all" ⇒ org-wide (legacy parity). */
  store?: ReportStoreScope;
  /** Storage (warehouse) ids — resolved to their locations by the backend. */
  warehouseIds?: string[];
  /** Item category (Nhóm hàng hóa). */
  categoryId?: string;
  /** Item-dimension grain (default item). */
  statBy?: InventoryReportStatBy;
  /** Filter by unit name (Đơn vị tính) — applied in-memory on rows. */
  unit?: string;
  /** Filter by denormalized item brand — applied in-memory on rows. */
  brand?: string;
  /** transfer-by-store only — source branch; default = actor's branch. */
  sourceStoreId?: string;
  /** transfer-by-store only — destination branches (Cửa hàng nhận). */
  receivingStoreIds?: string[];
  /** Hide rows with all-zero measures (stock-period reports; default true). */
  hideZeroRows?: boolean;
  /** Free-text search on item code/name. */
  search?: string;
}

export interface InventoryReportSearchPayload {
  /** Which report definition to run (see INVENTORY_REPORT_KEYS). */
  reportType: string;
  columns: string[];
  filters: InventoryReportFilterPayload;
  columnFilters?: ColumnFilter[];
  page?: number;
  limit?: number;
}

/** Same rows/totals/total envelope as the invoice reports — FE renderer is shared. */
export type InventoryReportResult = InvoiceReportResult;
