import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import { DeleteProfitReportTemplateCommand } from './delete-profit-report-template.command';

@CommandHandler(DeleteProfitReportTemplateCommand)
export class DeleteProfitReportTemplateHandler
  implements ICommandHandler<DeleteProfitReportTemplateCommand>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
  ) {}

  async execute({
    id,
    actor,
  }: DeleteProfitReportTemplateCommand): Promise<{ id: string }> {
    const entity = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!entity) {
      throw new NotFoundException('Profit report template not found');
    }
    await this.repo.softRemove(entity);
    return { id };
  }
}
