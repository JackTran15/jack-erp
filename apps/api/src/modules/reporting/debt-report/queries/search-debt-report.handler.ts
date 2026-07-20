import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InvoiceReportResult } from '@erp/shared-interfaces';
import { ReportRegistry } from '../report-definition';
import { SearchDebtReportQuery } from './search-debt-report.query';

@QueryHandler(SearchDebtReportQuery)
export class SearchDebtReportHandler
  implements IQueryHandler<SearchDebtReportQuery>
{
  constructor(private readonly registry: ReportRegistry) {}

  async execute({
    dto,
    actor,
  }: SearchDebtReportQuery): Promise<InvoiceReportResult> {
    const def = this.registry.get(dto.reportType);
    if (!def) {
      throw new BadRequestException(`Unknown report type: ${dto.reportType}`);
    }
    return def.buildData(dto, actor);
  }
}
