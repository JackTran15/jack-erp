import {
  PromotionProgramType,
  PromotionApplyTo,
  PromotionDiscountMode,
  PromotionLineRole,
  PromotionTargetType,
  PromotionConditionType,
  PromotionCalcBasis,
  PromotionTierBasis,
  PromotionTierScope,
  PromotionGiftMode,
  PromotionBuyGetPolicy,
} from '@erp/shared-interfaces';
import { toDomain, toPersistence, PromotionProgramRow } from './promotion.mapper';
import { PromotionProgram } from '../../domain/model/promotion-program';
import { aProgram, aGroup, aLine, aTier, aCondition } from '../../domain/engine/__fixtures__/promotion-fixture';

/** Feeds a persisted bundle straight back through toDomain, as a repository would after a fresh findById(). */
function roundTrip(aggregate: PromotionProgram): PromotionProgram {
  const bundle = toPersistence(aggregate);
  const row: PromotionProgramRow = {
    program: bundle.program,
    groups: bundle.groups,
    lines: bundle.lines,
    tiers: bundle.tiers,
    condition: bundle.condition,
    branchIds: bundle.branches.map((b) => b.branchId),
    customerGroupIds: bundle.customerGroups.map((cg) => cg.customerGroupId),
  };
  return toDomain(row);
}

