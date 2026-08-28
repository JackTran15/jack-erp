import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import { toTemplateView } from '../../report-core/report-template.view';
import {
  pickEffective,
  readScopeWhere,
  resolveTemplateScope,
} from '../../report-core/template-scope';
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
    scope,
  }: ListInvoiceReportTemplatesQuery): Promise<InvoiceReportTemplateView[]> {
    const resolved = resolveTemplateScope(scope, actor);
    // One element per scope tier, ORed by TypeORM — the report-type filter has
    // to go inside each one, not around the array.
    const rows = await this.repo.find({
      where: readScopeWhere(actor, resolved).map((where) => ({
        ...where,
        ...(reportType ? { reportType } : {}),
      })),
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
    return pickEffective(rows, resolved).map(toTemplateView);
  }
}
