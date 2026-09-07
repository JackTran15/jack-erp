import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import {
  resolveTemplateScope,
  writeScopeWhere,
} from '../../report-core/template-scope';
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
    scope,
  }: DeleteDebtReportTemplateCommand): Promise<{ id: string }> {
    const resolved = resolveTemplateScope(scope, actor);
    // `writeScopeWhere`, not `readScopeWhere`: reading crosses into the chain
    // tier so a branch can inherit from it, deleting must not.
    const entity = await this.repo.findOne({
      where: { ...writeScopeWhere(actor, resolved), id },
    });
    if (!entity) {
      throw new NotFoundException('Debt report template not found');
    }
    await this.repo.softRemove(entity);
    return { id };
  }
}
