import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import { toTemplateView } from '../../report-core/report-template.view';
import { GetDebtReportTemplateQuery } from './get-debt-report-template.query';

@QueryHandler(GetDebtReportTemplateQuery)
export class GetDebtReportTemplateHandler
  implements IQueryHandler<GetDebtReportTemplateQuery>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
  ) {}

  async execute({
    id,
    actor,
  }: GetDebtReportTemplateQuery): Promise<InvoiceReportTemplateView> {
    const entity = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!entity) {
      throw new NotFoundException('Debt report template not found');
    }
    return toTemplateView(entity);
  }
}
