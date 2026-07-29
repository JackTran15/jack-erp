import type {
  ColumnFilter,
  PosDailySummaryDetailCategory,
  ReportDateRangeFilter,
} from "@erp/shared-interfaces";

/** Request body for `POST /reports/pos/daily-summary` (tab Tổng hợp). */
export interface PosDailySummaryBody {
  issuedAt: ReportDateRangeFilter;
  branchId?: string;
  cashierId?: string;
  salespersonId?: string;
  invoiceStatus?: string[];
}

/**
 * Request body for `POST /reports/pos/daily-summary/export` — same filters as
 * {@link PosDailySummaryBody} plus the FE-only "Bàn giao tiền" handover
 * snapshot and resolved Thu ngân/NVBH labels, which the backend has no other
 * source for (see the API-side PosDailySummaryExportDto for why).
 */
export interface PosDailySummaryExportBody extends PosDailySummaryBody {
  cashierLabel?: string;
  nvbhLabel?: string;
  openingAmount?: number;
  handoverAmount?: number;
  receivedByLabel?: string;
  note?: string;
}

/** Request body for `POST /reports/pos/daily-summary/detail` — "xem chi tiết" drill-down. */
export interface PosDailySummaryDetailBody extends PosDailySummaryBody {
  category: PosDailySummaryDetailCategory;
  columnFilters?: ColumnFilter[];
  page?: number;
  limit?: number;
}
