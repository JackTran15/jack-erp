import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { ReportTemplateEntity } from '../../reporting/report-core/report-template.entity';
import { toTemplateView } from '../../reporting/report-core/report-template.view';
import { InventoryReportRegistry } from '../report/inventory-report-definition';
import { GetInventoryReportTemplateQuery } from './get-inventory-report-template.query';

@QueryHandler(GetInventoryReportTemplateQuery)
export class GetInventoryReportTemplateHandler
  implements IQueryHandler<GetInventoryReportTemplateQuery>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
    private readonly registry: InventoryReportRegistry,
  ) {}

  async execute({
    id,
    actor,
  }: GetInventoryReportTemplateQuery): Promise<InvoiceReportTemplateView> {
    const entity = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!entity || !this.registry.get(entity.reportType)) {
      throw new NotFoundException('Inventory report template not found');
    }
    return toTemplateView(entity);
  }
}
