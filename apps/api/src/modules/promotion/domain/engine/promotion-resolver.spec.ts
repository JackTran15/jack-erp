import {
  PromotionProgramType,
  PromotionStatus,
  PromotionDiscountMode,
  PromotionInvoiceScope,
  PromotionLineRole,
  PromotionConditionType,
  PromotionCalcBasis,
  PromotionGroupMatchMode,
  PromotionTargetType,
  PromotionBuyGetPolicy,
} from '@erp/shared-interfaces';
import { PromotionResolver } from './promotion-resolver';
import { aProgram, aGroup, aLine, aTier, aCondition, aCart, aCartLine, aCatalogItem } from './__fixtures__/promotion-fixture';

describe('PromotionResolver', () => {
  const resolver = new PromotionResolver();

  it('AC-01: 30% ITEM_DISCOUNT on a 685,000 SKU end-to-end', () => {
    const cartLine = aCartLine({ itemId: 'sku-1', quantity: 1, unitPrice: 685_000 });
    const program = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([
        aGroup({
          lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 30 })],
        }),
      ])
      .build();
    const cart = aCart({ lines: [cartLine] });

    const evaluation = resolver.resolve([program], cart);

    expect(evaluation.subtotal).toBe(685_000);
    expect(evaluation.promotionDiscount).toBe(205_500);
    expect(evaluation.amountAfterPromotion).toBe(479_500);
    expect(evaluation.appliedPrograms).toHaveLength(1);
    expect(evaluation.appliedPrograms[0].lineDiscounts).toEqual([
      { lineId: cartLine.lineId, discountAmount: 205_500, unitPriceAfter: 479_500 },
    ]);
  });

  it('AC-03: a STOPPED program never applies and is skipped with reason STOPPED', () => {
    const program = aProgram().with({ status: PromotionStatus.STOPPED }).build();
    const cart = aCart({ lines: [aCartLine()] });

    const evaluation = resolver.resolve([program], cart);

    expect(evaluation.appliedPrograms).toHaveLength(0);
    expect(evaluation.skippedPrograms).toContainEqual({ programId: program.id, name: program.name, reason: 'STOPPED' });
  });

  it('AC-04: Mon-Fri restriction skips a cart evaluated on Sunday', () => {
    const program = aProgram().with({ daysOfWeek: [1, 2, 3, 4, 5] }).build();
    // 2026-01-18 is a Sunday.
    const cart = aCart({ lines: [aCartLine()], at: new Date(2026, 0, 18, 12, 0, 0) });

    const evaluation = resolver.resolve([program], cart);

    expect(evaluation.skippedPrograms).toContainEqual({ programId: program.id, name: program.name, reason: 'DAY_OF_WEEK' });
  });

  describe('AC-05: time-of-day window', () => {
    it('an 18:00-21:00 window skips a cart evaluated at 15:00', () => {
      const program = aProgram().with({ startTime: { hours: 18, minutes: 0 }, endTime: { hours: 21, minutes: 0 } }).build();
      const cart = aCart({ lines: [aCartLine()], at: new Date(2026, 0, 15, 15, 0, 0) });

      const evaluation = resolver.resolve([program], cart);

      expect(evaluation.skippedPrograms).toContainEqual({ programId: program.id, name: program.name, reason: 'TIME_OF_DAY' });
    });

    it('an overnight 22:00-02:00 window applies at 01:00', () => {
      const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 100_000, quantity: 1 });
      const program = aProgram()
        .with({ startTime: { hours: 22, minutes: 0 }, endTime: { hours: 2, minutes: 0 } })
        .build();
      const cart = aCart({ lines: [cartLine], at: new Date(2026, 0, 15, 1, 0, 0) });

      const evaluation = resolver.resolve([program], cart);

      expect(evaluation.appliedPrograms).toHaveLength(1);
    });
  });

  it('AC-08: group_match_mode=ALL with 2 category groups skips a cart that only has group 1', () => {
    const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 500_000, quantity: 1 });
    const cart = aCart({
      lines: [cartLine],
      catalog: new Map([['sku-1', aCatalogItem({ itemId: 'sku-1', sellingPrice: 500_000, categoryPathIds: ['group-1'] })]]),
    });
    const program = aProgram()
      .ofType(PromotionProgramType.INVOICE_DISCOUNT)
      .withCondition(
        aCondition({
          type: PromotionConditionType.MIN_INVOICE_AMOUNT,
          minAmount: 100_000,
          calcBasis: PromotionCalcBasis.ITEM_CATEGORIES,
          groupMatchMode: PromotionGroupMatchMode.ALL,
        }),
      )
      .withGroups([
        aGroup({
          lines: [
            aLine({ role: PromotionLineRole.CONDITION, targetType: PromotionTargetType.CATEGORY, targetId: 'group-1' }),
            aLine({ role: PromotionLineRole.CONDITION, targetType: PromotionTargetType.CATEGORY, targetId: 'group-2' }),
          ],
        }),
      ])
      .build();

    const evaluation = resolver.resolve([program], cart);

    expect(evaluation.appliedPrograms).toHaveLength(0);
    expect(evaluation.skippedPrograms).toContainEqual({ programId: program.id, name: program.name, reason: 'CONDITION_NOT_MET' });
  });

  it('BR-001: two programs on the same SKU — lower priority (30%) wins, the other is RESOURCE_TAKEN', () => {
    const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 100_000, quantity: 1 });
    const winner = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .withPriority(10)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 30 })] })])
      .build();
    const loser = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .withPriority(20)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 50 })] })])
      .build();
    const cart = aCart({ lines: [cartLine] });

    const evaluation = resolver.resolve([loser, winner], cart); // input order deliberately reversed from priority order

    expect(evaluation.appliedPrograms).toHaveLength(1);
    expect(evaluation.appliedPrograms[0].programId).toBe(winner.id);
    expect(evaluation.appliedPrograms[0].discountAmount).toBe(30_000);
    expect(evaluation.skippedPrograms).toContainEqual({
      programId: loser.id,
      name: loser.name,
      reason: 'RESOURCE_TAKEN',
      takenBy: winner.id,
    });
  });

  it('BR-002: ITEM_DISCOUNT runs first; a NON_PROMO_ONLY INVOICE_DISCOUNT only discounts what is left', () => {
    const lineA = aCartLine({ lineId: 'lA', itemId: 'sku-1', unitPrice: 100_000, quantity: 1 });
    const lineB = aCartLine({ lineId: 'lB', itemId: 'sku-2', unitPrice: 200_000, quantity: 1 });
    const itemDiscount = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .withPriority(10)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })] })])
      .build();
    const invoiceDiscount = aProgram()
      .ofType(PromotionProgramType.INVOICE_DISCOUNT)
      .withPriority(20)
      .with({ invoiceScope: PromotionInvoiceScope.NON_PROMO_ONLY, discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })
      .build();
    const cart = aCart({ lines: [lineA, lineB] });

    const evaluation = resolver.resolve([itemDiscount, invoiceDiscount], cart);

    expect(evaluation.appliedPrograms).toHaveLength(2);
    const invoiceApplied = evaluation.appliedPrograms.find((p) => p.programId === invoiceDiscount.id)!;
    // Only lineB (200,000, untouched by the ITEM_DISCOUNT) is the base for the invoice discount.
    expect(invoiceApplied.discountAmount).toBe(20_000);
    expect(invoiceApplied.lineDiscounts).toEqual([{ lineId: 'lB', discountAmount: 20_000, unitPriceAfter: 180_000 }]);
  });

  it('two INVOICE_DISCOUNT programs contend for the single invoice-discount slot', () => {
    const winner = aProgram().ofType(PromotionProgramType.INVOICE_DISCOUNT).withPriority(10).with({ discountValue: 5 }).build();
    const loser = aProgram().ofType(PromotionProgramType.INVOICE_DISCOUNT).withPriority(20).with({ discountValue: 15 }).build();
    const cart = aCart({ lines: [aCartLine({ unitPrice: 100_000, quantity: 1 })] });

    const evaluation = resolver.resolve([loser, winner], cart);

    expect(evaluation.appliedPrograms).toHaveLength(1);
    expect(evaluation.appliedPrograms[0].programId).toBe(winner.id);
    expect(evaluation.skippedPrograms).toContainEqual({
      programId: loser.id,
      name: loser.name,
      reason: 'RESOURCE_TAKEN',
      takenBy: winner.id,
    });
  });

  it('a GIFT_ITEM and a BUY_M_GET_N program contend for the single gift slot', () => {
    const cartLine = aCartLine({ itemId: 'sku-condition', unitPrice: 100_000, quantity: 3 });
    const cart = aCart({
      lines: [cartLine],
      catalog: new Map([
        ['sku-condition', aCatalogItem({ itemId: 'sku-condition', sellingPrice: 100_000 })],
        ['gift-item', aCatalogItem({ itemId: 'gift-item', sellingPrice: 10_000 })],
      ]),
    });
    const winner = aProgram()
      .ofType(PromotionProgramType.GIFT_ITEM)
      .withPriority(10)
      .with({ discountMode: undefined, discountValue: undefined })
      .withCondition(aCondition({ type: PromotionConditionType.MIN_INVOICE_AMOUNT, minAmount: 100_000, multiplyGift: false }))
      .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'gift-item' })] })])
      .build();
    const loser = aProgram()
      .ofType(PromotionProgramType.BUY_M_GET_N)
      .withPriority(20)
      .with({
        discountMode: undefined,
        discountValue: undefined,
        buyGetPolicy: PromotionBuyGetPolicy.CHEAPEST,
        buyQuantity: 3,
        giftQuantity: 1,
      })
      .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.CONDITION, targetId: 'sku-condition' })] })])
      .build();

    const evaluation = resolver.resolve([loser, winner], cart);

    expect(evaluation.appliedPrograms).toHaveLength(1);
    expect(evaluation.appliedPrograms[0].programId).toBe(winner.id);
    expect(evaluation.skippedPrograms).toContainEqual({
      programId: loser.id,
      name: loser.name,
      reason: 'RESOURCE_TAKEN',
      takenBy: winner.id,
    });
  });

  describe('auto_apply', () => {
    it('a non-auto-apply program never runs on its own, and is surfaced in availablePrograms with an estimate', () => {
      const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 100_000, quantity: 1 });
      const program = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .with({ autoApply: false, discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })] })])
        .build();
      const cart = aCart({ lines: [cartLine] });

      const evaluation = resolver.resolve([program], cart);

      expect(evaluation.appliedPrograms).toHaveLength(0);
      expect(evaluation.availablePrograms).toEqual([
        { programId: program.id, code: program.code, name: program.name, type: program.type, autoApply: false, estimatedDiscount: 10_000 },
      ]);
    });

    it('runs once its id is in selectedProgramIds', () => {
      const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 100_000, quantity: 1 });
      const program = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .with({ autoApply: false, discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })] })])
        .build();
      const cart = aCart({ lines: [cartLine], selectedProgramIds: [program.id!] });

      const evaluation = resolver.resolve([program], cart);

      expect(evaluation.appliedPrograms).toHaveLength(1);
      expect(evaluation.availablePrograms).toHaveLength(0);
    });
  });

  // T-04-02 / ADR-03 — `selectedProgramIds` also wins a contested resource ahead
  // of `priority` (not just "turns on an optional program", covered above).
  describe('UOW-04: cashier overrides the priority winner via selectedProgramIds', () => {
    function competingPrograms() {
      const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 100_000, quantity: 1 });
      const priorityWinner = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .withPriority(10)
        .with({ discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 30 })] })])
        .build();
      const priorityLoser = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .withPriority(20)
        .with({ discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 50 })] })])
        .build();
      const cart = aCart({ lines: [cartLine] });
      return { priorityWinner, priorityLoser, cart };
    }

    it('empty selectedProgramIds ⇒ priority still decides (unchanged behavior)', () => {
      const { priorityWinner, priorityLoser, cart } = competingPrograms();

      const evaluation = resolver.resolve([priorityLoser, priorityWinner], cart);

      expect(evaluation.appliedPrograms[0].programId).toBe(priorityWinner.id);
      expect(evaluation.skippedPrograms).toContainEqual({
        programId: priorityLoser.id,
        name: priorityLoser.name,
        reason: 'RESOURCE_TAKEN',
        takenBy: priorityWinner.id,
      });
    });

    it('selecting the worse-priority program makes it win', () => {
      const { priorityWinner, priorityLoser, cart } = competingPrograms();
      cart.selectedProgramIds = [priorityLoser.id!];

      const evaluation = resolver.resolve([priorityLoser, priorityWinner], cart);

      expect(evaluation.appliedPrograms).toHaveLength(1);
      expect(evaluation.appliedPrograms[0].programId).toBe(priorityLoser.id);
      expect(evaluation.appliedPrograms[0].discountAmount).toBe(50_000);
      expect(evaluation.skippedPrograms).toContainEqual({
        programId: priorityWinner.id,
        name: priorityWinner.name,
        reason: 'RESOURCE_TAKEN',
        takenBy: priorityLoser.id,
      });
    });

    it('selecting the program that already wins on priority changes nothing', () => {
      const { priorityWinner, priorityLoser, cart } = competingPrograms();
      cart.selectedProgramIds = [priorityWinner.id!];

      const evaluation = resolver.resolve([priorityLoser, priorityWinner], cart);

      expect(evaluation.appliedPrograms).toHaveLength(1);
      expect(evaluation.appliedPrograms[0].programId).toBe(priorityWinner.id);
      expect(evaluation.appliedPrograms[0].discountAmount).toBe(30_000);
    });

    it('an unknown id in selectedProgramIds is ignored, not thrown, and does not change the result', () => {
      const { priorityWinner, priorityLoser, cart } = competingPrograms();
      cart.selectedProgramIds = ['00000000-0000-4000-8000-000000000000'];

      expect(() => resolver.resolve([priorityLoser, priorityWinner], cart)).not.toThrow();
      const evaluation = resolver.resolve([priorityLoser, priorityWinner], cart);
      expect(evaluation.appliedPrograms[0].programId).toBe(priorityWinner.id);
    });

    it('selecting both contestants (same priority, same createdAt) is deterministic regardless of input array order', () => {
      const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 100_000, quantity: 1 });
      const a = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .withPriority(10)
        .with({ discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 30 })] })])
        .build();
      const b = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .withPriority(10)
        .with({ discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 50 })] })])
        .build();
      const cart = aCart({ lines: [cartLine], selectedProgramIds: [a.id!, b.id!] });

      const forward = resolver.resolve([a, b], cart);
      const reversed = resolver.resolve([b, a], cart);

      expect(forward.appliedPrograms[0].programId).toBe(reversed.appliedPrograms[0].programId);
      // Fully tied (same selection tier, same priority, same createdAt) falls back
      // to programId — deterministic, not "whichever came first in the array".
      const expectedWinner = a.id! < b.id! ? a.id : b.id;
      const expectedLoser = expectedWinner === a.id ? b.id : a.id;
      expect(forward.appliedPrograms[0].programId).toBe(expectedWinner);
      expect(reversed.appliedPrograms[0].programId).toBe(expectedWinner);
      expect(forward.skippedPrograms).toContainEqual(
        expect.objectContaining({ programId: expectedLoser, reason: 'RESOURCE_TAKEN', takenBy: expectedWinner }),
      );
    });
  });

  it('never discounts a line beyond quantity * unitPrice - manualLineDiscount', () => {
    const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 100_000, quantity: 1, manualLineDiscount: 90_000 });
    const program = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 90 })] })])
      .build();
    const cart = aCart({ lines: [cartLine] });

    const evaluation = resolver.resolve([program], cart);

    // 90% of 100,000 = 90,000, but only 10,000 remains after the manual discount.
    expect(evaluation.appliedPrograms[0].discountAmount).toBe(10_000);
  });

  it('is a pure function: resolving the same input twice yields deep-equal results', () => {
    const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 685_000, quantity: 1 });
    const program = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 30 })] })])
      .build();
    const cart = aCart({ lines: [cartLine] });

    const first = resolver.resolve([program], cart);
    const second = resolver.resolve([program], cart);

    expect(first).toEqual(second);
  });

  it('silently ignores a cart line whose item does not resolve in the catalog, instead of throwing', () => {
    const cartLine = aCartLine({ itemId: 'ghost-item', unitPrice: 100_000, quantity: 1 });
    const cart = aCart({ lines: [cartLine], catalog: new Map() }); // deliberately empty catalog
    const program = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'ghost-item', discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })] })])
      .build();

    expect(() => resolver.resolve([program], cart)).not.toThrow();
    const evaluation = resolver.resolve([program], cart);
    expect(evaluation.appliedPrograms).toHaveLength(0);
  });

  describe('T-07-01: AppliedProgram.discountMode/discountValue', () => {
    it('an applied INVOICE_DISCOUNT carries discountMode/discountValue matching its config', () => {
      const program = aProgram()
        .ofType(PromotionProgramType.INVOICE_DISCOUNT)
        .with({ discountMode: PromotionDiscountMode.PERCENT, discountValue: 15 })
        .build();
      const cart = aCart({ lines: [aCartLine({ unitPrice: 100_000, quantity: 1 })] });

      const evaluation = resolver.resolve([program], cart);

      expect(evaluation.appliedPrograms).toHaveLength(1);
      expect(evaluation.appliedPrograms[0].discountMode).toBe(PromotionDiscountMode.PERCENT);
      expect(evaluation.appliedPrograms[0].discountValue).toBe(15);
    });

    it.each([
      ['ITEM_DISCOUNT', PromotionProgramType.ITEM_DISCOUNT],
      ['TIERED_DISCOUNT', PromotionProgramType.TIERED_DISCOUNT],
      ['BUY_M_GET_N', PromotionProgramType.BUY_M_GET_N],
    ])('%s never carries discountMode/discountValue, even though the underlying reward/tier has one', (_label, type) => {
      const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 100_000, quantity: 5 });
      const groups =
        type === PromotionProgramType.TIERED_DISCOUNT
          ? [
              aGroup({
                lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1' })],
                tiers: [aTier({ fromValue: 1, discountMode: PromotionDiscountMode.PERCENT, discountValue: 10, sortOrder: 0 })],
              }),
            ]
          : type === PromotionProgramType.BUY_M_GET_N
            ? [aGroup({ lines: [aLine({ role: PromotionLineRole.CONDITION, targetId: 'sku-1' })] })]
            : [
                aGroup({
                  lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })],
                }),
              ];
      const program = aProgram()
        .ofType(type)
        .with({
          discountMode: undefined,
          discountValue: undefined,
          ...(type === PromotionProgramType.BUY_M_GET_N
            ? { buyGetPolicy: PromotionBuyGetPolicy.CHEAPEST, buyQuantity: 5, giftQuantity: 1 }
            : {}),
        })
        .withGroups(groups)
        .build();
      const cart = aCart({
        lines: [cartLine],
        catalog: new Map([['sku-1', aCatalogItem({ itemId: 'sku-1', sellingPrice: 100_000 })]]),
      });

      const evaluation = resolver.resolve([program], cart);

      expect(evaluation.appliedPrograms).toHaveLength(1);
      expect(evaluation.appliedPrograms[0].discountMode).toBeUndefined();
      expect(evaluation.appliedPrograms[0].discountValue).toBeUndefined();
    });
  });

  // T-09-01 / ADR-07 — `excludedProgramIds` always means "keep this program
  // out of the race entirely", the inverse of `selectedProgramIds` above
  // (which only ever adds a program in).
  describe('UOW-09: cashier excludes an auto_apply program via excludedProgramIds', () => {
    it('excluding an auto_apply program removes it from applied and marks it EXCLUDED_BY_CASHIER, other applied programs untouched', () => {
      const cartLine1 = aCartLine({ itemId: 'sku-1', unitPrice: 100_000, quantity: 1 });
      const cartLine2 = aCartLine({ itemId: 'sku-2', unitPrice: 200_000, quantity: 1 });
      // Two ITEM_DISCOUNT programs on different SKUs — no contested resource,
      // both would apply independently if neither were excluded.
      const excludedProgram = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .with({ discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 30 })] })])
        .build();
      const otherProgram = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .with({ discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-2', discountMode: PromotionDiscountMode.PERCENT, discountValue: 10 })] })])
        .build();
      const cart = aCart({
        lines: [cartLine1, cartLine2],
        excludedProgramIds: [excludedProgram.id!],
      });

      const evaluation = resolver.resolve([excludedProgram, otherProgram], cart);

      expect(evaluation.appliedPrograms).toHaveLength(1);
      expect(evaluation.appliedPrograms[0].programId).toBe(otherProgram.id);
      expect(evaluation.skippedPrograms).toContainEqual({
        programId: excludedProgram.id,
        name: excludedProgram.name,
        reason: 'EXCLUDED_BY_CASHIER',
      });
    });

    it('empty excludedProgramIds ⇒ unchanged behavior', () => {
      const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 100_000, quantity: 1 });
      const program = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .with({ discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 30 })] })])
        .build();
      const cart = aCart({ lines: [cartLine] });

      const evaluation = resolver.resolve([program], cart);

      expect(evaluation.appliedPrograms).toHaveLength(1);
      expect(evaluation.appliedPrograms[0].programId).toBe(program.id);
    });

    it('excluding one contestant lets the other win, marked EXCLUDED_BY_CASHIER not RESOURCE_TAKEN', () => {
      const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 100_000, quantity: 1 });
      const priorityWinner = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .withPriority(10)
        .with({ discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 30 })] })])
        .build();
      const priorityLoser = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .withPriority(20)
        .with({ discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 50 })] })])
        .build();
      const cart = aCart({ lines: [cartLine], excludedProgramIds: [priorityWinner.id!] });

      const evaluation = resolver.resolve([priorityLoser, priorityWinner], cart);

      expect(evaluation.appliedPrograms).toHaveLength(1);
      expect(evaluation.appliedPrograms[0].programId).toBe(priorityLoser.id);
      expect(evaluation.skippedPrograms).toContainEqual({
        programId: priorityWinner.id,
        name: priorityWinner.name,
        reason: 'EXCLUDED_BY_CASHIER',
      });
      // Not RESOURCE_TAKEN — priorityWinner never entered the contest at all.
      expect(evaluation.skippedPrograms).not.toContainEqual(
        expect.objectContaining({ programId: priorityWinner.id, reason: 'RESOURCE_TAKEN' }),
      );
    });

    it('a program in both excludedProgramIds and selectedProgramIds is excluded — exclusion wins on conflict', () => {
      const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 100_000, quantity: 1 });
      const priorityWinner = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .withPriority(10)
        .with({ discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 30 })] })])
        .build();
      const priorityLoser = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .withPriority(20)
        .with({ discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 50 })] })])
        .build();
      const cart = aCart({
        lines: [cartLine],
        selectedProgramIds: [priorityWinner.id!],
        excludedProgramIds: [priorityWinner.id!],
      });

      const evaluation = resolver.resolve([priorityLoser, priorityWinner], cart);

      expect(evaluation.appliedPrograms).toHaveLength(1);
      expect(evaluation.appliedPrograms[0].programId).toBe(priorityLoser.id);
      expect(evaluation.skippedPrograms).toContainEqual({
        programId: priorityWinner.id,
        name: priorityWinner.name,
        reason: 'EXCLUDED_BY_CASHIER',
      });
    });

    it('an unknown id in excludedProgramIds is ignored, not thrown, and does not change the result', () => {
      const cartLine = aCartLine({ itemId: 'sku-1', unitPrice: 100_000, quantity: 1 });
      const program = aProgram()
        .ofType(PromotionProgramType.ITEM_DISCOUNT)
        .with({ discountMode: undefined, discountValue: undefined })
        .withGroups([aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, targetId: 'sku-1', discountMode: PromotionDiscountMode.PERCENT, discountValue: 30 })] })])
        .build();
      const cart = aCart({
        lines: [cartLine],
        excludedProgramIds: ['00000000-0000-4000-8000-000000000000'],
      });

      expect(() => resolver.resolve([program], cart)).not.toThrow();
      const evaluation = resolver.resolve([program], cart);
      expect(evaluation.appliedPrograms).toHaveLength(1);
      expect(evaluation.appliedPrograms[0].programId).toBe(program.id);
    });
  });
});
