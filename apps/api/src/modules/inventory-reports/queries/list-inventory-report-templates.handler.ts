import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { ReportTemplateEntity } from '../../reporting/report-core/report-template.entity';
import { toTemplateView } from '../../reporting/report-core/report-template.view';
import { InventoryReportRegistry } from '../report/inventory-report-definition';
import { ListInventoryReportTemplatesQuery } from './list-inventory-report-templates.query';

@QueryHandler(ListInventoryReportTemplatesQuery)
export class ListInventoryReportTemplatesHandler
  implements IQueryHandler<ListInventoryReportTemplatesQuery>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
    private readonly registry: InventoryReportRegistry,
  ) {}

  async execute({
    actor,
    reportType,
  }: ListInventoryReportTemplatesQuery): Promise<InvoiceReportTemplateView[]> {
    // Only inventory-domain templates — invoice templates live on their own routes.
    const rows = await this.repo.find({
      where: {
        organizationId: actor.organizationId,
        reportType: reportType ?? In(this.registry.list()),
      },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
    return rows
      .filter((r) => this.registry.get(r.reportType))
      .map(toTemplateView);
  }
}
