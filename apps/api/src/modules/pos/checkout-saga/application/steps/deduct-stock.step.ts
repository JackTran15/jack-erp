import { Injectable } from '@nestjs/common';
import { StockMovementType } from '@erp/shared-interfaces';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import {
  StockLedgerService,
  RecordMovementParams,
} from '../../../../inventory/ledger/stock-ledger.service';
import { ItemCostSnapshotService } from '../../../../inventory/location/item-cost-snapshot.service';

const INVOICE_REFERENCE_TYPE = 'INVOICE';

/**
 * Deducts stock for every line, inline, in one batch call. Parity target:
 * `stock-deduction.consumer.ts`, minus the two things that only make sense
 * for an out-of-band consumer:
 *
 * - No duplicate-check read before writing. The consumer needs one because it
 *   may replay the same event; here, the whole invoice is one write inside
 *   one transaction — either all of it lands, or none of it does. There is no
 *   partial state to guard against (bug (d) in 00-intent.md: the old
 *   publisher looped per item with no wrapper, so a 5-line invoice failing on
 *   line 3 left exactly 2 lines deducted).
 * - Cost snapshots are batched: collect the distinct `itemId`s across all
 *   lines and call `snapshotOne` once per item, not once per line — a 5-line
 *   invoice repeating the same item would otherwise snapshot it 5 times.
 *
 * `skipInactiveStorageGuard: true` for the same reason the consumer sets it —
 * this is a POS sale flow, which must still be able to sell down existing
 * stock at a location whose storage was deactivated after the sale began.
 *
 * Gift lines (T-04-04, closes assumption A-20 of `promotion-programs-engine`)
 * are deducted here too — with no code change needed. `persist-invoice`
 * (an earlier step) appends gift `InvoiceItemEntity` rows to this very
 * `ctx.items` array before this step runs, so they are indistinguishable from
 * ordinary lines by the time this step reads them: `SALE_ISSUE`, negative
 * quantity, and a real `unitCost` from `snapshotOne` (a gift has a cost, it
 * just has no revenue — that is enforced upstream, by `persist-invoice`
 * writing `unitPrice = 0` / `lineTotal = 0` on the line, not by anything
 * here). `ctx.items` is the single source for this step; `ctx.promotion`
 * (the engine's own gift proposals) is never read here, so a gift line can
 * never be deducted twice from two different sources.
 */
@Injectable()
export class DeductStockStep implements CheckoutStep {
  readonly name = 'deduct-stock';
  readonly phase = 'transactional' as const;

  constructor(
    private readonly stockLedgerService: StockLedgerService,
    private readonly itemCostSnapshotService: ItemCostSnapshotService,
  ) {}

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;

    const manager = requireManager(ctx, this.name);
    const invoice = ctx.invoice;
    const items = ctx.items;
    if (!invoice || !items) {
      throw new Error(
        'deduct-stock ran before its prerequisite steps populated the context',
      );
    }

    const uniqueItemIds = [...new Set(items.map((item) => item.itemId))];
    const unitCosts = new Map<string, number>();
    for (const itemId of uniqueItemIds) {
      unitCosts.set(
        itemId,
        await this.itemCostSnapshotService.snapshotOne(
          ctx.actor.organizationId,
          itemId,
        ),
      );
    }

    const movements: RecordMovementParams[] = items.map((item) => ({
      itemId: item.itemId,
      locationId: item.locationId!,
      branchId: invoice.branchId!,
      organizationId: ctx.actor.organizationId,
      movementType: StockMovementType.SALE_ISSUE,
      quantity: -Number(item.quantity),
      referenceType: INVOICE_REFERENCE_TYPE,
      referenceId: invoice.id,
      actorContext: ctx.actor,
      unitCost: unitCosts.get(item.itemId),
      skipInactiveStorageGuard: true,
    }));

    await this.stockLedgerService.recordBatchMovements(movements, manager);
  }
}
