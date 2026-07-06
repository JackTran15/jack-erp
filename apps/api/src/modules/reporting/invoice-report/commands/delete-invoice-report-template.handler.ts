import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import { DeleteInvoiceReportTemplateCommand } from './delete-invoice-report-template.command';

@CommandHandler(DeleteInvoiceReportTemplateCommand)
export class DeleteInvoiceReportTemplateHandler
  implements ICommandHandler<DeleteInvoiceReportTemplateCommand>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
  ) {}

  async execute({
    id,
    actor,
  }: DeleteInvoiceReportTemplateCommand): Promise<{ id: string }> {
    const entity = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!entity) {
      throw new NotFoundException('Invoice report template not found');
    }
    await this.repo.softRemove(entity);
    return { id };
  }
}
