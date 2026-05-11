import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface CashMovementFromPaymentPayload {
  invoiceId: string;
  invoicePaymentId: string;
  invoiceCode: string;
  sessionId?: string;
  cashAccountId: string;
  contraAccountId: string;
  amount: number;
  branchId?: string;
  organizationId: string;
  actorId: string;
}

export interface CashMovementFromPaymentInput {
  invoiceId: string;
  invoicePaymentId: string;
  invoiceCode: string;
  sessionId?: string;
  cashAccountId: string;
  contraAccountId: string;
  amount: number;
  branchId?: string;
}

@Injectable()
export class CashFromPaymentPublisher {
  private readonly logger = new Logger(CashFromPaymentPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(input: CashMovementFromPaymentInput, actor: ActorContext): Promise<void> {
    await this.eventPublisher.publish(
      ERP_TOPICS.CASH_MOVEMENT_FROM_PAYMENT,
      {
        eventId: uuid(),
        eventType: DomainEventType.CASH_MOVEMENT_FROM_PAYMENT_REQUESTED,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId: input.branchId,
        correlationId: input.invoiceId,
        payload: {
          invoiceId: input.invoiceId,
          invoicePaymentId: input.invoicePaymentId,
          invoiceCode: input.invoiceCode,
          sessionId: input.sessionId,
          cashAccountId: input.cashAccountId,
          contraAccountId: input.contraAccountId,
          amount: Number(input.amount),
          branchId: input.branchId,
          organizationId: actor.organizationId,
          actorId: actor.userId,
        } satisfies CashMovementFromPaymentPayload,
      },
      input.cashAccountId,
    );

    this.logger.log(
      `Published cash-from-payment event for invoice ${input.invoiceCode} (cashAccount=${input.cashAccountId})`,
    );
  }
}
