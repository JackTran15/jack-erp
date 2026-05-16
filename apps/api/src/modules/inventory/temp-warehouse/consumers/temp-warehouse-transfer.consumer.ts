import { Injectable, Logger } from '@nestjs/common';
import {
  DomainEvent,
  TempWarehouseDirection,
  TempWarehouseSessionStatus,
  TempWarehouseTransferRequestedPayload,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { StockTransferService } from '../../transfer/stock-transfer.service';
import { TempWarehouseService } from '../temp-warehouse.service';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

/**
 * Consumes session-close events for the CREATE_TRANSFERS mode and turns each event
 * into a real StockTransfer (create → approve → post). Idempotency, retry, and DLQ
 * are handled by EventConsumerManager. The handler also short-circuits if the
 * direction's transferId is already set on the session (race / replay defense).
 */
@Injectable()
export class TempWarehouseTransferConsumer {
  private readonly logger = new Logger(TempWarehouseTransferConsumer.name);

  constructor(
    private readonly stockTransferService: StockTransferService,
    private readonly tempWarehouseService: TempWarehouseService,
  ) {}

  @OnDomainEvent(ERP_TOPICS.TEMP_WAREHOUSE_TRANSFER_REQUESTED)
  async handle(event: DomainEvent<TempWarehouseTransferRequestedPayload>): Promise<void> {
    const p = event.payload;
    this.logger.log(
      `Processing event ${event.eventId} (session=${p.sessionId}, direction=${p.direction}, lines=${p.lines.length})`,
    );

    const session = await this.tempWarehouseService.findSessionForConsumer(
      p.sessionId,
      p.organizationId,
    );
    if (!session) {
      // Session was deleted or org mismatch. Throw to route the event to DLQ.
      throw new Error(`Session ${p.sessionId} not found — routing to DLQ`);
    }
    if (session.status !== TempWarehouseSessionStatus.CLOSED) {
      throw new Error(
        `Session ${p.sessionId} is not CLOSED (current=${session.status})`,
      );
    }

    // Defensive idempotency: direction already has a transferId → skip the create flow.
    const existingTransferId =
      p.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM
        ? session.transferW2sId
        : session.transferS2wId;
    if (existingTransferId) {
      this.logger.warn(
        `Session ${p.sessionId} direction=${p.direction} already has transfer ${existingTransferId} — skipping`,
      );
      // Re-run the completion check in case both directions are done but status wasn't moved yet.
      await this.tempWarehouseService.markTransferCompleted(
        p.sessionId,
        p.direction,
        existingTransferId,
      );
      return;
    }

    const actor: ActorContext = {
      userId: p.actor.userId,
      organizationId: p.actor.organizationId,
      branchId: p.actor.branchId,
      roles: p.actor.roles ?? [],
    };

    try {
      const transfer = await this.stockTransferService.create(
        {
          sourceLocationId: p.sourceLocationId,
          destinationLocationId: p.destinationLocationId,
          sourceBranchId: p.sourceBranchId,
          destinationBranchId: p.destinationBranchId,
          notes: `From temp warehouse session ${p.sessionId}`,
          lines: p.lines.map((l) => ({
            itemId: l.itemId,
            quantity: Number(l.quantity),
          })),
        },
        actor,
      );
      await this.stockTransferService.approve(transfer.id, actor);
      await this.stockTransferService.post(transfer.id, actor);

      await this.tempWarehouseService.markTransferCompleted(
        p.sessionId,
        p.direction,
        transfer.id,
      );

      this.logger.log(
        `Session ${p.sessionId} direction=${p.direction} → transfer ${transfer.id} POSTED`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to create transfer for session=${p.sessionId} direction=${p.direction}: ${msg}`,
        err instanceof Error ? err.stack : undefined,
      );
      // Best-effort: mark session FAILED so the operator sees what happened. If DLQ retries
      // eventually exhaust, this status will remain for manual recovery.
      await this.tempWarehouseService.markTransferFailed(p.sessionId, msg);
      throw err;
    }
  }
}
