import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InvoiceReportColumnsResult } from '@erp/shared-interfaces';
import { ReportRegistry } from '../report-definition';
import { GetCashFundReportColumnsQuery } from './get-cash-fund-report-columns.query';

@QueryHandler(GetCashFundReportColumnsQuery)
export class GetCashFundReportColumnsHandler
  implements IQueryHandler<GetCashFundReportColumnsQuery>
{
  constructor(private readonly registry: ReportRegistry) {}

  async execute({
    reportType,
    actor,
  }: GetCashFundReportColumnsQuery): Promise<InvoiceReportColumnsResult> {
    const def = this.registry.get(reportType);
    if (!def) {
      throw new BadRequestException(`Unknown report type: ${reportType}`);
    }
    return { summaryLabel: 'Tổng', columns: await def.buildColumns(actor) };
  }
}
