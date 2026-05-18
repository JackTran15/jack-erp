import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType, RefundMethod } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface JournalPostReturnPayload {
  returnInvoiceId: string;
  returnInvoiceCode: string;
  source: 'RETURN' | 'EXCHANGE';
  refundMethod: RefundMethod;
  refundedAmount: number;
  netAmount: number;
  revenueAccountId: string;
  cashAccountId?: string;
  receivableAccountId?: string;
  creditLiabilityAccountId?: string;
  branchId?: string;
  organizationId: string;
  actorId: string;
}

export type JournalPostReturnInput = Omit<JournalPostReturnPayload, 'organizationId' | 'actorId'>;

@Injectable()
export class JournalReturnPublisher {
  private readonly logger = new Logger(JournalReturnPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(input: JournalPostReturnInput, actor: ActorContext): Promise<void> {
    const partitionKey = input.branchId ?? input.returnInvoiceId;

    await this.eventPublisher.publish(
      ERP_TOPICS.JOURNAL_POST_RETURN,
      {
        eventId: uuid(),
        eventType: DomainEventType.JOURNAL_POST_RETURN_REQUESTED,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId: input.branchId,
        correlationId: input.returnInvoiceId,
        payload: {
          ...input,
          refundedAmount: Number(input.refundedAmount),
          netAmount: Number(input.netAmount),
          organizationId: actor.organizationId,
          actorId: actor.userId,
        } satisfies JournalPostReturnPayload,
      },
      partitionKey,
    );

    this.logger.log(
      `Published journal-return event for ${input.returnInvoiceCode} (source=${input.source}, method=${input.refundMethod}, refunded=${input.refundedAmount})`,
    );
  }
}
