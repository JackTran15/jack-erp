import { Injectable, Logger } from '@nestjs/common';
import {
  DomainEvent,
  TempWarehouseInvoiceFulfillRequestedPayload,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { TempWarehouseService } from '../temp-warehouse.service';

/**
 * Consumes checkout fulfillment events and auto-transfers staged stock
 * (warehouse -> showroom) for the sold items. Idempotency (processed_events keyed
 * on eventId=invoiceId), retry, and DLQ are handled by EventConsumerManager; the
 * service additionally no-ops when there is no ACTIVE session / no staged line and
 * skips when the invoice already consumed staged stock.
 */
@Injectable()
export class TempWarehouseFulfillConsumer {
  private readonly logger = new Logger(TempWarehouseFulfillConsumer.name);

  constructor(private readonly tempWarehouseService: TempWarehouseService) {}

  @OnDomainEvent(ERP_TOPICS.TEMP_WAREHOUSE_INVOICE_FULFILL)
  async handle(
    event: DomainEvent<TempWarehouseInvoiceFulfillRequestedPayload>,
  ): Promise<void> {
    const p = event.payload;
    this.logger.log(
      `Processing fulfill event ${event.eventId} (invoice=${p.invoiceId}, lines=${p.lines.length})`,
    );

    const actor: ActorContext = {
      userId: p.actor.userId,
      organizationId: p.actor.organizationId,
      branchId: p.actor.branchId,
      roles: p.actor.roles ?? [],
    };

    await this.tempWarehouseService.fulfillInvoiceFromTempWarehouse(p, actor);
  }
}
