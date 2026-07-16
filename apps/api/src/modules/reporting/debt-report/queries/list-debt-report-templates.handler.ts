import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import { toTemplateView } from '../../report-core/report-template.view';
import { ListDebtReportTemplatesQuery } from './list-debt-report-templates.query';

@QueryHandler(ListDebtReportTemplatesQuery)
export class ListDebtReportTemplatesHandler
  implements IQueryHandler<ListDebtReportTemplatesQuery>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
  ) {}

  async execute({
    actor,
    reportType,
  }: ListDebtReportTemplatesQuery): Promise<InvoiceReportTemplateView[]> {
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
