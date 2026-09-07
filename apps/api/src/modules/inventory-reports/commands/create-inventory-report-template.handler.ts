import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { ReportTemplateEntity } from '../../reporting/report-core/report-template.entity';
import { toTemplateView } from '../../reporting/report-core/report-template.view';
import {
  resolveTemplateScope,
  writeScopeWhere,
} from '../../reporting/report-core/template-scope';
import {
  assertColumnsInCatalog,
  buildColumnCatalog,
  normalizeTemplateColumns,
} from '../../reporting/invoice-report/invoice-report-template.columns.util';
import { InventoryReportRegistry } from '../report/inventory-report-definition';
import { CreateInventoryReportTemplateCommand } from './create-inventory-report-template.command';

@CommandHandler(CreateInventoryReportTemplateCommand)
export class CreateInventoryReportTemplateHandler
  implements ICommandHandler<CreateInventoryReportTemplateCommand>
{
  constructor(
    @InjectRepository(ReportTemplateEntity)
    private readonly repo: Repository<ReportTemplateEntity>,
    private readonly registry: InventoryReportRegistry,
  ) {}

  async execute({
    dto,
    actor,
  }: CreateInventoryReportTemplateCommand): Promise<InvoiceReportTemplateView> {
    const resolved = resolveTemplateScope(dto.scope, actor);
    const catalog = await buildColumnCatalog(
      this.registry,
      dto.reportType,
      actor,
    );
    assertColumnsInCatalog(
      (dto.columnFilters ?? []).map((f) => f.col),
      catalog,
    );
    const columns = normalizeTemplateColumns(dto.columns, catalog);

    // Names are unique per tier, not per organization: two branches may both
    // call their layout "Mặc định".
    const dup = await this.repo.findOne({
      where: {
        ...writeScopeWhere(actor, resolved),
        reportType: dto.reportType,
        name: dto.name,
      },
    });
    if (dup) {
      throw new ConflictException('Template name already exists');
    }

    const saved = await this.repo.save(
      this.repo.create({
        organizationId: actor.organizationId,
        branchId: resolved.branchId ?? undefined,
        createdBy: actor.userId,
        reportType: dto.reportType,
        name: dto.name,
        description: dto.description ?? null,
        columns,
        filters: {
          ...(dto.filters ?? {}),
          columnFilters: dto.columnFilters ?? [],
        } as Record<string, unknown>,
        sortOrder: dto.sortOrder ?? 0,
      }),
    );
    return toTemplateView(saved);
  }
}
