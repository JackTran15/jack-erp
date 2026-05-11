import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface JournalPostSalePaymentLine {
  accountId: string;
  amount: number;
}

export interface JournalPostSalePayload {
  invoiceId: string;
  code: string;
  branchId?: string;
  amountDue: number;
  remainder: number;
  revenueAccountId: string;
  receivableAccountId?: string;
  payments: JournalPostSalePaymentLine[];
  organizationId: string;
  actorId: string;
}

export interface JournalPostSaleInput {
  invoiceId: string;
  code: string;
  branchId?: string;
  amountDue: number;
  remainder: number;
  revenueAccountId: string;
  receivableAccountId?: string;
  payments: JournalPostSalePaymentLine[];
}

@Injectable()
export class JournalSalePublisher {
  private readonly logger = new Logger(JournalSalePublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(input: JournalPostSaleInput, actor: ActorContext): Promise<void> {
    const partitionKey = input.branchId ?? input.invoiceId;

    await this.eventPublisher.publish(
      ERP_TOPICS.JOURNAL_POST_SALE,
      {
        eventId: uuid(),
        eventType: DomainEventType.JOURNAL_POST_SALE_REQUESTED,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId: input.branchId,
        correlationId: input.invoiceId,
        payload: {
          invoiceId: input.invoiceId,
          code: input.code,
          branchId: input.branchId,
          amountDue: Number(input.amountDue),
          remainder: Number(input.remainder),
          revenueAccountId: input.revenueAccountId,
          receivableAccountId: input.receivableAccountId,
          payments: input.payments.map((p) => ({
            accountId: p.accountId,
            amount: Number(p.amount),
          })),
          organizationId: actor.organizationId,
          actorId: actor.userId,
        } satisfies JournalPostSalePayload,
      },
      partitionKey,
    );

    this.logger.log(
      `Published journal post event for invoice ${input.invoiceId} (key=${partitionKey})`,
    );
  }
}
