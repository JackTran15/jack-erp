import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InvoiceReportColumnsResult } from '@erp/shared-interfaces';
import { InventoryReportRegistry } from '../report/inventory-report-definition';
import { GetInventoryReportColumnsQuery } from './get-inventory-report-columns.query';

@QueryHandler(GetInventoryReportColumnsQuery)
export class GetInventoryReportColumnsHandler
  implements IQueryHandler<GetInventoryReportColumnsQuery>
{
  constructor(private readonly registry: InventoryReportRegistry) {}

  async execute({
    reportType,
    actor,
  }: GetInventoryReportColumnsQuery): Promise<InvoiceReportColumnsResult> {
    const def = this.registry.get(reportType);
    if (!def) {
      throw new BadRequestException(`Unknown report type: ${reportType}`);
    }
    return { summaryLabel: 'Tổng', columns: await def.buildColumns(actor) };
  }
}
