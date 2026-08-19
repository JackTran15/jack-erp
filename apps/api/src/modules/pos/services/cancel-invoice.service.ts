import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { WsEventType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { PromotionApplyService } from '../../promotion/promotion-apply.service';
import { LoyaltyPointsReversePublisher } from '../../customer/publishers/loyalty-points-reverse.publisher';
import { MembershipCardService } from '../../customer/services/membership-card.service';
import {
  InvoiceEntity,
  InvoiceStatus,
  InvoiceType,
} from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { InvoiceDebtEntity, DebtStatus } from '../entities/invoice-debt.entity';
import { CancelInvoiceDto } from '../dto/cancel-invoice.dto';
import { InvoiceCancelledPublisher } from '../publishers/invoice-cancelled.publisher';
import { InvoiceRefundLegsService } from './invoice-refund-legs.service';

const CANCELLABLE_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  InvoiceStatus.PAID,
  InvoiceStatus.DEBT,
  InvoiceStatus.PARTIAL_DEBT,
]);

@Injectable()
export class CancelInvoiceService {
  private readonly logger = new Logger(CancelInvoiceService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(InvoiceItemEntity)
    private readonly itemRepo: Repository<InvoiceItemEntity>,
    private readonly dataSource: DataSource,
    private readonly promotionApplyService: PromotionApplyService,
    private readonly invoiceCancelledPublisher: InvoiceCancelledPublisher,
    private readonly wsEmitter: WebSocketEmitterService,
    private readonly refundLegs: InvoiceRefundLegsService,
    private readonly loyaltyPointsReversePublisher: LoyaltyPointsReversePublisher,
    private readonly membershipCardService: MembershipCardService,
  ) {}

