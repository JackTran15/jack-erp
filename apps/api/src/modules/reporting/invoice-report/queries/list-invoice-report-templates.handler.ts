import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import { toTemplateView } from '../../report-core/report-template.view';
import { ListInvoiceReportTemplatesQuery } from './list-invoice-report-templates.query';

@QueryHandler(ListInvoiceReportTemplatesQuery)
export class ListInvoiceReportTemplatesHandler
  implements IQueryHandler<ListInvoiceReportTemplatesQuery>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
  ) {}

  async execute({
    actor,
    reportType,
  }: ListInvoiceReportTemplatesQuery): Promise<InvoiceReportTemplateView[]> {
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
