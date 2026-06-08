import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    const { returnInvoiceId, customerId, subtotalDelta, organizationId, actorId } =
      event.payload;

    const existing = await this.historyRepo.findOne({
      where: { invoiceId: returnInvoiceId, organizationId },
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

    const requestedDelta = Math.floor(
      Math.abs(Number(subtotalDelta)) / POINT_EARN_VND_PER_POINT,
    );
    if (requestedDelta <= 0) {
      this.logger.log(
        `Loyalty reverse: zero delta for return ${returnInvoiceId}, recording NO-OP history`,
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
        `Insufficient points to fully reverse ${returnInvoiceId}: requested=${requestedDelta}, available=${card.points}, applied=${actualDelta}`,
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
      `Reversed ${actualDelta} loyalty point(s) for return ${returnInvoiceId} customer ${customerId}`,
    );
  }
}
