import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InvoiceReportResult } from '@erp/shared-interfaces';
import { ReportRegistry } from '../report-definition';
import { SearchInvoiceReportQuery } from './search-invoice-report.query';

@QueryHandler(SearchInvoiceReportQuery)
export class SearchInvoiceReportHandler
  implements IQueryHandler<SearchInvoiceReportQuery>
{
  constructor(private readonly registry: ReportRegistry) {}

  async execute({
    dto,
    actor,
  }: SearchInvoiceReportQuery): Promise<InvoiceReportResult> {
    const def = this.registry.get(dto.reportType);
    if (!def) {
      throw new BadRequestException(`Unknown report type: ${dto.reportType}`);
    }
    return def.buildData(dto, actor);
  }
}
