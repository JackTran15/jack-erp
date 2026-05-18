import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface ReturnPostedPayload {
  returnInvoiceId: string;
  returnInvoiceCode: string;
  type: 'RETURN' | 'EXCHANGE';
  customerId?: string;
  branchId?: string;
  organizationId: string;
  actorId: string;
}

export interface ReturnPostedInput {
  returnInvoiceId: string;
  returnInvoiceCode: string;
  type: 'RETURN' | 'EXCHANGE';
  customerId?: string;
  branchId?: string;
}

@Injectable()
export class ReturnPostedPublisher {
  private readonly logger = new Logger(ReturnPostedPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(input: ReturnPostedInput, actor: ActorContext): Promise<void> {
    await this.eventPublisher.publish(
      ERP_TOPICS.RETURN_POSTED,
      {
        eventId: uuid(),
        eventType: DomainEventType.RETURN_POSTED,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId: input.branchId,
        correlationId: input.returnInvoiceId,
        payload: {
          returnInvoiceId: input.returnInvoiceId,
          returnInvoiceCode: input.returnInvoiceCode,
          type: input.type,
          customerId: input.customerId,
          branchId: input.branchId,
          organizationId: actor.organizationId,
          actorId: actor.userId,
        } satisfies ReturnPostedPayload,
      },
      input.returnInvoiceId,
    );

    this.logger.log(
      `Published ${input.type} posted event for invoice ${input.returnInvoiceCode}`,
    );
  }
}
