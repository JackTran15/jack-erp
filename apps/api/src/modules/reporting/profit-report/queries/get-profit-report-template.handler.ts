import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import { toTemplateView } from '../../report-core/report-template.view';
import { GetProfitReportTemplateQuery } from './get-profit-report-template.query';

@QueryHandler(GetProfitReportTemplateQuery)
export class GetProfitReportTemplateHandler
  implements IQueryHandler<GetProfitReportTemplateQuery>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
  ) {}

  async execute({
    id,
    actor,
  }: GetProfitReportTemplateQuery): Promise<InvoiceReportTemplateView> {
    const entity = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!entity) {
      throw new NotFoundException('Profit report template not found');
    }
    return toTemplateView(entity);
  }
}
