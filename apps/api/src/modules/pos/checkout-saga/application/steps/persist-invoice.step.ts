import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import type { AppliedProgram, GiftOffer } from '@erp/shared-interfaces';
import { PromotionGiftMode } from '@erp/shared-interfaces';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import { InvoiceEntity } from '../../../entities/invoice.entity';
import { InvoiceItemEntity, ItemDirection } from '../../../entities/invoice-item.entity';
import { ItemEntity } from '../../../../inventory/location/item.entity';
import { MembershipCardService } from '../../../../customer/services/membership-card.service';
import { resolveBranchItemLocations } from '../../../services/resolve-branch-item-locations';
import { InvoiceCheckoutPromotionEntity } from '../../infrastructure/invoice-checkout-promotion.entity';

const round = (v: number): number => Math.round(v * 100) / 100;

/**
 * Writes the invoice header, gift lines and the promotion snapshot. Parity
 * target: checkout-invoice.service.ts:232-263 (v1 has neither gifts nor
 * promotions, so those two are new behaviour, not a parity copy).
 *
 * `pointsBalanceAfter` must be read **before** `redeem-points` (a later step)
 * — same reasoning as the original: it locks and reads the card balance, then
 * `redeem-points` re-validates that same balance and throws if it's
 * insufficient, rolling back the whole checkout. A projection made from a
 * balance too small can therefore never be committed; reading it first is
 * safe.
 */
@Injectable()
export class PersistInvoiceStep implements CheckoutStep {
  readonly name = 'persist-invoice';
  readonly phase = 'transactional' as const;

  constructor(
    private readonly membershipCardService: MembershipCardService,
  ) {}

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;

    const manager = requireManager(ctx, this.name);
    const invoice = ctx.invoice;
    const totals = ctx.totals;
    const items = ctx.items;
    if (!invoice || !totals || !items) {
      throw new Error(
        'persist-invoice ran before its prerequisite steps populated the context',
      );
    }

    invoice.isDraft = false;
    invoice.status = totals.newStatus;
    invoice.issuedAt = new Date();
    invoice.code = ctx.documentNumber!;
    invoice.subtotal = totals.subtotal;
    // Two independent sources of discount, added once each: what the cashier
    // typed on the draft (manualDiscountAmount) plus what the promotion
    // engine computed (promotionDiscount, zero until a program actually
    // applies). Neither ever folds the other in — compute-totals is the only
    // place either number is derived — so summing them here cannot double-count.
    invoice.discountAmount = round(
      Number(totals.manualDiscountAmount) + Number(totals.promotionDiscount),
    );
    invoice.depositAmount = totals.depositAmount;
    invoice.amountDue = totals.amountDue;
    invoice.totalPaid = totals.totalPaid;
    invoice.keptChangeAmount = totals.keptChange;
    // No customer, no points — same rule as v1 (checkout-invoice.service). The
    // award publisher refuses to emit without a customerId, so a non-zero figure
    // here is an orphan: the receipt showed "Điểm được tích" while no card was
    // credited and no point_history row existed. `pointsBalanceAfter` just below
    // has always been guarded this way; only the earn was left open. `pointsBlocked`
    // (ADR-02) is the second, independent reason to zero this out: at least one
    // applied program had "Tích điểm cho khách hàng" unchecked.
    invoice.pointsEarned = invoice.customerId && !totals.pointsBlocked ? totals.pointsEarned : 0;

    const cardBalance = invoice.customerId
      ? await this.membershipCardService.getPointBalanceForUpdate(
          invoice.customerId,
          manager,
          ctx.actor,
        )
      : null;
    invoice.pointsBalanceAfter =
      cardBalance == null
        ? null
        : Math.max(
            0,
            cardBalance - Number(invoice.pointsRedeemed ?? 0) + totals.pointsEarned,
          );

    await manager.getRepository(InvoiceEntity).save(invoice);

