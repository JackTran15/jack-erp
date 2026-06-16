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

export interface InvoiceReportTemplateView {
  id: string;
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
