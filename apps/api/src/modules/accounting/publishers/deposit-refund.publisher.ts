import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface DepositRefundPayload {
  returnInvoiceId: string;
  returnInvoiceCode: string;
  depositAccountId: string;
  contraAccountId: string;
  amount: number;
  docDate: string;
  branchId?: string;
  organizationId: string;
  actorId: string;
}

export interface DepositRefundInput {
  returnInvoiceId: string;
  returnInvoiceCode: string;
  depositAccountId: string;
  contraAccountId: string;
  amount: number;
  docDate: string;
  branchId?: string;
}

@Injectable()
export class DepositRefundPublisher {
  private readonly logger = new Logger(DepositRefundPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(input: DepositRefundInput, actor: ActorContext): Promise<void> {
    await this.eventPublisher.publish(
      ERP_TOPICS.DEPOSIT_REFUND,
      {
        eventId: uuid(),
        eventType: DomainEventType.DEPOSIT_REFUND_REQUESTED,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId: input.branchId,
        correlationId: input.returnInvoiceId,
        payload: {
          returnInvoiceId: input.returnInvoiceId,
          returnInvoiceCode: input.returnInvoiceCode,
          depositAccountId: input.depositAccountId,
          contraAccountId: input.contraAccountId,
          amount: Number(input.amount),
          docDate: input.docDate,
          branchId: input.branchId,
          organizationId: actor.organizationId,
          actorId: actor.userId,
        } satisfies DepositRefundPayload,
      },
      input.depositAccountId,
    );

    this.logger.log(
      `Published deposit refund event for ${input.returnInvoiceCode} (depositAccount=${input.depositAccountId}, amount=${input.amount})`,
    );
  }
}
