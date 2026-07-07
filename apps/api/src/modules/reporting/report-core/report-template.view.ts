import {
  ColumnFilter,
  InvoiceReportFilterPayload,
  InvoiceReportTemplateView,
} from '@erp/shared-interfaces';
import { ReportTemplateEntity } from './report-template.entity';

/** Map a template entity to its API view, splitting the persisted `filters` blob into scope filters + columnFilters. */
export function toTemplateView(
  e: ReportTemplateEntity,
): InvoiceReportTemplateView {
  const blob = (e.filters ?? {}) as Record<string, unknown>;
  const { columnFilters, ...scope } = blob;
  return {
    id: e.id,
    reportType: e.reportType,
    name: e.name,
    description: e.description ?? null,
    columns: e.columns ?? [],
    filters: scope as unknown as InvoiceReportFilterPayload,
    columnFilters: (columnFilters as ColumnFilter[] | undefined) ?? [],
    sortOrder: e.sortOrder,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}
