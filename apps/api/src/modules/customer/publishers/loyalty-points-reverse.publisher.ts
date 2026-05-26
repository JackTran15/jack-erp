import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface LoyaltyPointsReversePayload {
  returnInvoiceId: string;
  customerId: string;
  /** Absolute value of the subtotal being reversed (>=0). Consumer decrements `floor(subtotalDelta/1000)`. */
  subtotalDelta: number;
  branchId?: string;
  organizationId: string;
  actorId: string;
}

export interface LoyaltyPointsReverseInput {
  returnInvoiceId: string;
  customerId?: string | null;
  /** Refund subtotal (positive number). For partial returns this is the amount being refunded. */
  subtotalDelta: number;
  branchId?: string;
}

@Injectable()
export class LoyaltyPointsReversePublisher {
  private readonly logger = new Logger(LoyaltyPointsReversePublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(input: LoyaltyPointsReverseInput, actor: ActorContext): Promise<boolean> {
    if (!input.customerId) {
      return false;
    }
    if (input.subtotalDelta <= 0) {
      return false;
    }

    await this.eventPublisher.publish(
      ERP_TOPICS.LOYALTY_POINTS_REVERSE,
      {
        eventId: uuid(),
        eventType: DomainEventType.LOYALTY_POINTS_REVERSE_REQUESTED,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId: input.branchId,
        correlationId: input.returnInvoiceId,
        payload: {
          returnInvoiceId: input.returnInvoiceId,
          customerId: input.customerId,
          subtotalDelta: Number(input.subtotalDelta),
          branchId: input.branchId,
          organizationId: actor.organizationId,
          actorId: actor.userId,
        } satisfies LoyaltyPointsReversePayload,
      },
      input.customerId,
    );

    this.logger.log(
      `Published loyalty reverse event for return ${input.returnInvoiceId} customer ${input.customerId}`,
    );
    return true;
  }
}
