import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DomainEvent, StockMovementType } from '@erp/shared-interfaces';
import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { OnDomainEvent } from '../../events/decorators/on-event.decorator';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { resolveBranchItemLocations } from '../../pos/services/resolve-branch-item-locations';
import { StockLedgerEntryEntity } from '../ledger/stock-ledger-entry.entity';
import { ItemCostSnapshotService } from '../location/item-cost-snapshot.service';
import { InvoiceCancelledPayload } from '../../pos/publishers/invoice-cancelled.publisher';

const INVOICE_CANCEL_REFERENCE_TYPE = 'INVOICE_CANCEL';

/**
 * A line the customer had handed back on a return/exchange. Cancelling that
 * document gives the goods back to them, so the line leaves stock again —
 * the opposite of every line on a cancelled sale.
 */
function isReturnedLine(item: InvoiceCancelledPayload['items'][number]): boolean {
  return item.direction === 'IN';
}

function movementTypeFor(
  item: InvoiceCancelledPayload['items'][number],
): StockMovementType {
  return isReturnedLine(item)
    ? StockMovementType.SALE_ISSUE
    : StockMovementType.RETURN_IN;
}

/**
 * `referenceType` the forward movement of this line was filed under: goods that
 * came in were written by the return-in consumer, goods that went out by the
 * deduction consumer. Both key on the same invoice id, so the type is what
 * separates the two legs of an exchange carrying the same item.
 */
const SALE_REFERENCE_TYPE = 'INVOICE';
const RETURN_REFERENCE_TYPE = 'RETURN_INVOICE';

function forwardKey(item: InvoiceCancelledPayload['items'][number]): string {
  const referenceType = isReturnedLine(item)
    ? RETURN_REFERENCE_TYPE
    : SALE_REFERENCE_TYPE;
  return `${referenceType}:${item.itemId}`;
}

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
      // An exchange can carry the same item on both a returned (IN) and a sold
      // (OUT) line, so the movement type has to be part of the replay key —
      // without it the second leg reads as a duplicate of the first and is lost.
      const existing = await this.ledgerRepo.findOne({
        where: {
          referenceType: INVOICE_CANCEL_REFERENCE_TYPE,
          referenceId: invoiceId,
          itemId: item.itemId,
          movementType: movementTypeFor(item),
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

    // Reverse at the cost the original movement actually used, so quantity and
    // value both net to zero. `items.purchase_price` moves over time, and
    // snapshotting it again here would book the reversal at today's cost and
    // leave a residue in inventory valuation on a document whose quantity is
    // fully undone. Falls back to the snapshot when the forward entry is
    // missing (its event never landed, or the row predates this lookup).
    const forwardCostByKey = await this.forwardUnitCosts(
      invoiceId,
      organizationId,
    );
    const itemIds = Array.from(
      new Set(itemsToReturn.map((it) => it.itemId)),
    );
    const itemCostByItemId = await this.itemCostSnapshotService.snapshotCosts(
      organizationId,
      itemIds,
    );

    // Cancelled goods come back over the counter, so they land in the showroom
    // regardless of where they were picked from — an item sold out of the
    // warehouse would otherwise reappear in stock somewhere nobody can sell it.
    // Only the OUT lines need this: an IN line is walking back out of the exact
    // location the return put it into, which the payload already names.
    const inboundItemIds = itemsToReturn
      .filter((item) => !isReturnedLine(item))
      .map((item) => item.itemId);
    const locationByItemId = await resolveBranchItemLocations(
      this.ledgerRepo.manager,
      Array.from(new Set(inboundItemIds)),
      actor,
      { showroomOnly: true },
    );

    const movements = itemsToReturn
      .filter((item) => {
        if (isReturnedLine(item) || locationByItemId.has(item.itemId)) return true;
        this.logger.warn(
          `Stock return skipped for invoice ${invoiceId} item ${item.itemId}: ` +
            'no showroom location resolved for this branch',
        );
        return false;
      })
      .map((item) => {
        // A returned line goes back out to the customer, so it is a deduction —
        // the sign carries the direction, the movement type only labels it.
        const outbound = isReturnedLine(item);
        return {
          itemId: item.itemId,
          locationId: outbound
            ? item.locationId
            : locationByItemId.get(item.itemId)!,
          branchId,
          organizationId,
          movementType: movementTypeFor(item),
          quantity: outbound ? -item.quantity : item.quantity,
          referenceType: INVOICE_CANCEL_REFERENCE_TYPE,
          referenceId: invoiceId,
          actorContext: actor,
          unitCost:
            forwardCostByKey.get(forwardKey(item)) ??
            itemCostByItemId.get(item.itemId) ??
            0,
          // POS trả hàng (huỷ hoá đơn) không bị chặn bởi trạng thái ngừng hoạt động kho.
          skipInactiveStorageGuard: true,
        };
      });

    if (movements.length === 0) {
      return;
    }

    await this.stockLedgerService.recordBatchMovements(movements);

    this.logger.log(
      `Recorded ${movements.length} stock return movement(s) for cancelled invoice ${invoiceId}`,
    );
  }

  /** `${referenceType}:${itemId}` → the unit cost that movement was booked at. */
  private async forwardUnitCosts(
    invoiceId: string,
    organizationId: string,
  ): Promise<Map<string, number>> {
    const entries = await this.ledgerRepo.find({
      where: {
        referenceId: invoiceId,
        referenceType: In([SALE_REFERENCE_TYPE, RETURN_REFERENCE_TYPE]),
        organizationId,
      },
      select: ['referenceType', 'itemId', 'unitCost'],
    });

    const byKey = new Map<string, number>();
    for (const entry of entries) {
      if (entry.unitCost == null) continue;
      byKey.set(`${entry.referenceType}:${entry.itemId}`, Number(entry.unitCost));
    }
    return byKey;
  }
}
