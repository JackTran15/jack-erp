import { ColumnFilter, InvoiceReportFilterPayload } from './search';

/** One configured column inside a saved report template. */
export interface ReportTemplateColumn {
  /** Catalog column key (fixed registry key or dynamic `payment.method.<coaAccountId>`). */
  col: string;
  /** User-renamed label; null ⇒ fall back to the catalog `name`. */
  displayName: string | null;
  /** Whether the column is emitted/rendered. Hidden columns are still stored. */
  visible: boolean;
  /** Sticky/pinned column flag (presentation-only passthrough). */
  frozen: boolean;
  /** 0-based position; server-assigned from array order. */
  order: number;
}

/**
 * Which tier a saved template lives in. `chain` is the organization-wide default
 * every branch inherits until it saves its own; `branch` is one branch's override.
 */
export type TemplateScope = 'chain' | 'branch';

export interface InvoiceReportTemplateView {
  id: string;
  /** Tier this template lives in. */
  scope: TemplateScope;
  /** Owning branch; null for a chain-tier template. */
  branchId: string | null;
  /** The report type this template belongs to. */
  reportType: string;
  name: string;
  description?: string | null;
  columns: ReportTemplateColumn[];
  filters: InvoiceReportFilterPayload;
  columnFilters?: ColumnFilter[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceReportTemplatePayload {
  reportType: string;
  name: string;
  description?: string;
  columns: ReportTemplateColumn[];
  filters?: InvoiceReportFilterPayload;
  columnFilters?: ColumnFilter[];
  sortOrder?: number;
}
