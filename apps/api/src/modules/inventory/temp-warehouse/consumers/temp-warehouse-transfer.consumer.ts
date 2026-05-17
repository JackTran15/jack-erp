import { Injectable, Logger } from '@nestjs/common';
import {
  DomainEvent,
  TempWarehouseDirection,
  TempWarehouseLineStatus,
  TempWarehouseSessionStatus,
  TempWarehouseTransferKind,
  TempWarehouseTransferRequestedPayload,
} from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../../events/decorators/on-event.decorator';
import { StockTransferService } from '../../transfer/stock-transfer.service';
import { TempWarehouseService } from '../temp-warehouse.service';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

/**
 * Consumes temp-warehouse transfer events and materializes each into a real StockTransfer
 * (create → approve → post). Idempotency, retry, and DLQ are handled by EventConsumerManager.
 *
 * Two flavors share this topic:
 *   - kind=FULL (or undefined): emitted by closeSession(CREATE_TRANSFERS). Session must be CLOSED;
 *     consumer updates session.transferW2sId / transferS2wId and the processing status.
 *   - kind=PARTIAL: emitted by transferLines. Session must be ACTIVE; consumer flips the listed
 *     lines to TRANSFERRED and records the transferId per line. Session-level fields are untouched.
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
    const kind = p.kind ?? TempWarehouseTransferKind.FULL;
    this.logger.log(
      `Processing event ${event.eventId} (kind=${kind}, session=${p.sessionId}, direction=${p.direction}, lines=${p.lines.length})`,
    );

    const session = await this.tempWarehouseService.findSessionForConsumer(
      p.sessionId,
      p.organizationId,
    );
    if (!session) {
      throw new Error(`Session ${p.sessionId} not found — routing to DLQ`);
    }

    const actor: ActorContext = {
      userId: p.actor.userId,
      organizationId: p.actor.organizationId,
      branchId: p.actor.branchId,
      roles: p.actor.roles ?? [],
    };

    if (kind === TempWarehouseTransferKind.PARTIAL) {
      await this.handlePartial(p, session, actor);
      return;
    }

    await this.handleFull(p, session, actor);
  }

  private async handleFull(
    p: TempWarehouseTransferRequestedPayload,
    session: NonNullable<
      Awaited<ReturnType<TempWarehouseService['findSessionForConsumer']>>
    >,
    actor: ActorContext,
  ): Promise<void> {
    if (session.status !== TempWarehouseSessionStatus.CLOSED) {
      throw new Error(
        `Session ${p.sessionId} is not CLOSED (current=${session.status})`,
      );
    }

    const existingTransferId =
      p.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM
        ? session.transferW2sId
        : session.transferS2wId;
    if (existingTransferId) {
      this.logger.warn(
        `Session ${p.sessionId} direction=${p.direction} already has transfer ${existingTransferId} — skipping`,
      );
      await this.tempWarehouseService.markTransferCompleted(
        p.sessionId,
        p.direction,
        existingTransferId,
      );
      return;
    }

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
      await this.tempWarehouseService.markTransferFailed(p.sessionId, msg);
      throw err;
    }
  }

  private async handlePartial(
    p: TempWarehouseTransferRequestedPayload,
    session: NonNullable<
      Awaited<ReturnType<TempWarehouseService['findSessionForConsumer']>>
    >,
    actor: ActorContext,
  ): Promise<void> {
    if (session.status !== TempWarehouseSessionStatus.ACTIVE) {
      throw new Error(
        `Partial transfer requires ACTIVE session ${p.sessionId} (current=${session.status})`,
      );
    }

    const lineIds = p.lines.map((l) => l.tempWarehouseLineId);
    const existing = await this.tempWarehouseService.findLinesByIds(
      lineIds,
      p.organizationId,
    );

    // Defensive replay: if every input line is already TRANSFERRED with the same transferId, this is a re-delivery.
    const alreadyTransferred = existing.filter(
      (l) => l.status === TempWarehouseLineStatus.TRANSFERRED,
    );
    if (
      alreadyTransferred.length === lineIds.length &&
      alreadyTransferred.length > 0
    ) {
      const firstTransferId = alreadyTransferred[0].transferId;
      const allSameTransfer = alreadyTransferred.every(
        (l) => l.transferId && l.transferId === firstTransferId,
      );
      if (allSameTransfer) {
        this.logger.warn(
          `Partial transfer event ${session.id}/${p.direction} → all ${lineIds.length} lines already TRANSFERRED with transfer ${firstTransferId} — skipping`,
        );
        return;
      }
    }

    const transfer = await this.stockTransferService.create(
      {
        sourceLocationId: p.sourceLocationId,
        destinationLocationId: p.destinationLocationId,
        sourceBranchId: p.sourceBranchId,
        destinationBranchId: p.destinationBranchId,
        notes: p.notes ?? `Partial from temp warehouse session ${p.sessionId}`,
        lines: p.lines.map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.quantity),
        })),
      },
      actor,
    );
    await this.stockTransferService.approve(transfer.id, actor);
    await this.stockTransferService.post(transfer.id, actor);

    await this.tempWarehouseService.markLinesTransferred(
      p.sessionId,
      lineIds,
      transfer.id,
      p.organizationId,
    );

    this.logger.log(
      `Partial transfer: session ${p.sessionId} direction=${p.direction} → transfer ${transfer.id} POSTED; ${lineIds.length} lines flipped to TRANSFERRED`,
    );
  }
}
