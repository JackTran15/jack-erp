import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InvoiceReportResult } from '@erp/shared-interfaces';
import { ReportRegistry } from '../report-definition';
import { SearchCashFundReportQuery } from './search-cash-fund-report.query';

@QueryHandler(SearchCashFundReportQuery)
export class SearchCashFundReportHandler
  implements IQueryHandler<SearchCashFundReportQuery>
{
  constructor(private readonly registry: ReportRegistry) {}

  async execute({
    dto,
    actor,
  }: SearchCashFundReportQuery): Promise<InvoiceReportResult> {
    const def = this.registry.get(dto.reportType);
    if (!def) {
      throw new BadRequestException(`Unknown report type: ${dto.reportType}`);
    }
    return def.buildData(dto, actor);
  }
}
