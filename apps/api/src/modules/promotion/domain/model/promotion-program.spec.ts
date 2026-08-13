import {
  PromotionProgramType,
  PromotionStatus,
  PromotionApplyTo,
  PromotionDiscountMode,
  PromotionTierBasis,
  PromotionBuyGetPolicy,
  PromotionTargetType,
  PromotionLineRole,
  PromotionBirthdayMatch,
} from '@erp/shared-interfaces';
import { PromotionProgram, PromotionProgramProps } from './promotion-program';
import { DomainValidationError } from './domain-error';
import { PromotionGroup } from './promotion-group';
import { PromotionLine } from './promotion-line';
import { PromotionTier } from './promotion-tier';

let nextId = 1;
function id(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

function aLine(overrides: Partial<PromotionLine> = {}): PromotionLine {
  return {
    id: id('line'),
    role: PromotionLineRole.REWARD,
    targetType: PromotionTargetType.ITEM,
    targetId: id('item'),
    sortOrder: 0,
    ...overrides,
  };
}

function aTier(overrides: Partial<PromotionTier> = {}): PromotionTier {
  return {
    id: id('tier'),
    fromValue: 0,
    discountMode: PromotionDiscountMode.PERCENT,
    discountValue: 10,
    sortOrder: 0,
    ...overrides,
  };
}

function aGroup(overrides: Partial<PromotionGroup> = {}): PromotionGroup {
  return {
    id: id('group'),
    ordinal: 0,
    lines: [],
    tiers: [],
    ...overrides,
  };
}

/** A minimal, otherwise-valid INVOICE_DISCOUNT program — the cheapest baseline to mutate per test. */
function baseProps(overrides: Partial<PromotionProgramProps> = {}): PromotionProgramProps {
  return {
    organizationId: 'org-1',
    code: 'KM000001',
    name: 'Test promotion',
    type: PromotionProgramType.INVOICE_DISCOUNT,
    status: PromotionStatus.TRACKING,
    priority: 100,
    applyTo: PromotionApplyTo.ALL_CUSTOMERS,
    customerGroupIds: [],
    daysOfWeek: [],
    autoApply: true,
    branchIds: [],
    discountMode: PromotionDiscountMode.PERCENT,
    discountValue: 30,
    groups: [aGroup()],
    createdBy: 'user-1',
    ...overrides,
  };
}

function issueCodes(fn: () => void): string[] {
  try {
    fn();
    return [];
  } catch (error) {
    if (error instanceof DomainValidationError) {
      return error.issues.map((issue) => issue.code);
    }
    throw error;
  }
}

describe('PromotionProgram.create', () => {
  it('creates a valid INVOICE_DISCOUNT program', () => {
    const program = PromotionProgram.create(baseProps());
    expect(program.name).toBe('Test promotion');
    expect(program.type).toBe(PromotionProgramType.INVOICE_DISCOUNT);
  });

  it('is immutable — every field is readonly and no public setters exist', () => {
    const program = PromotionProgram.create(baseProps());
    expect(() => {
      // @ts-expect-error — readonly field, must not compile if it were writable.
      program.name = 'changed';
    }).toThrow();
  });

  it('throws DomainValidationError missing name', () => {
    const codes = issueCodes(() => PromotionProgram.create(baseProps({ name: '' })));
    expect(codes).toContain('NAME_REQUIRED');
  });

  it('throws when end_date < start_date', () => {
    const codes = issueCodes(() =>
      PromotionProgram.create(
        baseProps({ startDate: new Date(2026, 5, 10), endDate: new Date(2026, 5, 1) }),
      ),
    );
    expect(codes).toContain('END_DATE_BEFORE_START_DATE');
  });

  it('throws when discount_value <= 0', () => {
    const codes = issueCodes(() => PromotionProgram.create(baseProps({ discountValue: 0 })));
    expect(codes).toContain('DISCOUNT_VALUE_NOT_POSITIVE');
  });

  it('throws when PERCENT mode value > 100', () => {
    const codes = issueCodes(() =>
      PromotionProgram.create(baseProps({ discountMode: PromotionDiscountMode.PERCENT, discountValue: 150 })),
    );
    expect(codes).toContain('PERCENT_OVER_100');
  });

  it('allows AMOUNT mode with a value > 100 (percent cap does not apply)', () => {
    expect(() =>
      PromotionProgram.create(baseProps({ discountMode: PromotionDiscountMode.AMOUNT, discountValue: 50_000 })),
    ).not.toThrow();
  });

  describe('empty REWARD grid', () => {
    it('throws for ITEM_DISCOUNT with no reward lines', () => {
      const codes = issueCodes(() =>
        PromotionProgram.create(
          baseProps({
            type: PromotionProgramType.ITEM_DISCOUNT,
            discountMode: undefined,
            discountValue: undefined,
            groups: [aGroup({ lines: [] })],
          }),
        ),
      );
      expect(codes).toContain('REWARD_LINES_EMPTY');
    });

    it('does not require reward lines for INVOICE_DISCOUNT', () => {
      expect(() => PromotionProgram.create(baseProps({ groups: [aGroup({ lines: [] })] }))).not.toThrow();
    });

    it('does not require reward lines for TIERED_DISCOUNT + INVOICE_VALUE basis', () => {
      expect(() =>
        PromotionProgram.create(
          baseProps({
            type: PromotionProgramType.TIERED_DISCOUNT,
            discountMode: undefined,
            discountValue: undefined,
            tierBasis: PromotionTierBasis.INVOICE_VALUE,
            groups: [aGroup({ lines: [], tiers: [aTier({ fromValue: 0 })] })],
          }),
        ),
      ).not.toThrow();
    });

    it('requires reward lines for TIERED_DISCOUNT + QUANTITY basis', () => {
      const codes = issueCodes(() =>
        PromotionProgram.create(
          baseProps({
            type: PromotionProgramType.TIERED_DISCOUNT,
            discountMode: undefined,
            discountValue: undefined,
            tierBasis: PromotionTierBasis.QUANTITY,
            groups: [aGroup({ lines: [], tiers: [aTier({ fromValue: 0 })] })],
          }),
        ),
      );
      expect(codes).toContain('REWARD_LINES_EMPTY');
    });
  });

  describe('tier ranges', () => {
    it('throws when a tier has from >= to', () => {
      const codes = issueCodes(() =>
        PromotionProgram.create(
          baseProps({
            type: PromotionProgramType.TIERED_DISCOUNT,
            discountMode: undefined,
            discountValue: undefined,
            tierBasis: PromotionTierBasis.QUANTITY,
            groups: [
              aGroup({
                lines: [aLine()],
                tiers: [aTier({ fromValue: 10, toValue: 5 })],
              }),
            ],
          }),
        ),
      );
      expect(codes).toContain('TIER_RANGE_INVALID');
    });

    it('throws when two tiers overlap', () => {
      const codes = issueCodes(() =>
        PromotionProgram.create(
          baseProps({
            type: PromotionProgramType.TIERED_DISCOUNT,
            discountMode: undefined,
            discountValue: undefined,
            tierBasis: PromotionTierBasis.QUANTITY,
            groups: [
              aGroup({
                lines: [aLine()],
                tiers: [aTier({ fromValue: 5, toValue: 10 }), aTier({ fromValue: 8, toValue: 15 })],
              }),
            ],
          }),
        ),
      );
      expect(codes).toContain('TIER_RANGE_OVERLAP');
    });

    it('allows adjacent, non-overlapping tiers', () => {
      expect(() =>
        PromotionProgram.create(
          baseProps({
            type: PromotionProgramType.TIERED_DISCOUNT,
            discountMode: undefined,
            discountValue: undefined,
            tierBasis: PromotionTierBasis.QUANTITY,
            groups: [
              aGroup({
                lines: [aLine()],
                tiers: [aTier({ fromValue: 5, toValue: 9 }), aTier({ fromValue: 10, toValue: undefined })],
              }),
            ],
          }),
        ),
      ).not.toThrow();
    });

    it('throws when a bounded tier follows an unbounded one', () => {
      const codes = issueCodes(() =>
        PromotionProgram.create(
          baseProps({
            type: PromotionProgramType.TIERED_DISCOUNT,
            discountMode: undefined,
            discountValue: undefined,
            tierBasis: PromotionTierBasis.QUANTITY,
            groups: [
              aGroup({
                lines: [aLine()],
                tiers: [aTier({ fromValue: 5, toValue: undefined }), aTier({ fromValue: 20, toValue: 30 })],
              }),
            ],
          }),
        ),
      );
      expect(codes).toContain('TIER_RANGE_OVERLAP');
    });

    it('requires at least one tier for TIERED_DISCOUNT', () => {
      const codes = issueCodes(() =>
        PromotionProgram.create(
          baseProps({
            type: PromotionProgramType.TIERED_DISCOUNT,
            discountMode: undefined,
            discountValue: undefined,
            tierBasis: PromotionTierBasis.QUANTITY,
            groups: [aGroup({ lines: [aLine()], tiers: [] })],
          }),
        ),
      );
      expect(codes).toContain('TIERS_EMPTY');
    });
  });

  describe('apply-to requirements', () => {
    it('throws when CUSTOMER_GROUP has no groups', () => {
      const codes = issueCodes(() =>
        PromotionProgram.create(baseProps({ applyTo: PromotionApplyTo.CUSTOMER_GROUP, customerGroupIds: [] })),
      );
      expect(codes).toContain('CUSTOMER_GROUP_IDS_EMPTY');
    });

    it('throws when CARD_TIER has no cardTierId', () => {
      const codes = issueCodes(() =>
        PromotionProgram.create(baseProps({ applyTo: PromotionApplyTo.CARD_TIER, cardTierId: undefined })),
      );
      expect(codes).toContain('CARD_TIER_ID_REQUIRED');
    });

    // QA #9: BIRTHDAY was the one audience with no companion-field rule, so it
    // saved fine and then matched nobody, for ever, with no signal.
    it('throws when BIRTHDAY has no birthdayMatch', () => {
      const codes = issueCodes(() =>
        PromotionProgram.create(
          baseProps({ applyTo: PromotionApplyTo.BIRTHDAY, birthdayMatch: undefined }),
        ),
      );
      expect(codes).toContain('BIRTHDAY_MATCH_REQUIRED');
    });

    it('accepts BIRTHDAY once a match kind is chosen', () => {
      const codes = issueCodes(() =>
        PromotionProgram.create(
          baseProps({
            applyTo: PromotionApplyTo.BIRTHDAY,
            birthdayMatch: PromotionBirthdayMatch.SAME_MONTH,
          }),
        ),
      );
      expect(codes).not.toContain('BIRTHDAY_MATCH_REQUIRED');
    });
  });

  // QA #8: a programme with no group saved happily, then every strategy's
  // `groups[0]` was undefined and the TypeError surfaced as a 500 on every
  // price calculation until the row was deleted.
  describe('empty groups', () => {
    it('throws GROUPS_EMPTY when there is no group at all', () => {
      const codes = issueCodes(() => PromotionProgram.create(baseProps({ groups: [] })));
      expect(codes).toContain('GROUPS_EMPTY');
    });

    it.each([
      ['INVOICE_DISCOUNT', { type: PromotionProgramType.INVOICE_DISCOUNT }],
      [
        'BUY_M_GET_N + CHEAPEST',
        {
          type: PromotionProgramType.BUY_M_GET_N,
          buyGetPolicy: PromotionBuyGetPolicy.CHEAPEST,
          buyQuantity: 2,
          giftQuantity: 1,
          discountMode: undefined,
          discountValue: undefined,
        },
      ],
    ])(
      'blocks %s too — the two types exempted from the reward-line rule',
      (_label, overrides) => {
        const codes = issueCodes(() =>
          PromotionProgram.create(baseProps({ ...overrides, groups: [] } as Partial<PromotionProgramProps>)),
        );
        expect(codes).toContain('GROUPS_EMPTY');
      },
    );

    it('still accepts a program that has a group', () => {
      const codes = issueCodes(() => PromotionProgram.create(baseProps()));
      expect(codes).not.toContain('GROUPS_EMPTY');
    });
  });

  describe('BUY_M_GET_N + CHEAPEST quantities', () => {
    function buyGetProps(overrides: Partial<PromotionProgramProps> = {}): PromotionProgramProps {
      return baseProps({
        type: PromotionProgramType.BUY_M_GET_N,
        discountMode: undefined,
        discountValue: undefined,
        buyGetPolicy: PromotionBuyGetPolicy.CHEAPEST,
        buyQuantity: 3,
        giftQuantity: 1,
        groups: [aGroup({ lines: [aLine({ role: PromotionLineRole.CONDITION })] })],
        ...overrides,
      });
    }

    it('throws when buyQuantity is missing', () => {
      const codes = issueCodes(() => PromotionProgram.create(buyGetProps({ buyQuantity: undefined })));
      expect(codes).toContain('BUY_QUANTITY_INVALID');
    });

    it('throws when buyQuantity is <= 0', () => {
      const codes = issueCodes(() => PromotionProgram.create(buyGetProps({ buyQuantity: 0 })));
      expect(codes).toContain('BUY_QUANTITY_INVALID');
    });

    it('throws when giftQuantity is missing', () => {
      const codes = issueCodes(() => PromotionProgram.create(buyGetProps({ giftQuantity: undefined })));
      expect(codes).toContain('GIFT_QUANTITY_INVALID');
    });

    it('does not require quantities for the SPECIFIC policy', () => {
      expect(() =>
        PromotionProgram.create(
          buyGetProps({
            buyGetPolicy: PromotionBuyGetPolicy.SPECIFIC,
            buyQuantity: undefined,
            giftQuantity: undefined,
            groups: [
              aGroup({
                lines: [aLine({ role: PromotionLineRole.CONDITION }), aLine({ role: PromotionLineRole.REWARD })],
              }),
            ],
          }),
        ),
      ).not.toThrow();
    });

    it('creates a valid BUY_M_GET_N + CHEAPEST program with no reward grid', () => {
      expect(() => PromotionProgram.create(buyGetProps())).not.toThrow();
    });

    it('requires reward lines for BUY_M_GET_N + SPECIFIC (unlike CHEAPEST)', () => {
      const codes = issueCodes(() =>
        PromotionProgram.create(
          buyGetProps({
            buyGetPolicy: PromotionBuyGetPolicy.SPECIFIC,
            groups: [aGroup({ lines: [aLine({ role: PromotionLineRole.CONDITION })] })],
          }),
        ),
      );
      expect(codes).toContain('REWARD_LINES_EMPTY');
    });
  });

  it('reports every violated invariant at once, not just the first', () => {
    const codes = issueCodes(() =>
      PromotionProgram.create(
        baseProps({
          name: '',
          discountValue: -5,
          startDate: new Date(2026, 5, 10),
          endDate: new Date(2026, 5, 1),
        }),
      ),
    );
    expect(codes).toEqual(
      expect.arrayContaining(['NAME_REQUIRED', 'END_DATE_BEFORE_START_DATE', 'DISCOUNT_VALUE_NOT_POSITIVE']),
    );
    expect(codes.length).toBeGreaterThanOrEqual(3);
  });
});
