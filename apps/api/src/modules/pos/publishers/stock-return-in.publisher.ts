import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DomainEventType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export interface StockReturnInLine {
  itemId: string;
  locationId: string;
  quantity: number;
}

export interface StockReturnInPayload {
  returnInvoiceId: string;
  returnInvoiceCode: string;
  branchId: string;
  organizationId: string;
  lines: StockReturnInLine[];
  actorId: string;
}

@Injectable()
export class StockReturnInPublisher {
  private readonly logger = new Logger(StockReturnInPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(
    returnInvoiceId: string,
    returnInvoiceCode: string,
    branchId: string,
    lines: StockReturnInLine[],
    actor: ActorContext,
  ): Promise<void> {
    await this.eventPublisher.publish(
      ERP_TOPICS.STOCK_RETURN_IN,
      {
        eventId: uuid(),
        eventType: DomainEventType.STOCK_RETURN_IN_REQUESTED,
        timestamp: new Date().toISOString(),
        organizationId: actor.organizationId,
        branchId,
        correlationId: returnInvoiceId,
        payload: {
          returnInvoiceId,
          returnInvoiceCode,
          branchId,
          organizationId: actor.organizationId,
          lines,
          actorId: actor.userId,
        } satisfies StockReturnInPayload,
      },
      returnInvoiceId,
    );

    this.logger.log(
      `Published stock return-in event for ${returnInvoiceCode} (${lines.length} line(s))`,
    );
  }
}
