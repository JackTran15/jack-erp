import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { InvoiceEntity } from '../pos/entities/invoice.entity';
import { InvoicePromotionEntity, InvoicePromotionType } from './invoice-promotion.entity';
import { DiscountCodeEntity, DiscountType } from './discount-code.entity';
import { DiscountCodeService } from './discount-code.service';
import { VoucherService } from './voucher.service';
import { PromotionService } from './promotion.service';
import { ApplyPromotionDto } from './dto/apply-promotion.dto';

@Injectable()
export class PromotionApplyService {
  private readonly logger = new Logger(PromotionApplyService.name);

  constructor(
    @InjectRepository(InvoicePromotionEntity)
    private readonly invoicePromotionRepo: Repository<InvoicePromotionEntity>,
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    private readonly discountCodeService: DiscountCodeService,
    private readonly voucherService: VoucherService,
    private readonly promotionService: PromotionService,
    private readonly dataSource: DataSource,
  ) {}

  async apply(
    invoiceId: string,
    dto: ApplyPromotionDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    // 1. Load invoice
    const invoice = await this.invoiceRepo.findOne({
      where: { id: invoiceId, organizationId: actor.organizationId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice "${invoiceId}" not found`);
    }

    // 2. Guard: must be draft
    if (!invoice.isDraft) {
      throw new BadRequestException('Cannot apply promotions to a non-draft invoice');
    }

    let discountAmount = 0;
    let refId: string;

    // 3. Validate by type and compute discount
    if (dto.type === InvoicePromotionType.DISCOUNT_CODE) {
      const discountCode = await this.discountCodeService.validate(
        dto.code,
        Number(invoice.subtotal),
        actor,
      );
      refId = discountCode.id;
      discountAmount = this.computeDiscountCodeAmount(discountCode, Number(invoice.subtotal));
    } else if (dto.type === InvoicePromotionType.VOUCHER) {
      const voucher = await this.voucherService.validate(dto.code, invoice.customerId, actor);
      refId = voucher.id;
      discountAmount = Math.min(Number(voucher.faceValue), Number(invoice.subtotal));
    } else if (dto.type === InvoicePromotionType.PROMOTION) {
      // C-3: look up by name (human-readable), not UUID
      const promotion = await this.promotionService.findByName(dto.code, actor.organizationId);
      refId = promotion.id;
      discountAmount = this.computePromotionAmount(promotion.benefits, Number(invoice.subtotal));
    } else {
      throw new BadRequestException(`Unknown promotion type: ${dto.type}`);
    }

    // 4. Check stacking rules
    const existingPromotions = await this.invoicePromotionRepo.find({
      where: { invoiceId },
    });
    if (existingPromotions.length > 0) {
      for (const ep of existingPromotions) {
        if (ep.promotionType === InvoicePromotionType.PROMOTION) {
          const promo = await this.promotionService.findOne(ep.refId, actor).catch(() => null);
          if (promo) {
            const conditions = promo.conditions as Record<string, any>;
            if (conditions?.can_stack === false) {
              throw new BadRequestException(
                'Cannot stack promotions: an existing promotion does not allow stacking',
              );
            }
          }
        }
      }
    }

    // H-2: also block if the new promotion itself is non-stackable and others already applied
    if (dto.type === InvoicePromotionType.PROMOTION && existingPromotions.length > 0) {
      const newPromo = await this.promotionService.findOne(refId!, actor).catch(() => null);
      if (newPromo) {
        const conditions = newPromo.conditions as Record<string, any>;
        if (conditions?.can_stack === false) {
          throw new BadRequestException(
            'This promotion cannot be combined with other promotions',
          );
        }
      }
    }

    // 5. Transaction: insert InvoicePromotion, recalculate invoice
    await this.dataSource.transaction(async (manager) => {
      const ipRepo = manager.getRepository(InvoicePromotionEntity);
      const invRepo = manager.getRepository(InvoiceEntity);

      await ipRepo.save(
        ipRepo.create({
          invoiceId,
          promotionType: dto.type,
          refId: refId!,
          discountAmount,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
        }),
      );

      // Recalculate totals from all promotions
      const allPromotions = await ipRepo.find({ where: { invoiceId } });
      const totalDiscount = allPromotions.reduce(
        (sum, p) => sum + Number(p.discountAmount),
        0,
      );

      invoice.discountAmount = totalDiscount;
      invoice.amountDue = Math.max(
        0,
        Number(invoice.subtotal) - totalDiscount - Number(invoice.depositAmount),
      );

      await invRepo.save(invoice);
    });

    // Reload and return updated invoice
    return this.invoiceRepo.findOne({ where: { id: invoiceId } }) as Promise<InvoiceEntity>;
  }

  async remove(
    invoiceId: string,
    invoicePromotionId: string,
    actor: ActorContext,
  ): Promise<void> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: invoiceId, organizationId: actor.organizationId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice "${invoiceId}" not found`);
    }
    if (!invoice.isDraft) {
      throw new BadRequestException('Cannot remove promotions from a non-draft invoice');
    }

    await this.dataSource.transaction(async (manager) => {
      const ipRepo = manager.getRepository(InvoicePromotionEntity);
      const invRepo = manager.getRepository(InvoiceEntity);

      await ipRepo.delete({ id: invoicePromotionId, invoiceId });

      const remaining = await ipRepo.find({ where: { invoiceId } });
      const totalDiscount = remaining.reduce(
        (sum, p) => sum + Number(p.discountAmount),
        0,
      );

      invoice.discountAmount = totalDiscount;
      invoice.amountDue = Math.max(
        0,
        Number(invoice.subtotal) - totalDiscount - Number(invoice.depositAmount),
      );

      await invRepo.save(invoice);
    });

    this.logger.log(
      `Removed invoice promotion ${invoicePromotionId} from invoice ${invoiceId}`,
    );
  }

  /**
   * Called by CheckoutInvoiceService during checkout (within the checkout transaction).
   * Commits all applied promotions: increments discount code usedCount, marks vouchers as used.
   */
  async commitPromotions(invoice: InvoiceEntity, manager: EntityManager): Promise<void> {
    const ipRepo = manager.getRepository(InvoicePromotionEntity);
    const promotions = await ipRepo.find({ where: { invoiceId: invoice.id } });

    for (const promo of promotions) {
      if (promo.promotionType === InvoicePromotionType.DISCOUNT_CODE) {
        await this.discountCodeService.incrementUsedCount(promo.refId, manager);
      } else if (promo.promotionType === InvoicePromotionType.VOUCHER) {
        await this.voucherService.markUsed(promo.refId, invoice.id, manager);
      }
    }
  }

  /**
   * Called by CancelInvoiceService. Reverses all promotion effects on a finalised invoice:
   * unmarks vouchers, decrements discount code counters, deletes invoice_promotions rows.
   */
  async revertPromotions(invoiceId: string, manager: EntityManager): Promise<void> {
    const ipRepo = manager.getRepository(InvoicePromotionEntity);
    const promotions = await ipRepo.find({ where: { invoiceId } });

    for (const promo of promotions) {
      if (promo.promotionType === InvoicePromotionType.VOUCHER) {
        await manager
          .createQueryBuilder()
          .update('vouchers')
          .set({ is_used: false, redeemed_invoice_id: null } as any)
          .where('id = :id AND redeemed_invoice_id = :invoiceId', {
            id: promo.refId,
            invoiceId,
          })
          .execute();
      } else if (promo.promotionType === InvoicePromotionType.DISCOUNT_CODE) {
        await manager
          .createQueryBuilder()
          .update('discount_codes')
          .set({ used_count: () => 'GREATEST(used_count - 1, 0)' } as any)
          .where('id = :id', { id: promo.refId })
          .execute();
      }
    }

    await ipRepo.delete({ invoiceId });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private computeDiscountCodeAmount(
    discountCode: DiscountCodeEntity,
    subtotal: number,
  ): number {
    if (discountCode.discountType === DiscountType.PERCENTAGE) {
      return Math.min((Number(discountCode.discountValue) / 100) * subtotal, subtotal);
    }
    // FIXED_AMOUNT
    return Math.min(Number(discountCode.discountValue), subtotal);
  }

  private computePromotionAmount(
    benefits: object,
    subtotal: number,
  ): number {
    const b = benefits as Record<string, any>;
    if (b?.discount_type === 'percentage' && b?.discount_value != null) {
      return Math.min((Number(b.discount_value) / 100) * subtotal, subtotal);
    }
    if (b?.discount_amount != null) {
      return Math.min(Number(b.discount_amount), subtotal);
    }
    return 0;
  }
}
