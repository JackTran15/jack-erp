import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface CashRefundPayload {
  returnInvoiceId: string;
  returnInvoiceCode: string;
  cashAccountId: string;
  contraAccountId: string;
  amount: number;
  sessionId?: string;
  branchId?: string;
  organizationId: string;
  actorId: string;
}

export interface CashRefundInput {
  returnInvoiceId: string;
  returnInvoiceCode: string;
  cashAccountId: string;
  contraAccountId: string;
  amount: number;
  sessionId?: string;
  branchId?: string;
}

@Injectable()
export class CashRefundPublisher {
  private readonly logger = new Logger(CashRefundPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(input: CashRefundInput, actor: ActorContext): Promise<void> {
    await this.eventPublisher.publish(
      ERP_TOPICS.CASH_REFUND,
      {
        eventId: uuid(),
        eventType: DomainEventType.CASH_REFUND_REQUESTED,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId: input.branchId,
        correlationId: input.returnInvoiceId,
        payload: {
          returnInvoiceId: input.returnInvoiceId,
          returnInvoiceCode: input.returnInvoiceCode,
          cashAccountId: input.cashAccountId,
          contraAccountId: input.contraAccountId,
          amount: Number(input.amount),
          sessionId: input.sessionId,
          branchId: input.branchId,
          organizationId: actor.organizationId,
          actorId: actor.userId,
        } satisfies CashRefundPayload,
      },
      input.cashAccountId,
    );

    this.logger.log(
      `Published cash refund event for ${input.returnInvoiceCode} (cashAccount=${input.cashAccountId}, amount=${input.amount})`,
    );
  }
}
