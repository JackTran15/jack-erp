import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import { DeleteDebtReportTemplateCommand } from './delete-debt-report-template.command';

@CommandHandler(DeleteDebtReportTemplateCommand)
export class DeleteDebtReportTemplateHandler
  implements ICommandHandler<DeleteDebtReportTemplateCommand>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
  ) {}

  async execute({
    id,
    actor,
  }: DeleteDebtReportTemplateCommand): Promise<{ id: string }> {
    const entity = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!entity) {
      throw new NotFoundException('Debt report template not found');
    }
    await this.repo.softRemove(entity);
    return { id };
  }
}
