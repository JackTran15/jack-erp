import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainEvent, StockMovementType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { StockLedgerEntryEntity } from '../ledger/stock-ledger-entry.entity';
import { ItemCostSnapshotService } from '../location/item-cost-snapshot.service';
import { InvoiceCancelledPayload } from '../../pos/publishers/invoice-cancelled.publisher';

const INVOICE_CANCEL_REFERENCE_TYPE = 'INVOICE_CANCEL';

@Injectable()
export class StockReturnConsumer {
  private readonly logger = new Logger(StockReturnConsumer.name);

  constructor(
    @InjectRepository(StockLedgerEntryEntity)
    private readonly ledgerRepo: Repository<StockLedgerEntryEntity>,
    private readonly stockLedgerService: StockLedgerService,
    private readonly itemCostSnapshotService: ItemCostSnapshotService,
  ) {}

  @OnDomainEvent(ERP_TOPICS.INVOICE_CANCELLED, { groupId: 'erp-api.invoice.cancelled.stock-return' })
  async handle(event: DomainEvent<InvoiceCancelledPayload>): Promise<void> {
    const { invoiceId, branchId, items, organizationId, actorId } = event.payload;

    if (!branchId) {
      this.logger.warn(`Stock return skipped for invoice ${invoiceId}: no branchId`);
      return;
    }

    const itemsToReturn: InvoiceCancelledPayload['items'] = [];
    for (const item of items) {
      const existing = await this.ledgerRepo.findOne({
        where: {
          referenceType: INVOICE_CANCEL_REFERENCE_TYPE,
          referenceId: invoiceId,
          itemId: item.itemId,
          organizationId,
        },
      });
      if (existing) {
        this.logger.log(
          `Skipped duplicate stock return for invoice ${invoiceId} item ${item.itemId}`,
        );
        continue;
      }
      itemsToReturn.push(item);
    }

    if (itemsToReturn.length === 0) {
      return;
    }

    const actor = { userId: actorId, organizationId, branchId, roles: [] };

    // Snapshot purchase_price for the items returning to stock. The cancel
    // event payload has no price, so we fall back to `items.purchase_price`
    // (same policy as the Task 1 backfill rule).
    const itemIds = Array.from(
      new Set(itemsToReturn.map((it) => it.itemId)),
    );
    const itemCostByItemId = await this.itemCostSnapshotService.snapshotCosts(
      organizationId,
      itemIds,
    );

    const movements = itemsToReturn.map((item) => ({
      itemId: item.itemId,
      locationId: item.locationId,
      branchId,
      organizationId,
      movementType: StockMovementType.RETURN_IN,
      quantity: item.quantity,
      referenceType: INVOICE_CANCEL_REFERENCE_TYPE,
      referenceId: invoiceId,
      actorContext: actor,
      unitCost: itemCostByItemId.get(item.itemId) ?? 0,
      // POS trả hàng (huỷ hoá đơn) không bị chặn bởi trạng thái ngừng hoạt động kho.
      skipInactiveStorageGuard: true,
    }));

    await this.stockLedgerService.recordBatchMovements(movements);

    this.logger.log(
      `Recorded ${movements.length} stock return movement(s) for cancelled invoice ${invoiceId}`,
    );
  }

}