    await this.persistGifts(ctx, manager, invoice, items);
    await this.persistLinePromotionDiscounts(ctx, manager, items);
    await this.persistPromotionSnapshot(ctx, manager, invoice);
  }

  /**
   * Writes the engine's per-line allocation onto the lines themselves.
   *
   * The same numbers also go into `invoice_checkout_promotions.line_discounts`
   * just below, and the duplication is deliberate: the jsonb is a per-programme
   * snapshot used when reprinting an invoice, while this column is the per-line
   * value every downstream consumer needs — above all the return refund, which
   * used to read the gross `lineTotal` and pay out more cash than the customer
   * ever handed over. Keeping both writes adjacent so a change to one is
   * visible next to the other.
   *
   * Does NOT touch `lineTotal`: `subtotal = SUM(lineTotal)` is an invariant
   * several reports depend on (see the entity comment and ADR-01).
   */
  private async persistLinePromotionDiscounts(
    ctx: CheckoutContext,
    manager: EntityManager,
    items: InvoiceItemEntity[],
  ): Promise<void> {
    const appliedPrograms = (ctx.promotion?.appliedPrograms ?? []) as AppliedProgram[];
    if (appliedPrograms.length === 0) return;

    // Summed, not assigned: several programmes can discount the same line.
    const byLineId = new Map<string, number>();
    for (const program of appliedPrograms) {
      for (const ld of program.lineDiscounts ?? []) {
        byLineId.set(ld.lineId, (byLineId.get(ld.lineId) ?? 0) + Number(ld.discountAmount ?? 0));
      }
    }
    if (byLineId.size === 0) return;

    const touched = items.filter((item) => byLineId.has(item.id));
    for (const item of touched) {
      item.promotionDiscount = round(byLineId.get(item.id)!);
    }
    if (touched.length > 0) {
      await manager.save(touched);
    }
  }

  /**
   * One invoice line per gift offer, appended after the ordinary lines so
   * `sortOrder` reflects display order. `mode: ONE_OF` (customer picks 1 of
   * several) is not supported at this slice — only the first ONE_OF candidate
   * per program is honored; see UOW-04's "Not in scope".
   *
   * Lines are pushed onto `ctx.items` (not just saved) so `deduct-stock`
   * (T-04-05), which reads `ctx.items`, deducts them too.
   */
  private async persistGifts(
    ctx: CheckoutContext,
    manager: EntityManager,
    invoice: InvoiceEntity,
    items: InvoiceItemEntity[],
  ): Promise<void> {
    const appliedPrograms = (ctx.promotion?.appliedPrograms ?? []) as AppliedProgram[];
    const giftsToCreate: Array<{ program: AppliedProgram; gift: GiftOffer }> = [];
    for (const program of appliedPrograms) {
      let pickedOneOf = false;
      for (const gift of program.gifts) {
        if (gift.mode === PromotionGiftMode.ONE_OF) {
          // TODO(customer-choice gifts): take the first candidate only until
          // the cashier can pick among several — see UOW-04 "Not in scope".
          if (pickedOneOf) continue;
          pickedOneOf = true;
        }
        giftsToCreate.push({ program, gift });
      }
    }
    if (giftsToCreate.length === 0) return;

    // Resolved the same way an ordinary draft line is resolved
    // (resolveBranchItemLocations, showroom-only — a POS sale never deducts
    // from a warehouse). Unlike an ordinary line, a gift item was picked by
    // the promotion engine, not by the cashier, so there is no client-supplied
    // fallback location to fall back to: a gift with nowhere to be deducted
    // from must fail loudly rather than post a line with a null location.
    //
    // The ticket for this step asked for that failure to surface in
    // preflight; it surfaces here instead (still before any stock/GL/cash
    // posting step runs) because the gift set is only known once
    // evaluate-promotion (also preflight) has already run, and moving this
    // check there would mean resolving locations twice. Throwing here still
    // rolls back the whole transaction — no invoice, no line, no lock
    // outlives the failure — so nothing is left half-done; the ticket itself
    // sanctions this as a fallback ("nếu phải phát hiện muộn thì để rollback
    // và ghi lý do").
    const giftItemIds = [...new Set(giftsToCreate.map((g) => g.gift.itemId))];
    const locationMap = await resolveBranchItemLocations(manager, giftItemIds, ctx.actor, {
      showroomOnly: true,
    });
    const missing = giftItemIds.filter((id) => !locationMap.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'GIFT_ITEM_NO_LOCATION',
        message: `Gift item(s) have no sellable location in branch ${ctx.actor.branchId}: ${missing.join(', ')}`,
      });
    }

    const catalogItems = await manager.findBy(ItemEntity, {
      id: In(giftItemIds),
      organizationId: ctx.actor.organizationId,
    });
    const costByItemId = new Map(catalogItems.map((c) => [c.id, Number(c.purchasePrice ?? 0)]));

    let nextSortOrder = Math.max(0, ...items.map((i) => i.sortOrder ?? 0)) + 1;
    const giftEntities = giftsToCreate.map(({ program, gift }) =>
      manager.create(InvoiceItemEntity, {
        organizationId: ctx.actor.organizationId,
        branchId: ctx.actor.branchId,
        createdBy: ctx.actor.userId,
        invoiceId: invoice.id,
        itemId: gift.itemId,
        locationId: locationMap.get(gift.itemId),
        itemCode: gift.itemCode,
        itemName: gift.itemName,
        unit: gift.unit,
        quantity: gift.quantity,
        unitPrice: 0,
        unitPriceDefault: gift.unitPrice,
        costPrice: costByItemId.get(gift.itemId) ?? 0,
        lineDiscount: 0,
        lineTotal: 0,
        direction: ItemDirection.OUT,
        sortOrder: nextSortOrder++,
        isGift: true,
        promotionProgramId: program.programId,
      }),
    );

    await manager.save(giftEntities);
    items.push(...giftEntities);
  }

  /** One audit row per applied program, gift-granting or not. */
  private async persistPromotionSnapshot(
    ctx: CheckoutContext,
    manager: EntityManager,
    invoice: InvoiceEntity,
  ): Promise<void> {
    const appliedPrograms = (ctx.promotion?.appliedPrograms ?? []) as AppliedProgram[];
    if (appliedPrograms.length === 0) return;

    const promotionRepo = manager.getRepository(InvoiceCheckoutPromotionEntity);
    const snapshotRows = appliedPrograms.map((program) =>
      promotionRepo.create({
        organizationId: ctx.actor.organizationId,
        branchId: ctx.actor.branchId,
        createdBy: ctx.actor.userId,
        invoiceId: invoice.id,
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
}
