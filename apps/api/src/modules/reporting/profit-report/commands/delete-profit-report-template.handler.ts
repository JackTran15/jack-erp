import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import {
  resolveTemplateScope,
  writeScopeWhere,
} from '../../report-core/template-scope';
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
    scope,
  }: DeleteProfitReportTemplateCommand): Promise<{ id: string }> {
    const resolved = resolveTemplateScope(scope, actor);
    // `writeScopeWhere`, not `readScopeWhere`: reading crosses into the chain
    // tier so a branch can inherit from it, deleting must not.
    const entity = await this.repo.findOne({
      where: { ...writeScopeWhere(actor, resolved), id },
    });
    if (!entity) {
      throw new NotFoundException('Profit report template not found');
    }
    await this.repo.softRemove(entity);
    return { id };
  }
}
