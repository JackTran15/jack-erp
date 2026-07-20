import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import { toTemplateView } from '../../report-core/report-template.view';
import { ListProfitReportTemplatesQuery } from './list-profit-report-templates.query';

@QueryHandler(ListProfitReportTemplatesQuery)
export class ListProfitReportTemplatesHandler
  implements IQueryHandler<ListProfitReportTemplatesQuery>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
  ) {}

  async execute({
    actor,
    reportType,
  }: ListProfitReportTemplatesQuery): Promise<InvoiceReportTemplateView[]> {
    const rows = await this.repo.find({
      where: {
        organizationId: actor.organizationId,
        ...(reportType ? { reportType } : {}),
      },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
    return rows.map(toTemplateView);
  }
}
