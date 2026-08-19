import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { MembershipCardEntity } from '../membership-card.entity';
import { PointHistoryEntity, PointType } from '../point-history.entity';
import { POINT_EARN_VND_PER_POINT } from '../loyalty.constants';
import { LoyaltyPointsReversePayload } from '../publishers/loyalty-points-reverse.publisher';

@Injectable()
export class LoyaltyPointsReverseConsumer {
  private readonly logger = new Logger(LoyaltyPointsReverseConsumer.name);

  constructor(
    @InjectRepository(PointHistoryEntity)
    private readonly historyRepo: Repository<PointHistoryEntity>,
    @InjectRepository(MembershipCardEntity)
    private readonly cardRepo: Repository<MembershipCardEntity>,
    private readonly dataSource: DataSource,
  ) {}

  @OnDomainEvent(ERP_TOPICS.LOYALTY_POINTS_REVERSE, {
    groupId: 'erp-api.return.loyalty-reverse',
  })
  async handle(event: DomainEvent<LoyaltyPointsReversePayload>): Promise<void> {
    const { returnInvoiceId, customerId, subtotalDelta, points, organizationId, actorId } =
      event.payload;

    // The return transaction may already have written an ADJUST row against this
    // same id (refundRedeemedPoints, always delta > 0). Only rows this consumer
    // wrote have delta <= 0, so the sign is what distinguishes them — an untyped
    // lookup would read the refund as a duplicate and skip the reversal.
    const existing = await this.historyRepo.findOne({
      where: {
        invoiceId: returnInvoiceId,
        organizationId,
        type: PointType.ADJUST,
        delta: LessThanOrEqual(0),
      },
    });
    if (existing) {
      this.logger.log(
        `Skipped duplicate loyalty reverse for return ${returnInvoiceId}`,
      );
      return;
    }

    const card = await this.cardRepo.findOne({
      where: { customerId, organizationId, isActive: true },
    });
    if (!card) {
      this.logger.warn(
        `Loyalty reverse skipped: no active card for customer ${customerId}`,
      );
      return;
    }

    // The producer sends the count the invoice actually recorded; money is only the
    // fallback for events published before promotion-points-reverse-defects (ADR-01).
    // Re-deriving from money is wrong whenever a promotion blocked accrual — an
    // 800.000đ sale that earned nothing would otherwise claw back 80 points the
    // customer never had (QA #16). `??` and not `||`: `points: 0` is exactly the case
    // this exists to honour, and `||` would fall straight through to the money path.
    const source = points == null ? 'money-fallback' : 'payload';
    const requestedDelta =
      points ?? Math.floor(Math.abs(Number(subtotalDelta)) / POINT_EARN_VND_PER_POINT);
    if (requestedDelta <= 0) {
      this.logger.log(
        `Loyalty reverse: zero points to reverse for return ${returnInvoiceId} ` +
          `(source=${source}, subtotalDelta=${subtotalDelta}) — accrual was blocked or ` +
          `the amount is below one point; recording NO-OP history`,
      );
      await this.historyRepo.insert({
        cardId: card.id,
        invoiceId: returnInvoiceId,
        type: PointType.ADJUST,
        delta: 0,
        note: 'Hoàn điểm từ đơn trả (delta = 0)',
        organizationId,
        createdBy: actorId,
      });
      return;
    }

    const actualDelta = Math.min(requestedDelta, card.points);
    if (actualDelta < requestedDelta) {
      this.logger.warn(
        `Insufficient points to fully reverse ${returnInvoiceId}: requested=${requestedDelta} (source=${source}), available=${card.points}, applied=${actualDelta}`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      if (actualDelta > 0) {
        await manager.decrement(MembershipCardEntity, { id: card.id }, 'points', actualDelta);
      }
      await manager.insert(PointHistoryEntity, {
        cardId: card.id,
        invoiceId: returnInvoiceId,
        type: PointType.ADJUST,
        delta: -actualDelta,
        note: `Hoàn điểm từ đơn trả (yêu cầu=${requestedDelta}, áp dụng=${actualDelta})`,
        organizationId,
        createdBy: actorId,
      });
    });

    this.logger.log(
      `Reversed ${actualDelta} loyalty point(s) for return ${returnInvoiceId} customer ${customerId} (source=${source})`,
    );
  }
}
