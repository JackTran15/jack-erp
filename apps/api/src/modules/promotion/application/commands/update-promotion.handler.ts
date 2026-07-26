import { Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PROMOTION_REPOSITORY, PromotionRepositoryPort } from '../../domain/ports/promotion-repository.port';
import { PromotionProgram } from '../../domain/model/promotion-program';
import { dtoToProgramProps } from '../mappers/promotion-dto.mapper';
import { rethrowDomainError } from '../rethrow-domain-error';
import { UpdatePromotionCommand } from './update-promotion.command';

@CommandHandler(UpdatePromotionCommand)
export class UpdatePromotionHandler implements ICommandHandler<UpdatePromotionCommand> {
  constructor(@Inject(PROMOTION_REPOSITORY) private readonly repo: PromotionRepositoryPort) {}

  async execute({ id, dto, actor }: UpdatePromotionCommand): Promise<PromotionProgram> {
    const existing = await this.repo.findById(actor.organizationId, id);
    if (!existing) {
      throw new NotFoundException(`Promotion program "${id}" not found`);
    }

    // FR-006: type is immutable after creation — changing the promotion form requires duplicating instead.
    if (dto.type !== existing.type) {
      throw new BadRequestException({
        message: 'Promotion type cannot be changed after creation',
        code: 'PROMOTION_TYPE_IMMUTABLE',
      });
    }

    try {
      const props = dtoToProgramProps(dto, {
        id: existing.id,
        organizationId: existing.organizationId,
        code: existing.code,
        status: existing.status,
        createdBy: existing.createdBy,
        createdAt: existing.createdAt,
      });
      const program = PromotionProgram.create(props);
      return await this.repo.save(program);
    } catch (error) {
      rethrowDomainError(error);
    }
  }
}
