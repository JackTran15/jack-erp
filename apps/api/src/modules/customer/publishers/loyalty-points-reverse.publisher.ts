import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface LoyaltyPointsReversePayload {
  returnInvoiceId: string;
  customerId: string;
  /**
   * Absolute value of the subtotal being reversed (>=0). Audit value, and the
   * consumer's fallback: it decrements `floor(subtotalDelta / POINT_EARN_VND_PER_POINT)`
   * only when `points` is absent.
   */
  subtotalDelta: number;
  /**
   * Authoritative point count to reverse. When present the consumer uses it verbatim
   * instead of re-deriving points from money — the derivation is wrong for any invoice
   * whose accrual was blocked by a promotion, where money moved but nothing was earned.
   * Absent only on events published before promotion-points-reverse-defects (ADR-01).
   */
  points?: number;
  branchId?: string;
  organizationId: string;
  actorId: string;
}

export interface LoyaltyPointsReverseInput {
  returnInvoiceId: string;
  customerId?: string | null;
  /** Refund subtotal (positive number). For partial returns this is the amount being refunded. */
  subtotalDelta: number;
  /** Points actually to reverse. Omit only when no invoice-recorded count is available. */
  points?: number;
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
          // `Number(undefined)` is NaN, and NaN on the wire reads as "present" to the
          // consumer's `??` — so absence has to stay absence.
          points: input.points == null ? undefined : Number(input.points),
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
