import { PROFIT_REPORT_TYPE_LABELS_VI } from '@erp/shared-interfaces';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  dateRangeSubtitle,
  PreparedExport,
  ReportExportService,
} from '../../report-core/report-export.service';
import { ReportRegistry } from '../report-definition';
import { GetProfitReportDocumentQuery } from './get-profit-report-document.query';

/** Document title of a report key, for the header and the download filename. */
export function profitReportLabel(reportType: string): string {
  return (PROFIT_REPORT_TYPE_LABELS_VI as Record<string, string>)[reportType] ?? reportType;
}

@QueryHandler(GetProfitReportDocumentQuery)
export class GetProfitReportDocumentHandler
  implements IQueryHandler<GetProfitReportDocumentQuery>
{
  constructor(
    private readonly registry: ReportRegistry,
    private readonly exportService: ReportExportService,
  ) {}

  execute({
    dto,
    actor,
  }: GetProfitReportDocumentQuery): Promise<PreparedExport> {
    return this.exportService.prepareExport(this.registry, dto, actor, {
      title: profitReportLabel(dto.reportType).toUpperCase(),
      subtitleLines: dateRangeSubtitle(dto.filters?.issuedAt),
    });
  }
}