  async cancel(
    id: string,
    dto: CancelInvoiceDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    if (!CANCELLABLE_STATUSES.has(invoice.status)) {
      throw new BadRequestException(
        `Only paid/debt/partial-debt invoices can be cancelled. Current status: ${invoice.status}`,
      );
    }

    // A RETURN/EXCHANGE moves money and stock the other way, so voiding one is
    // the mirror of this flow, not this flow — CancelReturnService owns it.
    if (invoice.type !== InvoiceType.SALE) {
      throw new BadRequestException(
        `Only sale invoices can be cancelled here. Current type: ${invoice.type}`,
      );
    }

    await this.assertNoSettledReturns(invoice, actor);

    const items = await this.itemRepo.find({ where: { invoiceId: id } });
    // Resolved before the transaction on purpose: a branch with no cash fund is
    // a configuration error, and failing here leaves the invoice untouched
    // rather than emitting an event no consumer can honour.
    const refunds = await this.refundLegs.build(invoice, actor);
    const hasOutstandingDebt =
      invoice.status === InvoiceStatus.DEBT ||
      invoice.status === InvoiceStatus.PARTIAL_DEBT;
    const now = new Date();

    const cancelledInvoice = await this.dataSource.transaction(async (manager) => {
      invoice.status = InvoiceStatus.CANCELLED;
      invoice.cancelledAt = now;
      invoice.cancelReason = dto.reason;
      // Cancelling voids the sale outright, so every point it earned is clawed
      // back — same snapshot convention as a full return (see checkout-return.service).
      invoice.pointsReversed = invoice.pointsEarned;

      // ...and every point it *spent* goes back to the customer. Only the earn
      // side used to be handled, so cancelling an invoice that redeemed 100
      // points destroyed them: the sale was void but the points were never
      // returned. A cancel is a full return, so the ratio is 1 and the amount is
      // simply `pointsRedeemed` — no proration needed (contrast
      // checkout-return.service's computeRedeemedCreditBack, which prorates).
      const creditBack = Number(invoice.pointsRedeemed ?? 0);
      const cardBalance = invoice.customerId
        ? await this.membershipCardService.getPointBalanceForUpdate(
            invoice.customerId,
            manager,
            actor,
          )
        : null;
      // Projected balance this cancellation leaves the customer on: what the
      // card holds now, plus the points handed back here, minus the earn the
      // async reverse consumer is about to claw back. Clamped like the consumer,
      // which caps its decrement at the available balance.
      invoice.pointsBalanceAfter =
        cardBalance == null
          ? null
          : Math.max(0, cardBalance + creditBack - Number(invoice.pointsReversed ?? 0));

      const saved = await manager.save(invoice);

      if (invoice.customerId && creditBack > 0) {
        await this.membershipCardService.refundRedeemedPoints(
          { customerId: invoice.customerId, points: creditBack, invoiceId: saved.id },
          manager,
          actor,
        );
      }

      if (hasOutstandingDebt) {
        await manager.update(
          InvoiceDebtEntity,
          { invoiceId: id, organizationId: actor.organizationId },
          { status: DebtStatus.PAID, settledAt: now },
        );
      }

      await this.promotionApplyService.revertPromotions(id, manager);

      return saved;
    });

    await this.invoiceCancelledPublisher.publish(
      {
        invoiceId: id,
        documentNumber: invoice.code,
        reason: dto.reason,
        branchId: invoice.branchId,
        items: items
          .filter((i) => i.locationId)
          .map((item) => ({
            itemId: item.itemId,
            locationId: item.locationId!,
            quantity: Number(item.quantity),
            direction: item.direction,
          })),
        refunds,
      },
      actor,
    );

    if (invoice.customerId) {
      await this.loyaltyPointsReversePublisher.publish(
        {
          returnInvoiceId: id,
          customerId: invoice.customerId,
          // `subtotalDelta` stays as the audit value and keeps the publisher's
          // `<= 0` guard firing, but it is no longer what decides the point count.
          // Sending money alone let the consumer re-derive floor(amountDue / 10.000),
          // which claws back points a blocked-accrual invoice never earned: QA #16 saw
          // an 800.000đ sale with points_earned = 0 still debit 80 points off the card.
          // A cancel voids the whole sale, so the ratio is 1 and the number to reverse
          // is exactly what the invoice recorded — the same value `pointsReversed` and
          // `pointsBalanceAfter` above already use.
          subtotalDelta: Number(invoice.amountDue),
          points: Number(invoice.pointsEarned ?? 0),
          branchId: invoice.branchId,
        },
        actor,
      );
    }

    this.wsEmitter.emitToBranch(invoice.branchId!, {
      eventId: uuid(),
      eventType: WsEventType.POS_INVOICE_CANCELLED,
      timestamp: now.toISOString(),
      organizationId: actor.organizationId,
      branchId: invoice.branchId,
      correlationId: id,
      payload: {
        invoiceId: id,
        documentNumber: invoice.code,
        reason: dto.reason,
      },
    });

    this.logger.log(
      `Cancelled invoice ${id} (code=${invoice.code}, org=${actor.organizationId}, ` +
        `refundLegs=${refunds.length}, refundTotal=${refunds.reduce(
          (sum, leg) => sum + leg.amount,
          0,
        )})`,
    );

    return cancelledInvoice;
  }

  /**
   * Refuse an invoice that has already been partly refunded through the
   * return/exchange flow: that money went back once already, and cancelling
   * would pay it a second time. Drafts and cancelled returns do not count —
   * neither moved anything.
   */
  private async assertNoSettledReturns(
    invoice: InvoiceEntity,
    actor: ActorContext,
  ): Promise<void> {
    const settledReturns = await this.invoiceRepo.count({
      where: {
        organizationId: actor.organizationId,
        originalInvoiceId: invoice.id,
        isDraft: false,
        status: Not(InvoiceStatus.CANCELLED),
      },
    });

    if (settledReturns > 0) {
      throw new BadRequestException(
        `Hóa đơn ${invoice.code} đã có phiếu đổi trả — huỷ phiếu đổi trả trước, ` +
          'rồi mới huỷ được hóa đơn này.',
      );
    }
  }

}
