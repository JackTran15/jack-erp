import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface StockDeductionPayload {
  invoiceId: string;
  itemId: string;
  locationId: string;
  quantity: number;
  branchId: string;
  organizationId: string;
  actorId: string;
}

export interface StockDeductionItem {
  itemId: string;
  locationId: string;
  quantity: number;
}

@Injectable()
export class StockDeductionPublisher {
  private readonly logger = new Logger(StockDeductionPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(
    invoiceId: string,
    items: StockDeductionItem[],
    branchId: string,
    actor: ActorContext,
  ): Promise<void> {
    for (const item of items) {
      await this.eventPublisher.publish(
        ERP_TOPICS.STOCK_DEDUCTION,
        {
          eventId: uuid(),
          eventType: DomainEventType.STOCK_DEDUCTION_REQUESTED,
          timestamp: new Date().toISOString(),
          organizationId: actor.organizationId,
          branchId,
          correlationId: invoiceId,
          payload: {
            invoiceId,
            itemId: item.itemId,
            locationId: item.locationId,
            quantity: item.quantity,
            branchId,
            organizationId: actor.organizationId,
            actorId: actor.userId,
          } satisfies StockDeductionPayload,
        },
        item.itemId,
      );
    }

    this.logger.log(
      `Published ${items.length} stock deduction event(s) for invoice ${invoiceId}`,
    );
  }
}
