import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTemplateEntity } from '../invoice-report-template.entity';
import { DeleteInvoiceReportTemplateCommand } from './delete-invoice-report-template.command';

@CommandHandler(DeleteInvoiceReportTemplateCommand)
export class DeleteInvoiceReportTemplateHandler
  implements ICommandHandler<DeleteInvoiceReportTemplateCommand>
{
  constructor(
    @InjectRepository(InvoiceReportTemplateEntity)
    private readonly repo: Repository<InvoiceReportTemplateEntity>,
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
