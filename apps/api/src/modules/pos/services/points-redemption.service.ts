import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
    return this.invoiceRepo.manager.transaction((manager) =>
      this.applyRedemptionIn(manager, invoiceId, points, actor),
    );
  }

  /**
   * Same rules as {@link applyRedemption}, run inside a caller's transaction.
   *
   * This exists so a caller that creates the draft and redeems against it can do
   * BOTH or NEITHER. `SalesOrderService.approve` is that caller: it creates the
   * draft invoice from the order and then spends the points the consultant
   * pencilled in. Calling the repo-backed version from inside that transaction
   * would block on the very row the transaction holds; committing first and
   * redeeming after would leave the order PROCESSED with a draft that never got
   * its discount — a state nobody can clean up.
   *
   * The balance is read with `getPointBalanceForUpdate`, which locks the card
   * row. That lock is what makes the check meaningful: two cashiers spending the
   * same customer's points at once queue instead of both passing.
   */
  async applyRedemptionIn(
    manager: EntityManager,
    invoiceId: string,
    points: number,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    const invoice = await this.loadDraft(invoiceId, actor, manager);

    if (!invoice.customerId) {
      throw new BadRequestException(
        'Invoice must have a customer before redeeming points',
      );
    }
    if (!Number.isInteger(points) || points <= 0) {
      throw new BadRequestException('points must be a positive integer');
    }

    const balance = await this.membershipCardService.getPointBalanceForUpdate(
      invoice.customerId,
      manager,
      actor,
    );
    if (balance === null) {
      throw new BadRequestException('Customer has no active membership card');
    }
    if (points > balance) {
      throw new BadRequestException(
        `Insufficient points: balance=${balance}, requested=${points}`,
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

    const saved = await manager.save(InvoiceEntity, invoice);
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
    manager?: EntityManager,
  ): Promise<InvoiceEntity> {
    const where = { id: invoiceId, organizationId: actor.organizationId };
    const invoice = manager
      ? await manager.findOne(InvoiceEntity, { where })
      : await this.invoiceRepo.findOne({ where });
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
