import { EntityManager } from 'typeorm';
import type { AppliedProgram } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InvoiceItemEntity } from '../../entities/invoice-item.entity';
import { InvoiceCheckoutPromotionEntity } from './invoice-checkout-promotion.entity';

const round = (v: number): number => Math.round(v * 100) / 100;

export interface PersistAppliedPromotionsInput {
  actor: ActorContext;
  invoiceId: string;
  /** The lines the engine was given — a `lineId` outside this set is ignored. */
  items: InvoiceItemEntity[];
  appliedPrograms: AppliedProgram[];
}

/**
 * Writes what the promotion engine decided for one invoice, inside the caller's
 * transaction: the per-line `promotion_discount` and one audit row per applied
 * programme in `invoice_checkout_promotions`.
 *
 * Extracted from `PersistInvoiceStep` (2026092102 ADR-02) so a sale posted
 * through the checkout saga and an exchange posted through
 * `CheckoutReturnService` leave the same snapshot — two copies of this
 * would drift in exactly the way that is hardest to notice.
 *
 * The per-line value and the jsonb allocation carry the same numbers on
 * purpose: the column is what every downstream consumer reads (above all the
 * return refund), the jsonb is the per-programme snapshot used on reprint.
 * Does NOT touch `lineTotal`: `subtotal = SUM(lineTotal)` is an invariant
 * several reports depend on.
 */
export async function persistAppliedPromotions(
  manager: EntityManager,
  { actor, invoiceId, items, appliedPrograms }: PersistAppliedPromotionsInput,
): Promise<void> {
  if (appliedPrograms.length === 0) return;

  // Summed, not assigned: several programmes can discount the same line.
  const byLineId = new Map<string, number>();
  for (const program of appliedPrograms) {
    for (const ld of program.lineDiscounts ?? []) {
      byLineId.set(ld.lineId, (byLineId.get(ld.lineId) ?? 0) + Number(ld.discountAmount ?? 0));
    }
  }
  const touched = items.filter((item) => byLineId.has(item.id));
  for (const item of touched) {
    item.promotionDiscount = round(byLineId.get(item.id)!);
  }
  if (touched.length > 0) {
    await manager.save(touched);
  }

  const promotionRepo = manager.getRepository(InvoiceCheckoutPromotionEntity);
  const snapshotRows = appliedPrograms.map((program) =>
    promotionRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      invoiceId,
      programId: program.programId,
      code: program.code,
      name: program.name,
      type: program.type,
      priority: program.priority,
      discountAmount: round(program.discountAmount),
      lineDiscounts: program.lineDiscounts,
      gifts: program.gifts,
    }),
  );
  await promotionRepo.save(snapshotRows);
}
