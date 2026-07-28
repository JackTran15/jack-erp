import { REPORT_TYPE_LABELS_VI } from '@erp/shared-interfaces';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  dateRangeSubtitle,
  PreparedExport,
  ReportExportService,
} from '../../report-core/report-export.service';
import { ReportRegistry } from '../report-definition';
import { GetInvoiceReportDocumentQuery } from './get-invoice-report-document.query';

/** Document title of a report key, for the header and the download filename. */
export function invoiceReportLabel(reportType: string): string {
  return (REPORT_TYPE_LABELS_VI as Record<string, string>)[reportType] ?? reportType;
}

@QueryHandler(GetInvoiceReportDocumentQuery)
export class GetInvoiceReportDocumentHandler
  implements IQueryHandler<GetInvoiceReportDocumentQuery>
{
  constructor(
    private readonly registry: ReportRegistry,
    private readonly exportService: ReportExportService,
  ) {}

  execute({
    dto,
    actor,
  }: GetInvoiceReportDocumentQuery): Promise<PreparedExport> {
    return this.exportService.prepareExport(this.registry, dto, actor, {
      title: invoiceReportLabel(dto.reportType).toUpperCase(),
      subtitleLines: dateRangeSubtitle(dto.filters?.issuedAt),
    });
  }
}
