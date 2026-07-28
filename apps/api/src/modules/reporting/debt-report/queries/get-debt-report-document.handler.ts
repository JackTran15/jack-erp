import { DEBT_REPORT_TYPE_LABELS_VI } from '@erp/shared-interfaces';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  dateRangeSubtitle,
  PreparedExport,
  ReportExportService,
} from '../../report-core/report-export.service';
import { ReportRegistry } from '../report-definition';
import { GetDebtReportDocumentQuery } from './get-debt-report-document.query';

/** Document title of a report key, for the header and the download filename. */
export function debtReportLabel(reportType: string): string {
  return (DEBT_REPORT_TYPE_LABELS_VI as Record<string, string>)[reportType] ?? reportType;
}

@QueryHandler(GetDebtReportDocumentQuery)
export class GetDebtReportDocumentHandler
  implements IQueryHandler<GetDebtReportDocumentQuery>
{
  constructor(
    private readonly registry: ReportRegistry,
    private readonly exportService: ReportExportService,
  ) {}

  execute({
    dto,
    actor,
  }: GetDebtReportDocumentQuery): Promise<PreparedExport> {
    return this.exportService.prepareExport(this.registry, dto, actor, {
      title: debtReportLabel(dto.reportType).toUpperCase(),
      subtitleLines: dateRangeSubtitle(dto.filters?.period),
    });
  }
}
