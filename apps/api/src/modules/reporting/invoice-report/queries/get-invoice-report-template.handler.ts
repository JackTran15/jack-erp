import { NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { InvoiceReportTemplateEntity } from '../invoice-report-template.entity';
import { toTemplateView } from '../invoice-report-template.view';
import { GetInvoiceReportTemplateQuery } from './get-invoice-report-template.query';

@QueryHandler(GetInvoiceReportTemplateQuery)
export class GetInvoiceReportTemplateHandler
  implements IQueryHandler<GetInvoiceReportTemplateQuery>
{
  constructor(
    @InjectRepository(InvoiceReportTemplateEntity)
    private readonly repo: Repository<InvoiceReportTemplateEntity>,
  ) {}

  async execute({
    id,
    actor,
  }: GetInvoiceReportTemplateQuery): Promise<InvoiceReportTemplateView> {
    const entity = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!entity) {
      throw new NotFoundException('Invoice report template not found');
    }
    return toTemplateView(entity);
  }
}
