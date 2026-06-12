import { BadRequestException, ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { InvoiceReportTemplateEntity } from '../invoice-report-template.entity';
import { toTemplateView } from '../invoice-report-template.view';
import { isAcceptedColumnKey } from '../invoice-report.columns';
import { CreateInvoiceReportTemplateCommand } from './create-invoice-report-template.command';

@CommandHandler(CreateInvoiceReportTemplateCommand)
export class CreateInvoiceReportTemplateHandler
  implements ICommandHandler<CreateInvoiceReportTemplateCommand>
{
  constructor(
    @InjectRepository(InvoiceReportTemplateEntity)
    private readonly repo: Repository<InvoiceReportTemplateEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: CreateInvoiceReportTemplateCommand): Promise<InvoiceReportTemplateView> {
    const referenced = [
      ...dto.columns,
      ...(dto.columnFilters ?? []).map((f) => f.col),
    ];
    const unknown = referenced.filter((k) => !isAcceptedColumnKey(k));
    if (unknown.length) {
      throw new BadRequestException(
        `Unknown report columns: ${[...new Set(unknown)].join(', ')}`,
      );
    }

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
        columns: dto.columns,
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
