import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InvoiceEntity } from '../entities/invoice.entity';
import { MembershipCardService } from '../../customer/services/membership-card.service';
import { POINT_REDEMPTION_VALUE_VND } from '../../customer/loyalty.constants';
import { computeAmountDue } from './invoice-amount.util';

/**
 * Applies / removes loyalty point redemption on a DRAFT invoice. Redemption is
 * modelled as a discount (reduces amountDue, lowering recognised revenue) — it
 * only records the intent on the draft. The actual point deduction happens
 * synchronously inside the checkout transaction (see
 * CheckoutInvoiceService → MembershipCardService.redeemPointsForInvoice).
 */
@Injectable()
export class PointsRedemptionService {
  private readonly logger = new Logger(PointsRedemptionService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    private readonly membershipCardService: MembershipCardService,
  ) {}

  async applyRedemption(
    invoiceId: string,
    points: number,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    const invoice = await this.loadDraft(invoiceId, actor);

    if (!invoice.customerId) {
      throw new BadRequestException(
        'Invoice must have a customer before redeeming points',
      );
    }
    if (!Number.isInteger(points) || points <= 0) {
      throw new BadRequestException('points must be a positive integer');
    }

    const card = await this.membershipCardService.findActiveCard(
      invoice.customerId,
      actor,
    );
    if (!card) {
      throw new BadRequestException('Customer has no active membership card');
    }
    if (points > card.points) {
      throw new BadRequestException(
        `Insufficient points: balance=${card.points}, requested=${points}`,
      );
    }

    const pointsDiscountAmount = points * POINT_REDEMPTION_VALUE_VND;
    const maxDiscount =
      Number(invoice.subtotal) -
      Number(invoice.discountAmount ?? 0) -
      Number(invoice.depositAmount ?? 0);
    if (pointsDiscountAmount > maxDiscount) {
      throw new BadRequestException(
        `Point discount (${pointsDiscountAmount}) exceeds the redeemable amount (${maxDiscount})`,
      );
    }

    invoice.pointsRedeemed = points;
    invoice.pointsDiscountAmount = pointsDiscountAmount;
    invoice.amountDue = computeAmountDue(invoice);

    const saved = await this.invoiceRepo.save(invoice);
    this.logger.log(
      `Applied ${points} point redemption (−${pointsDiscountAmount}) to invoice ${invoiceId}`,
    );
    return saved;
  }

  async removeRedemption(
    invoiceId: string,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    const invoice = await this.loadDraft(invoiceId, actor);

    invoice.pointsRedeemed = 0;
    invoice.pointsDiscountAmount = 0;
    invoice.amountDue = computeAmountDue(invoice);

    return this.invoiceRepo.save(invoice);
  }

  private async loadDraft(
    invoiceId: string,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: invoiceId, organizationId: actor.organizationId },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice "${invoiceId}" not found`);
    }
    if (!invoice.isDraft) {
      throw new BadRequestException(
        'Cannot change point redemption on a non-draft invoice',
      );
    }
    return invoice;
  }
}
