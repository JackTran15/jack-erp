import { randomUUID } from 'crypto';
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DocumentType, PromotionStatus } from '@erp/shared-interfaces';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { PROMOTION_REPOSITORY, PromotionRepositoryPort } from '../../domain/ports/promotion-repository.port';
import { PromotionProgram } from '../../domain/model/promotion-program';
import { dtoToProgramProps } from '../mappers/promotion-dto.mapper';
import { rethrowDomainError } from '../rethrow-domain-error';
import { PromotionAccessPolicy, scopeForOwner } from '../promotion-access.policy';
import { CreatePromotionCommand } from './create-promotion.command';

@CommandHandler(CreatePromotionCommand)
export class CreatePromotionHandler implements ICommandHandler<CreatePromotionCommand> {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly repo: PromotionRepositoryPort,
    private readonly docNumbering: DocumentNumberingService,
    private readonly access: PromotionAccessPolicy,
  ) {}

  async execute({ dto, actor }: CreatePromotionCommand): Promise<PromotionProgram> {
    // Before numbering, so a refused create never burns a code.
    const ownerBranchId = (await this.access.forActor(actor)).ownerForNew();
    const code = await this.docNumbering.generate(DocumentType.PROMOTION, actor.branchId, actor);

    try {
      const props = dtoToProgramProps(dto, {
        id: randomUUID(),
        organizationId: actor.organizationId,
        code,
        status: PromotionStatus.TRACKING,
        createdBy: actor.userId,
      });
      const program = PromotionProgram.create({
        ...props,
        ownerBranchId,
        branchIds: scopeForOwner(ownerBranchId, props.branchIds),
      });
      return await this.repo.save(program);
    } catch (error) {
      rethrowDomainError(error);
    }
  }
}
