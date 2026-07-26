import { Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PROMOTION_REPOSITORY, PromotionRepositoryPort } from '../../domain/ports/promotion-repository.port';
import { InvoicePromotionEntity } from '../../invoice-promotion.entity';
import { DeletePromotionCommand } from './delete-promotion.command';

@CommandHandler(DeletePromotionCommand)
export class DeletePromotionHandler implements ICommandHandler<DeletePromotionCommand> {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly repo: PromotionRepositoryPort,
    @InjectRepository(InvoicePromotionEntity)
    private readonly invoicePromotionRepo: Repository<InvoicePromotionEntity>,
  ) {}

  async execute({ id, actor }: DeletePromotionCommand): Promise<void> {
    const existing = await this.repo.findById(actor.organizationId, id);
    if (!existing) {
      throw new NotFoundException(`Promotion program "${id}" not found`);
    }

    await this.assertNotReferenced(id);
    await this.repo.softDelete(actor.organizationId, id);
  }

  /**
   * `invoice_promotions.ref_id` never points at a v2 promotion program today —
   * POS checkout has not been wired to this engine yet (see the epic's scope
   * table). Left in place so the POS-integration epic doesn't forget to guard
   * against deleting an already-applied promotion (FR-009).
   */
  private async assertNotReferenced(programId: string): Promise<void> {
    const count = await this.invoicePromotionRepo.count({ where: { refId: programId } });
    if (count > 0) {
      throw new BadRequestException('Cannot delete a promotion program that has already been applied to an invoice');
    }
  }
}
