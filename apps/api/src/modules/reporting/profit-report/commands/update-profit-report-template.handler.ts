import { ConflictException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import { toTemplateView } from '../../report-core/report-template.view';
import {
  assertColumnsInCatalog,
  buildColumnCatalog,
  normalizeTemplateColumns,
} from '../profit-report-template.columns.util';
import { ReportRegistry } from '../report-definition';
import { UpdateProfitReportTemplateCommand } from './update-profit-report-template.command';

@CommandHandler(UpdateProfitReportTemplateCommand)
export class UpdateProfitReportTemplateHandler
  implements ICommandHandler<UpdateProfitReportTemplateCommand>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
    private readonly registry: ReportRegistry,
  ) {}

  async execute({
    id,
    dto,
    actor,
  }: UpdateProfitReportTemplateCommand): Promise<InvoiceReportTemplateView> {
    const entity = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!entity) {
      throw new NotFoundException('Profit report template not found');
    }

    if (dto.columns !== undefined || dto.columnFilters !== undefined) {
      const catalog = await buildColumnCatalog(this.registry, entity.reportType, actor);
      if (dto.columnFilters !== undefined) {
        assertColumnsInCatalog(dto.columnFilters.map((f) => f.col), catalog);
      }
      if (dto.columns !== undefined) {
        entity.columns = normalizeTemplateColumns(dto.columns, catalog);
      }
    }

    if (dto.name !== undefined && dto.name !== entity.name) {
      const dup = await this.repo.findOne({
        where: {
          organizationId: actor.organizationId,
          reportType: entity.reportType,
          name: dto.name,
          id: Not(entity.id),
        },
      });
      if (dup) {
        throw new ConflictException('Template name already exists');
      }
      entity.name = dto.name;
    }

    if (dto.description !== undefined) entity.description = dto.description;
    if (dto.sortOrder !== undefined) entity.sortOrder = dto.sortOrder;
    if (dto.filters !== undefined || dto.columnFilters !== undefined) {
      const existing = (entity.filters ?? {}) as Record<string, unknown>;
      const { columnFilters: existingColumnFilters, ...existingScope } = existing;
      const scope = dto.filters ?? existingScope;
      const columnFilters = dto.columnFilters ?? existingColumnFilters ?? [];
      entity.filters = { ...scope, columnFilters } as Record<string, unknown>;
    }

    const saved = await this.repo.save(entity);
    return toTemplateView(saved);
  }
}
