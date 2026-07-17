import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InvoiceReportColumnsResult, PROFIT_REPORT_KEYS } from '@erp/shared-interfaces';
import { ReportRegistry } from '../report-definition';
import { GetProfitReportColumnsQuery } from './get-profit-report-columns.query';

@QueryHandler(GetProfitReportColumnsQuery)
export class GetProfitReportColumnsHandler
  implements IQueryHandler<GetProfitReportColumnsQuery>
{
  constructor(private readonly registry: ReportRegistry) {}

  async execute({
    reportType,
    actor,
    statBy,
  }: GetProfitReportColumnsQuery): Promise<InvoiceReportColumnsResult> {
    const def = this.registry.get(reportType);
    if (!def) {
      throw new BadRequestException(`Unknown report type: ${reportType}`);
    }
    return {
      // business-results has no Tổng footer — the "IV. Lợi nhuận" row is
      // already the total (xem TKT-PRF-04/TKT-PRF-10). Empty string (not
      // undefined — InvoiceReportColumnsResult.summaryLabel is required)
      // reads as falsy on the FE, which skips rendering <tfoot> entirely.
      summaryLabel:
        reportType === PROFIT_REPORT_KEYS.BUSINESS_RESULTS ? '' : 'Tổng',
      columns: await def.buildColumns(actor, statBy ? { statBy } : undefined),
    };
  }
}
