import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PROMOTION_REPOSITORY, PromotionRepositoryPort } from '../../domain/ports/promotion-repository.port';
import { PromotionProgram } from '../../domain/model/promotion-program';
import { rethrowDomainError } from '../rethrow-domain-error';
import { ChangePromotionStatusCommand } from './change-promotion-status.command';

@CommandHandler(ChangePromotionStatusCommand)
export class ChangePromotionStatusHandler implements ICommandHandler<ChangePromotionStatusCommand> {
  constructor(@Inject(PROMOTION_REPOSITORY) private readonly repo: PromotionRepositoryPort) {}

  async execute({ id, dto, actor }: ChangePromotionStatusCommand): Promise<PromotionProgram> {
    const existing = await this.repo.findById(actor.organizationId, id);
    if (!existing) {
      throw new NotFoundException(`Promotion program "${id}" not found`);
    }

    try {
      const program = PromotionProgram.create({ ...existing.toProps(), status: dto.status });
      return await this.repo.save(program);
    } catch (error) {
      rethrowDomainError(error);
    }
  }
}
