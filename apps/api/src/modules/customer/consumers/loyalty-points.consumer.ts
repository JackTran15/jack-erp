import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainEvent } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { MembershipCardService } from '../services/membership-card.service';
import { PointHistoryEntity, PointType } from '../point-history.entity';
import { LoyaltyPointsAwardPayload } from '../publishers/loyalty-points.publisher';

@Injectable()
export class LoyaltyPointsConsumer {
  private readonly logger = new Logger(LoyaltyPointsConsumer.name);

  constructor(
    @InjectRepository(PointHistoryEntity)
    private readonly historyRepo: Repository<PointHistoryEntity>,
    private readonly membershipCardService: MembershipCardService,
  ) {}

  @OnDomainEvent(ERP_TOPICS.LOYALTY_POINTS_AWARD)
  async handle(event: DomainEvent<LoyaltyPointsAwardPayload>): Promise<void> {
    const { invoiceId, customerId, subtotal, branchId, organizationId, actorId } =
      event.payload;

    // Scoped to EARN: checkout already wrote a REDEEM row against this same
    // invoiceId when the customer paid with points, so an untyped lookup would
    // read that as a duplicate award and silently skip the earn.
    const existing = await this.historyRepo.findOne({
      where: { invoiceId, organizationId, type: PointType.EARN },
    });

    if (existing) {
      this.logger.log(
        `Skipped duplicate loyalty points award for invoice ${invoiceId}`,
      );
      return;
    }

    await this.membershipCardService.awardPointsForInvoice(
      { id: invoiceId, customerId, subtotal: Number(subtotal) },
      {
        userId: actorId,
        organizationId,
        branchId,
        roles: [],
      },
    );

    this.logger.log(
      `Awarded loyalty points for invoice ${invoiceId} customer ${customerId}`,
    );
  }
}