describe('promotion.mapper round-trip', () => {
  it('INVOICE_DISCOUNT with a condition and branch/customer-group scope', () => {
    const original = aProgram()
      .ofType(PromotionProgramType.INVOICE_DISCOUNT)
      .with({
        applyTo: PromotionApplyTo.CUSTOMER_GROUP,
        customerGroupIds: ['group-a', 'group-b'],
        branchIds: ['branch-1', 'branch-2'],
        discountMode: PromotionDiscountMode.PERCENT,
        discountValue: 15,
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 11, 31),
        daysOfWeek: [1, 2, 3, 4, 5],
        startTime: { hours: 18, minutes: 30 },
        endTime: { hours: 21, minutes: 0 },
      })
      .withCondition(
        aCondition({
          type: PromotionConditionType.MIN_INVOICE_AMOUNT,
          minAmount: 200_000,
          calcBasis: PromotionCalcBasis.ALL_ITEMS,
        }),
      )
      .build();

    expect(roundTrip(original)).toEqual(original);
  });

  it('accruePoints=true round-trips losslessly through toPersistence/toDomain (T-02-06)', () => {
    const original = aProgram().ofType(PromotionProgramType.INVOICE_DISCOUNT).with({ accruePoints: true }).build();

    const result = roundTrip(original);

    expect(result.accruePoints).toBe(true);
    expect(result).toEqual(original);
  });

  it('accruePoints=false round-trips losslessly through toPersistence/toDomain (T-02-06)', () => {
    const original = aProgram().ofType(PromotionProgramType.INVOICE_DISCOUNT).with({ accruePoints: false }).build();

    const result = roundTrip(original);

    expect(result.accruePoints).toBe(false);
    expect(result).toEqual(original);
  });

  it('ITEM_DISCOUNT with reward lines targeting PRODUCT/ITEM/CATEGORY', () => {
    const original = aProgram()
      .ofType(PromotionProgramType.ITEM_DISCOUNT)
      .with({ discountMode: undefined, discountValue: undefined })
      .withGroups([
        aGroup({
          lines: [
            aLine({ role: PromotionLineRole.REWARD, targetType: PromotionTargetType.ITEM, discountMode: PromotionDiscountMode.PERCENT, discountValue: 20, sortOrder: 0 }),
            aLine({ role: PromotionLineRole.REWARD, targetType: PromotionTargetType.PRODUCT, discountMode: PromotionDiscountMode.AMOUNT, discountValue: 10_000, sortOrder: 1 }),
            aLine({ role: PromotionLineRole.REWARD, targetType: PromotionTargetType.CATEGORY, discountMode: PromotionDiscountMode.FIXED_PRICE, discountValue: 99_000, sortOrder: 2 }),
          ],
        }),
      ])
      .build();

    expect(roundTrip(original)).toEqual(original);
  });

  it('TIERED_DISCOUNT with multiple groups, each with its own lines and tiers', () => {
    const original = aProgram()
      .ofType(PromotionProgramType.TIERED_DISCOUNT)
      .with({
        discountMode: undefined,
        discountValue: undefined,
        tierBasis: PromotionTierBasis.QUANTITY,
        tierScope: PromotionTierScope.PER_ITEM,
      })
      .withGroups([
        aGroup({
          ordinal: 0,
          name: 'Group 1',
          lines: [aLine({ role: PromotionLineRole.REWARD })],
          tiers: [
            aTier({ fromValue: 5, toValue: 9, discountValue: 10 }),
            aTier({ fromValue: 10, toValue: undefined, discountValue: 20 }),
          ],
        }),
        aGroup({
          ordinal: 1,
          name: 'Group 2',
          lines: [aLine({ role: PromotionLineRole.REWARD }), aLine({ role: PromotionLineRole.REWARD })],
          tiers: [aTier({ fromValue: 3, toValue: undefined, discountValue: 15 })],
        }),
      ])
      .build();

    expect(roundTrip(original)).toEqual(original);
  });

  it('TIERED_DISCOUNT + INVOICE_VALUE with no lines and a max_discount_amount cap', () => {
    const original = aProgram()
      .ofType(PromotionProgramType.TIERED_DISCOUNT)
      .with({
        discountMode: undefined,
        discountValue: undefined,
        tierBasis: PromotionTierBasis.INVOICE_VALUE,
        maxDiscountAmount: 100_000,
      })
      .withGroups([aGroup({ lines: [], tiers: [aTier({ fromValue: 0, toValue: undefined })] })])
      .build();

    expect(roundTrip(original)).toEqual(original);
  });

  it('GIFT_ITEM with multiply_gift and a max_unit_price filter on the reward line', () => {
    const original = aProgram()
      .ofType(PromotionProgramType.GIFT_ITEM)
      .with({ discountMode: undefined, discountValue: undefined, giftMode: PromotionGiftMode.ALL_OF })
      .withCondition(aCondition({ type: PromotionConditionType.MIN_INVOICE_AMOUNT, minAmount: 200_000, multiplyGift: true }))
      .withGroups([
        aGroup({ lines: [aLine({ role: PromotionLineRole.REWARD, quantity: 1, maxUnitPrice: 50_000 })] }),
      ])
      .build();

    expect(roundTrip(original)).toEqual(original);
  });

  it('BUY_M_GET_N SPECIFIC with both a condition grid and a reward grid', () => {
    const original = aProgram()
      .ofType(PromotionProgramType.BUY_M_GET_N)
      .with({
        discountMode: undefined,
        discountValue: undefined,
        buyGetPolicy: PromotionBuyGetPolicy.SPECIFIC,
        buyQuantity: 3,
        giftQuantity: 1,
      })
      .withGroups([
        aGroup({
          lines: [
            aLine({ role: PromotionLineRole.CONDITION, quantity: 1 }),
            aLine({ role: PromotionLineRole.REWARD, quantity: 1 }),
          ],
        }),
      ])
      .build();

    expect(roundTrip(original)).toEqual(original);
  });

  it('a program with no branches/customer groups/condition round-trips with empty arrays and undefined condition', () => {
    const original = aProgram().build();

    const result = roundTrip(original);

    expect(result).toEqual(original);
    expect(result.branchIds).toEqual([]);
    expect(result.customerGroupIds).toEqual([]);
    expect(result.condition).toBeUndefined();
  });

  it('toPersistence nulls out a cleared startTime/endTime instead of leaving them undefined', () => {
    // TypeORM's .save() treats `undefined` entity properties as "column not
    // touched" (old DB value survives) and only `null` actually clears them —
    // toPersistence builds a fresh entity every time, so this distinction is
    // load-bearing, not cosmetic. A round-trip test can't catch this because
    // it never exercises real TypeORM persistence; assert the boundary value.
    const original = aProgram()
      .ofType(PromotionProgramType.INVOICE_DISCOUNT)
      .with({ startTime: undefined, endTime: undefined })
      .build();

    const bundle = toPersistence(original);

    expect(bundle.program.startTime).toBeNull();
    expect(bundle.program.endTime).toBeNull();
  });

  it('toPersistence throws if the aggregate has no id assigned', () => {
    const withoutId = aProgram().with({ id: undefined }).build();
    expect(() => toPersistence(withoutId)).toThrow();
  });

  it('toDomain parses a real TypeORM date-column string into a local Date, not a UTC-midnight one', () => {
    // A genuine TypeORM/pg round-trip returns 'date' columns as plain 'YYYY-MM-DD'
    // strings at runtime despite the entity's `Date` type annotation — only
    // in-memory fixtures (never touching Postgres) hand toDomain a real Date.
    const bundle = toPersistence(aProgram().with({ startDate: new Date(2026, 0, 1), endDate: new Date(2026, 11, 31) }).build());
    const row: PromotionProgramRow = {
      program: { ...bundle.program, startDate: '2026-01-01' as unknown as Date, endDate: '2026-12-31' as unknown as Date },
      groups: bundle.groups,
      lines: bundle.lines,
      tiers: bundle.tiers,
      condition: bundle.condition,
      branchIds: [],
      customerGroupIds: [],
    };

    const result = toDomain(row);

    expect(result.startDate).toBeInstanceOf(Date);
    expect(result.startDate).toEqual(new Date(2026, 0, 1));
    expect(result.endDate).toEqual(new Date(2026, 11, 31));
  });
});
