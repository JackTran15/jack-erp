import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InvoiceReportResult } from '@erp/shared-interfaces';
import { ReportRegistry } from '../report-definition';
import { SearchProfitReportQuery } from './search-profit-report.query';

@QueryHandler(SearchProfitReportQuery)
export class SearchProfitReportHandler
  implements IQueryHandler<SearchProfitReportQuery>
{
  constructor(private readonly registry: ReportRegistry) {}

  async execute({
    dto,
    actor,
  }: SearchProfitReportQuery): Promise<InvoiceReportResult> {
    const def = this.registry.get(dto.reportType);
    if (!def) {
      throw new BadRequestException(`Unknown report type: ${dto.reportType}`);
    }
    return def.buildData(dto, actor);
  }
}
