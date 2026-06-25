import { Injectable, Logger } from '@nestjs/common';
import { DomainEventType } from '@erp/shared-interfaces';
import type { TempWarehouseInvoiceFulfillRequestedPayload } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { EventPublisher } from '../../events/event-publisher.service';

/**
 * Published by checkout for every posted invoice so the temp-warehouse
 * fulfillment consumer can auto-transfer staged stock (warehouse -> showroom)
 * for the sold items. eventId is the invoiceId — deterministic so replays of the
 * same checkout dedupe in processed_events and never create a second transfer.
 */
@Injectable()
export class TempWarehouseFulfillPublisher {
  private readonly logger = new Logger(TempWarehouseFulfillPublisher.name);

  constructor(private readonly eventPublisher: EventPublisher) {}

  async publish(
    payload: TempWarehouseInvoiceFulfillRequestedPayload,
  ): Promise<void> {
    await this.eventPublisher.publish(
      ERP_TOPICS.TEMP_WAREHOUSE_INVOICE_FULFILL,
      {
        eventId: payload.invoiceId,
        eventType: DomainEventType.TEMP_WAREHOUSE_INVOICE_FULFILL_REQUESTED,
        timestamp: new Date().toISOString(),
        organizationId: payload.organizationId,
        branchId: payload.branchId,
        correlationId: payload.invoiceId,
        payload,
      },
      payload.invoiceId,
    );

    this.logger.log(
      `Published temp-warehouse fulfill event for invoice ${payload.invoiceId} (${payload.lines.length} line(s))`,
    );
  }
}
