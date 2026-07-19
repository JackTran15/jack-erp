import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InvoiceReportColumnsResult } from '@erp/shared-interfaces';
import { ReportRegistry } from '../report-definition';
import { GetDebtReportColumnsQuery } from './get-debt-report-columns.query';

@QueryHandler(GetDebtReportColumnsQuery)
export class GetDebtReportColumnsHandler
  implements IQueryHandler<GetDebtReportColumnsQuery>
{
  constructor(private readonly registry: ReportRegistry) {}

  async execute({
    reportType,
    actor,
    groupBy,
  }: GetDebtReportColumnsQuery): Promise<InvoiceReportColumnsResult> {
    const def = this.registry.get(reportType);
    if (!def) {
      throw new BadRequestException(`Unknown report type: ${reportType}`);
    }
    return {
      summaryLabel: 'Tổng',
      columns: await def.buildColumns(actor, groupBy ? { groupBy } : undefined),
    };
  }
}
