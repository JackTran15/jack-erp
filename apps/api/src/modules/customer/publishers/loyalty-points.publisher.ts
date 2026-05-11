import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface LoyaltyPointsAwardPayload {
  invoiceId: string;
  customerId: string;
  subtotal: number;
  issuedAt?: string;
  branchId?: string;
  organizationId: string;
  actorId: string;
}

export interface LoyaltyPointsAwardInput {
  invoiceId: string;
  customerId?: string | null;
  subtotal: number;
  issuedAt?: Date | null;
  branchId?: string;
}

@Injectable()
export class LoyaltyPointsPublisher {
  private readonly logger = new Logger(LoyaltyPointsPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(input: LoyaltyPointsAwardInput, actor: ActorContext): Promise<boolean> {
    if (!input.customerId) {
      return false;
    }

    await this.eventPublisher.publish(
      ERP_TOPICS.LOYALTY_POINTS_AWARD,
      {
        eventId: uuid(),
        eventType: DomainEventType.LOYALTY_POINTS_AWARD_REQUESTED,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId: input.branchId,
        correlationId: input.invoiceId,
        payload: {
          invoiceId: input.invoiceId,
          customerId: input.customerId,
          subtotal: Number(input.subtotal),
          issuedAt: input.issuedAt?.toISOString(),
          branchId: input.branchId,
          organizationId: actor.organizationId,
          actorId: actor.userId,
        } satisfies LoyaltyPointsAwardPayload,
      },
      input.customerId,
    );

    this.logger.log(
      `Published loyalty points award event for invoice ${input.invoiceId} customer ${input.customerId}`,
    );
    return true;
  }
}
