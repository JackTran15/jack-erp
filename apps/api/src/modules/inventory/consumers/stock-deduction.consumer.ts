import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainEvent, StockMovementType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { StockLedgerEntryEntity } from '../ledger/stock-ledger-entry.entity';
import { ItemCostSnapshotService } from '../location/item-cost-snapshot.service';
import {
  StockDeductionPayload,
} from '../publishers/stock-deduction.publisher';

const INVOICE_REFERENCE_TYPE = 'INVOICE';

@Injectable()
export class StockDeductionConsumer {
  private readonly logger = new Logger(StockDeductionConsumer.name);

  constructor(
    @InjectRepository(StockLedgerEntryEntity)
    private readonly ledgerRepo: Repository<StockLedgerEntryEntity>,
    private readonly stockLedgerService: StockLedgerService,
    private readonly itemCostSnapshotService: ItemCostSnapshotService,
  ) {}

  @OnDomainEvent(ERP_TOPICS.STOCK_DEDUCTION)
  async handle(event: DomainEvent<StockDeductionPayload>): Promise<void> {
    this.logger.log(`Received stock deduction event: ${JSON.stringify(event)}`);
    const { invoiceId, itemId, locationId, quantity, branchId, organizationId, actorId } =
      event.payload;

    const existing = await this.ledgerRepo.findOne({
      where: {
        referenceType: INVOICE_REFERENCE_TYPE,
        referenceId: invoiceId,
        itemId,
        organizationId,
      },
    });

    if (existing) {
      this.logger.log(
        `Skipped duplicate stock deduction for invoice ${invoiceId} item ${itemId}`,
      );
      return;
    }

    // The event payload does not include a unit price (POS publishes a sparse
    // movement). Snapshot `items.purchase_price` at consume time — same policy
    // as the Task 1 backfill — so the ledger row carries a meaningful cost
    // basis for downstream reporting.
    const unitCost = await this.itemCostSnapshotService.snapshotOne(
      organizationId,
      itemId,
    );

    await this.stockLedgerService.recordBatchMovements([
      {
        itemId,
        locationId,
        branchId,
        organizationId,
        movementType: StockMovementType.SALE_ISSUE,
        quantity: -Number(quantity),
        referenceType: INVOICE_REFERENCE_TYPE,
        referenceId: invoiceId,
        actorContext: {
          userId: actorId,
          organizationId,
          branchId,
          roles: [],
        },
        unitCost,
        skipInactiveStorageGuard: true,
      },
    ]);

    this.logger.log(
      `Recorded stock deduction for invoice ${invoiceId} item ${itemId} qty=${quantity}`,
    );
  }
}
