import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface InvoiceCancelledItem {
  itemId: string;
  locationId: string;
  quantity: number;
}

export interface InvoiceCancelledPayload {
  invoiceId: string;
  documentNumber: string;
  reason: string;
  branchId?: string;
  items: InvoiceCancelledItem[];
  organizationId: string;
  actorId: string;
}

export interface InvoiceCancelledInput {
  invoiceId: string;
  documentNumber: string;
  reason: string;
  branchId?: string;
  items: InvoiceCancelledItem[];
}

@Injectable()
export class InvoiceCancelledPublisher {
  private readonly logger = new Logger(InvoiceCancelledPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(input: InvoiceCancelledInput, actor: ActorContext): Promise<void> {
    await this.eventPublisher.publish(
      ERP_TOPICS.INVOICE_CANCELLED,
      {
        eventId: uuid(),
        eventType: DomainEventType.INVOICE_CANCELLED,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId: input.branchId,
        correlationId: input.invoiceId,
        payload: {
          invoiceId: input.invoiceId,
          documentNumber: input.documentNumber,
          reason: input.reason,
          branchId: input.branchId,
          items: input.items,
          organizationId: actor.organizationId,
          actorId: actor.userId,
        } satisfies InvoiceCancelledPayload,
      },
      input.invoiceId,
    );

    this.logger.log(
      `Published invoice cancelled event for ${input.invoiceId} (${input.items.length} items)`,
    );
  }
}
