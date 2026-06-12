import { ColumnFilter, InvoiceReportFilterPayload } from './search';

export interface InvoiceReportTemplateView {
  id: string;
  /** The report type this template belongs to. */
  reportType: string;
  name: string;
  description?: string | null;
  columns: string[];
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
  columns: string[];
  filters?: InvoiceReportFilterPayload;
  columnFilters?: ColumnFilter[];
  sortOrder?: number;
}
