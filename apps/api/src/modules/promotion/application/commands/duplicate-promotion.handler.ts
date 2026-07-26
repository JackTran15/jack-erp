import { randomUUID } from 'crypto';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DocumentType, PromotionStatus } from '@erp/shared-interfaces';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { PROMOTION_REPOSITORY, PromotionRepositoryPort } from '../../domain/ports/promotion-repository.port';
import { PromotionProgram } from '../../domain/model/promotion-program';
import { PromotionGroup } from '../../domain/model/promotion-group';
import { rethrowDomainError } from '../rethrow-domain-error';
import { DuplicatePromotionCommand } from './duplicate-promotion.command';

function cloneGroups(groups: PromotionGroup[]): PromotionGroup[] {
  return groups.map((group) => ({
    id: randomUUID(),
    ordinal: group.ordinal,
    name: group.name,
    lines: group.lines.map((line) => ({ ...line, id: randomUUID() })),
    tiers: group.tiers.map((tier) => ({ ...tier, id: randomUUID() })),
  }));
}

@CommandHandler(DuplicatePromotionCommand)
export class DuplicatePromotionHandler implements ICommandHandler<DuplicatePromotionCommand> {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly repo: PromotionRepositoryPort,
    private readonly docNumbering: DocumentNumberingService,
  ) {}

  async execute({ id, actor }: DuplicatePromotionCommand): Promise<PromotionProgram> {
    const original = await this.repo.findById(actor.organizationId, id);
    if (!original) {
      throw new NotFoundException(`Promotion program "${id}" not found`);
    }

    const code = await this.docNumbering.generate(DocumentType.PROMOTION, actor.branchId, actor);

    try {
      const program = PromotionProgram.create({
        ...original.toProps(),
        id: randomUUID(),
        code,
        name: `${original.name} (sao chép)`,
        status: PromotionStatus.TRACKING,
        groups: cloneGroups(original.groups),
        createdBy: actor.userId,
        createdAt: undefined,
        updatedAt: undefined,
      });
      return await this.repo.save(program);
    } catch (error) {
      rethrowDomainError(error);
    }
  }
}
