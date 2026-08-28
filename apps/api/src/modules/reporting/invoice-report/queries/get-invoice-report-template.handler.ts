import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import { toTemplateView } from '../../report-core/report-template.view';
import {
  readScopeWhere,
  resolveTemplateScope,
} from '../../report-core/template-scope';
import { GetInvoiceReportTemplateQuery } from './get-invoice-report-template.query';

@QueryHandler(GetInvoiceReportTemplateQuery)
export class GetInvoiceReportTemplateHandler
  implements IQueryHandler<GetInvoiceReportTemplateQuery>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
  ) {}

  async execute({
    id,
    actor,
    scope,
  }: GetInvoiceReportTemplateQuery): Promise<InvoiceReportTemplateView> {
    const resolved = resolveTemplateScope(scope, actor);
    // Another branch's row falls outside the predicate, so it 404s without a
    // separate ownership check.
    const entity = await this.repo.findOne({
      where: readScopeWhere(actor, resolved).map((where) => ({ ...where, id })),
    });
    if (!entity) {
      throw new NotFoundException('Invoice report template not found');
    }
    return toTemplateView(entity);
  }
}
