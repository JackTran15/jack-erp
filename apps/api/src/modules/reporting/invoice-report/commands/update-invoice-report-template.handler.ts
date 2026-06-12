import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { InvoiceReportTemplateEntity } from '../invoice-report-template.entity';
import { toTemplateView } from '../invoice-report-template.view';
import { isAcceptedColumnKey } from '../invoice-report.columns';
import { UpdateInvoiceReportTemplateCommand } from './update-invoice-report-template.command';

@CommandHandler(UpdateInvoiceReportTemplateCommand)
export class UpdateInvoiceReportTemplateHandler
  implements ICommandHandler<UpdateInvoiceReportTemplateCommand>
{
  constructor(
    @InjectRepository(InvoiceReportTemplateEntity)
    private readonly repo: Repository<InvoiceReportTemplateEntity>,
  ) {}

  async execute({
    id,
    dto,
    actor,
  }: UpdateInvoiceReportTemplateCommand): Promise<InvoiceReportTemplateView> {
    const entity = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!entity) {
      throw new NotFoundException('Invoice report template not found');
    }

    if (dto.columns !== undefined || dto.columnFilters !== undefined) {
      const referenced = [
        ...(dto.columns ?? entity.columns),
        ...(dto.columnFilters ?? []).map((f) => f.col),
      ];
      const unknown = referenced.filter((k) => !isAcceptedColumnKey(k));
      if (unknown.length) {
        throw new BadRequestException(
          `Unknown report columns: ${[...new Set(unknown)].join(', ')}`,
        );
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
    if (dto.columns !== undefined) entity.columns = dto.columns;
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
