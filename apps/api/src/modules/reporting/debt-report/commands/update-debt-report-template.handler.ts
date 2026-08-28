import { ConflictException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { InvoiceReportTemplateView } from '@erp/shared-interfaces';
import { ReportTemplateEntity } from '../../report-core/report-template.entity';
import { toTemplateView } from '../../report-core/report-template.view';
import {
  cloneForBranch,
  readScopeWhere,
  resolveTemplateScope,
  writeScopeWhere,
} from '../../report-core/template-scope';
import {
  assertColumnsInCatalog,
  buildColumnCatalog,
  normalizeTemplateColumns,
} from '../debt-report-template.columns.util';
import { ReportRegistry } from '../report-definition';
import { UpdateDebtReportTemplateCommand } from './update-debt-report-template.command';

@CommandHandler(UpdateDebtReportTemplateCommand)
export class UpdateDebtReportTemplateHandler
  implements ICommandHandler<UpdateDebtReportTemplateCommand>
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
  }: UpdateDebtReportTemplateCommand): Promise<InvoiceReportTemplateView> {
    const resolved = resolveTemplateScope(dto.scope, actor);
    const entity = await this.repo.findOne({
      where: readScopeWhere(actor, resolved).map((where) => ({ ...where, id })),
    });
    if (!entity) {
      throw new NotFoundException('Debt report template not found');
    }

    // Copy-on-write (ADR-03). The frontend patches whatever the list handed it,
    // and for an inheriting branch that is the chain row — editing it in place
    // would change the layout for every other branch still inheriting. Fork
    // first, then apply the patch to the fork. The order matters: assigning to
    // `entity` before this point makes TypeORM issue an UPDATE against the
    // chain row no matter what is saved afterwards.
    const forking = !entity.branchId && resolved.scope === 'branch';
    const target = forking
      ? cloneForBranch(entity, resolved.branchId as string, actor.userId)
      : entity;

    if (dto.columns !== undefined || dto.columnFilters !== undefined) {
      const catalog = await buildColumnCatalog(this.registry, target.reportType, actor);
      if (dto.columnFilters !== undefined) {
        assertColumnsInCatalog(dto.columnFilters.map((f) => f.col), catalog);
      }
      if (dto.columns !== undefined) {
        target.columns = normalizeTemplateColumns(dto.columns, catalog);
      }
    }

    const renaming = dto.name !== undefined && dto.name !== target.name;
    // A fork keeps the chain row's name, so it has to be checked too: the name
    // is free in the chain tier but may already be taken in this branch, and
    // without the check that lands as a raw 23505 from the unique index.
    if (renaming || forking) {
      const name = dto.name ?? target.name;
      const dup = await this.repo.findOne({
        where: {
          ...writeScopeWhere(actor, resolved),
          reportType: target.reportType,
          name,
          ...(target.id ? { id: Not(target.id) } : {}),
        },
      });
      if (dup) {
        throw new ConflictException('Template name already exists');
      }
      target.name = name;
    }

    if (dto.description !== undefined) target.description = dto.description;
    if (dto.sortOrder !== undefined) target.sortOrder = dto.sortOrder;
    if (dto.filters !== undefined || dto.columnFilters !== undefined) {
      const existing = (target.filters ?? {}) as Record<string, unknown>;
      const { columnFilters: existingColumnFilters, ...existingScope } = existing;
      const scope = dto.filters ?? existingScope;
      const columnFilters = dto.columnFilters ?? existingColumnFilters ?? [];
      target.filters = { ...scope, columnFilters } as Record<string, unknown>;
    }

    const saved = await this.repo.save(target);
    return toTemplateView(saved);
  }
}
