import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DomainEvent, StockMovementType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { StockLedgerEntryEntity } from '../ledger/stock-ledger-entry.entity';
import { ItemCostSnapshotService } from '../location/item-cost-snapshot.service';
import { StockReturnInPayload } from '../../pos/publishers/stock-return-in.publisher';

const RETURN_INVOICE_REFERENCE_TYPE = 'RETURN_INVOICE';

@Injectable()
export class StockReturnInConsumer {
  private readonly logger = new Logger(StockReturnInConsumer.name);

  constructor(
    @InjectRepository(StockLedgerEntryEntity)
    private readonly ledgerRepo: Repository<StockLedgerEntryEntity>,
    private readonly stockLedgerService: StockLedgerService,
    private readonly itemCostSnapshotService: ItemCostSnapshotService,
  ) {}

  @OnDomainEvent(ERP_TOPICS.STOCK_RETURN_IN, {
    groupId: 'erp-api.return.stock-return-in',
  })
  async handle(event: DomainEvent<StockReturnInPayload>): Promise<void> {
    const { returnInvoiceId, returnInvoiceCode, branchId, lines, organizationId, actorId } =
      event.payload;

    if (!branchId) {
      this.logger.warn(
        `Stock return-in skipped for ${returnInvoiceCode}: no branchId`,
      );
      return;
    }

    const toApply: StockReturnInPayload['lines'] = [];
    for (const line of lines) {
      const existing = await this.ledgerRepo.findOne({
        where: {
          referenceType: RETURN_INVOICE_REFERENCE_TYPE,
          referenceId: returnInvoiceId,
          itemId: line.itemId,
          organizationId,
        },
      });
      if (existing) {
        this.logger.log(
          `Skipped duplicate stock return-in for ${returnInvoiceCode} item ${line.itemId}`,
        );
        continue;
      }
      toApply.push(line);
    }

    if (toApply.length === 0) return;

    const actor = { userId: actorId, organizationId, branchId, roles: [] };

    // Snapshot purchase_price for each returning item — return-in payload has
    // no unit price column, so we use items.purchase_price as the cost basis.
    const itemIds = Array.from(new Set(toApply.map((l) => l.itemId)));
    const itemCostByItemId = await this.itemCostSnapshotService.snapshotCosts(
      organizationId,
      itemIds,
    );

    const movements = toApply.map((line) => ({
      itemId: line.itemId,
      locationId: line.locationId,
      branchId,
      organizationId,
      movementType: StockMovementType.RETURN_IN,
      quantity: Number(line.quantity),
      referenceType: RETURN_INVOICE_REFERENCE_TYPE,
      referenceId: returnInvoiceId,
      actorContext: actor,
      unitCost: itemCostByItemId.get(line.itemId) ?? 0,
    }));

    await this.stockLedgerService.recordBatchMovements(movements);

    this.logger.log(
      `Recorded ${movements.length} stock return-in movement(s) for ${returnInvoiceCode}`,
    );
  }

}
