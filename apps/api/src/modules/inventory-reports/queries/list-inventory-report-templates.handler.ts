import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { ReportTemplateEntity } from '../../reporting/report-core/report-template.entity';
import { toTemplateView } from '../../reporting/report-core/report-template.view';
import {
  pickEffective,
  readScopeWhere,
  resolveTemplateScope,
} from '../../reporting/report-core/template-scope';
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
    scope,
  }: ListInventoryReportTemplatesQuery): Promise<InvoiceReportTemplateView[]> {
    const resolved = resolveTemplateScope(scope, actor);
    // `readScopeWhere` returns one element per scope tier and TypeORM ORs them,
    // so the report-type filter has to be spread into each one — hanging it off
    // the array would leave the second tier unfiltered.
    // Only inventory-domain templates — invoice templates live on their own routes.
    const rows = await this.repo.find({
      where: readScopeWhere(actor, resolved).map((where) => ({
        ...where,
        reportType: reportType ?? In(this.registry.list()),
      })),
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
    return pickEffective(
      rows.filter((r) => this.registry.get(r.reportType)),
      resolved,
    ).map(toTemplateView);
  }
}
