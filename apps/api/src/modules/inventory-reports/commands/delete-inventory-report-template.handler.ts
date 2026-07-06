import { NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportTemplateEntity } from '../../reporting/report-core/report-template.entity';
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
  }: DeleteInventoryReportTemplateCommand): Promise<{ id: string }> {
    const entity = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!entity || !this.registry.get(entity.reportType)) {
      throw new NotFoundException('Inventory report template not found');
    }
    await this.repo.softRemove(entity);
    return { id };
  }
}
