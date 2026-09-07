import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportTemplateEntity } from '../../reporting/report-core/report-template.entity';
import {
  resolveTemplateScope,
  writeScopeWhere,
} from '../../reporting/report-core/template-scope';
import { InventoryReportRegistry } from '../report/inventory-report-definition';
import { DeleteInventoryReportTemplateCommand } from './delete-inventory-report-template.command';

@CommandHandler(DeleteInventoryReportTemplateCommand)
export class DeleteInventoryReportTemplateHandler
  implements ICommandHandler<DeleteInventoryReportTemplateCommand>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
    private readonly registry: InventoryReportRegistry,
  ) {}

  async execute({
    id,
    actor,
    scope,
  }: DeleteInventoryReportTemplateCommand): Promise<{ id: string }> {
    const resolved = resolveTemplateScope(scope, actor);
    // `writeScopeWhere`, not `readScopeWhere`: reading crosses into the chain
    // tier so a branch can inherit from it, but deleting must not — otherwise
    // someone standing in one branch removes the default the whole organization
    // is reading.
    const entity = await this.repo.findOne({
      where: { ...writeScopeWhere(actor, resolved), id },
    });
    if (!entity || !this.registry.get(entity.reportType)) {
      throw new NotFoundException('Inventory report template not found');
    }
    await this.repo.softRemove(entity);
    return { id };
  }
}
