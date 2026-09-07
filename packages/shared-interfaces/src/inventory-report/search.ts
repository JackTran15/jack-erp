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

/**
 * Which of the two backoffice views asked for the report.
 *
 * "Chuỗi cửa hàng" is otherwise a frontend-only mode, so the backend cannot
 * infer it: `X-Branch-Id` still names the last real branch, and a chain user who
 * picks "Tất cả" resolves to however many branches they happen to be assigned.
 * Reports whose SHAPE differs between the two views (today: stock-summary, which
 * drops to one row per item with no location) take this flag explicitly, so the
 * column catalog and the rows can never disagree about it.
 */
export const INVENTORY_REPORT_VIEW_MODES = ['single', 'chain'] as const;
export type InventoryReportViewMode =
  (typeof INVENTORY_REPORT_VIEW_MODES)[number];

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
  /** Which backoffice view is asking (default single). See the type's note. */
  viewMode?: InventoryReportViewMode;
  /** Filter by unit name (Đơn vị tính) — applied in-memory on rows. */
  unit?: string;
  /** Filter by denormalized item brand — applied in-memory on rows. */
  brand?: string;
  /** transfer-by-store only — source branch; default = actor's branch. */
  sourceStoreId?: string;
  /** transfer-by-store only — destination branches (Cửa hàng nhận). */
  receivingStoreIds?: string[];
  /**
   * Transfer document detail only — which leg of the pair is the primary
   * document. The branch pair is ordered (`sourceStoreId` ships,
   * `receivingStoreIds[0]` receives), so this decides whether rows are the
   * issues or the receipts, and whether only matched / only unmatched ones
   * are listed.
   */
  transferLeg?: TransferLeg;
  /** Hide rows with all-zero measures (stock-period reports; default true). */
  hideZeroRows?: boolean;
  /** Free-text search on item code/name. */
  search?: string;
}

/** Which leg of a transfer pair a document-detail query is reading. */
export const TRANSFER_LEGS = ['in', 'out', 'received', 'unmatched'] as const;
export type TransferLeg = (typeof TRANSFER_LEGS)[number];

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
