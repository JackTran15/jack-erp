import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InvoiceReportColumnsResult } from '@erp/shared-interfaces';
import { ReportRegistry } from '../report-definition';
import { GetInvoiceReportColumnsQuery } from './get-invoice-report-columns.query';

@QueryHandler(GetInvoiceReportColumnsQuery)
export class GetInvoiceReportColumnsHandler
  implements IQueryHandler<GetInvoiceReportColumnsQuery>
{
  constructor(private readonly registry: ReportRegistry) {}

  async execute({
    reportType,
    actor,
    statBy,
    store,
    branchId,
  }: GetInvoiceReportColumnsQuery): Promise<InvoiceReportColumnsResult> {
    const def = this.registry.get(reportType);
    if (!def) {
      throw new BadRequestException(`Unknown report type: ${reportType}`);
    }
    return {
      summaryLabel: 'Tổng',
      columns: await def.buildColumns(
        actor,
        statBy || store || branchId ? { statBy, store, branchId } : undefined,
      ),
    };
  }
}
