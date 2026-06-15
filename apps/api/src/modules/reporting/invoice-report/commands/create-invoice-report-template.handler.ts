import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { InvoiceReportTemplateEntity } from '../invoice-report-template.entity';
import { toTemplateView } from '../invoice-report-template.view';
import {
  assertColumnsInCatalog,
  buildColumnCatalog,
  normalizeTemplateColumns,
} from '../invoice-report-template.columns.util';
import { ReportRegistry } from '../report-definition';
import { CreateInvoiceReportTemplateCommand } from './create-invoice-report-template.command';

@CommandHandler(CreateInvoiceReportTemplateCommand)
export class CreateInvoiceReportTemplateHandler
  implements ICommandHandler<CreateInvoiceReportTemplateCommand>
{
  constructor(
    @InjectRepository(InvoiceReportTemplateEntity)
    private readonly repo: Repository<InvoiceReportTemplateEntity>,
    private readonly registry: ReportRegistry,
  ) {}

  async execute({
    dto,
    actor,
  }: CreateInvoiceReportTemplateCommand): Promise<InvoiceReportTemplateView> {
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

    const dup = await this.repo.findOne({
      where: {
        organizationId: actor.organizationId,
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
