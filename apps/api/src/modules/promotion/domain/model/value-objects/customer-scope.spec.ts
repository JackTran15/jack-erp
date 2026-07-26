import { PromotionApplyTo, PromotionBirthdayMatch } from '@erp/shared-interfaces';
import { CustomerScope, CustomerScopeCustomer } from './customer-scope';

// Local-constructor dates (year, monthIndex, day) — avoids the UTC-parsing
// pitfall of ISO date strings.
function d(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

describe('CustomerScope', () => {
  describe('ALL_CUSTOMERS', () => {
    const scope = CustomerScope.of({ applyTo: PromotionApplyTo.ALL_CUSTOMERS, customerGroupIds: [] });

    it('matches any customer', () => {
      expect(scope.matches({ id: 'c1' }, d(2026, 1, 1))).toBe(true);
    });

    it('matches a walk-in customer (undefined)', () => {
      expect(scope.matches(undefined, d(2026, 1, 1))).toBe(true);
    });
  });

  describe('CUSTOMER_GROUP', () => {
    const scope = CustomerScope.of({
      applyTo: PromotionApplyTo.CUSTOMER_GROUP,
      customerGroupIds: ['vip', 'loyal'],
    });

    it('matches a customer in one of the listed groups', () => {
      expect(scope.matches({ id: 'c1', groupId: 'vip' }, d(2026, 1, 1))).toBe(true);
    });

    it('rejects a customer in a different group', () => {
      expect(scope.matches({ id: 'c1', groupId: 'regular' }, d(2026, 1, 1))).toBe(false);
    });

    it('rejects a walk-in customer', () => {
      expect(scope.matches(undefined, d(2026, 1, 1))).toBe(false);
    });
  });

  describe('CARD_TIER', () => {
    const scope = CustomerScope.of({
      applyTo: PromotionApplyTo.CARD_TIER,
      customerGroupIds: [],
      cardTierId: 'gold',
    });

    it('matches a customer holding the exact tier', () => {
      expect(scope.matches({ id: 'c1', cardTierId: 'gold' }, d(2026, 1, 1))).toBe(true);
    });

    it('rejects a customer holding a different tier', () => {
      expect(scope.matches({ id: 'c1', cardTierId: 'silver' }, d(2026, 1, 1))).toBe(false);
    });

    it('rejects a customer with no card', () => {
      expect(scope.matches({ id: 'c1' }, d(2026, 1, 1))).toBe(false);
    });
  });

  describe('BIRTHDAY', () => {
    it('rejects a walk-in customer regardless of match mode', () => {
      const scope = CustomerScope.of({
        applyTo: PromotionApplyTo.BIRTHDAY,
        customerGroupIds: [],
        birthdayMatch: PromotionBirthdayMatch.EXACT_DAY,
      });
      expect(scope.matches(undefined, d(2026, 3, 15))).toBe(false);
    });

    it('rejects a customer with no recorded birth date', () => {
      const scope = CustomerScope.of({
        applyTo: PromotionApplyTo.BIRTHDAY,
        customerGroupIds: [],
        birthdayMatch: PromotionBirthdayMatch.EXACT_DAY,
      });
      expect(scope.matches({ id: 'c1' }, d(2026, 3, 15))).toBe(false);
    });

    describe('EXACT_DAY', () => {
      const scope = CustomerScope.of({
        applyTo: PromotionApplyTo.BIRTHDAY,
        customerGroupIds: [],
        birthdayMatch: PromotionBirthdayMatch.EXACT_DAY,
      });
      const customer: CustomerScopeCustomer = { id: 'c1', birthDate: d(1990, 3, 15) };

      it('matches the exact month/day regardless of birth year', () => {
        expect(scope.matches(customer, d(2026, 3, 15))).toBe(true);
      });

      it('rejects a different day in the same month', () => {
        expect(scope.matches(customer, d(2026, 3, 16))).toBe(false);
      });

      it('rejects the same day in a different month', () => {
        expect(scope.matches(customer, d(2026, 4, 15))).toBe(false);
      });
    });

    describe('SAME_MONTH', () => {
      const scope = CustomerScope.of({
        applyTo: PromotionApplyTo.BIRTHDAY,
        customerGroupIds: [],
        birthdayMatch: PromotionBirthdayMatch.SAME_MONTH,
      });
      const customer: CustomerScopeCustomer = { id: 'c1', birthDate: d(1990, 3, 15) };

      it('matches any day within the birth month', () => {
        expect(scope.matches(customer, d(2026, 3, 1))).toBe(true);
        expect(scope.matches(customer, d(2026, 3, 31))).toBe(true);
      });

      it('rejects a different month', () => {
        expect(scope.matches(customer, d(2026, 4, 1))).toBe(false);
      });
    });

    describe('SAME_WEEK', () => {
      const scope = CustomerScope.of({
        applyTo: PromotionApplyTo.BIRTHDAY,
        customerGroupIds: [],
        birthdayMatch: PromotionBirthdayMatch.SAME_WEEK,
      });
      // 2026-03-18 is a Wednesday -> week runs Mon 2026-03-16 to Sun 2026-03-22.
      const customer: CustomerScopeCustomer = { id: 'c1', birthDate: d(1990, 3, 18) };

      it('matches the Monday of that week', () => {
        expect(scope.matches(customer, d(2026, 3, 16))).toBe(true);
      });

      it('matches the Sunday of that week', () => {
        expect(scope.matches(customer, d(2026, 3, 22))).toBe(true);
      });

      it('rejects the following Monday', () => {
        expect(scope.matches(customer, d(2026, 3, 23))).toBe(false);
      });

      it('wraps across a year boundary', () => {
        // Birthday 31/12 falls on a Wednesday in 2025 -> that week runs
        // Mon 2025-12-29 to Sun 2026-01-04, so a date early in the *next*
        // calendar year must still match.
        const wrapCustomer: CustomerScopeCustomer = { id: 'c2', birthDate: d(1995, 12, 31) };
        expect(scope.matches(wrapCustomer, d(2026, 1, 2))).toBe(true);
      });
    });

    describe('RANGE', () => {
      it('matches within the before/after window around the birthday', () => {
        const scope = CustomerScope.of({
          applyTo: PromotionApplyTo.BIRTHDAY,
          customerGroupIds: [],
          birthdayMatch: PromotionBirthdayMatch.RANGE,
          birthdayBeforeDays: 3,
          birthdayAfterDays: 5,
        });
        const customer: CustomerScopeCustomer = { id: 'c1', birthDate: d(1990, 6, 15) };

        expect(scope.matches(customer, d(2026, 6, 12))).toBe(true); // exactly beforeDays
        expect(scope.matches(customer, d(2026, 6, 15))).toBe(true); // birthday itself
        expect(scope.matches(customer, d(2026, 6, 20))).toBe(true); // exactly afterDays
        expect(scope.matches(customer, d(2026, 6, 11))).toBe(false);
        expect(scope.matches(customer, d(2026, 6, 21))).toBe(false);
      });

      it('wraps across the year boundary (birthday 30/12, afterDays=5 matches 1-4/01)', () => {
        const scope = CustomerScope.of({
          applyTo: PromotionApplyTo.BIRTHDAY,
          customerGroupIds: [],
          birthdayMatch: PromotionBirthdayMatch.RANGE,
          birthdayBeforeDays: 0,
          birthdayAfterDays: 5,
        });
        const customer: CustomerScopeCustomer = { id: 'c1', birthDate: d(1990, 12, 30) };

        expect(scope.matches(customer, d(2026, 1, 1))).toBe(true);
        expect(scope.matches(customer, d(2026, 1, 4))).toBe(true);
        expect(scope.matches(customer, d(2026, 1, 5))).toBe(false);
      });

      it('wraps across the year boundary the other direction (birthday 02/01, beforeDays=5 matches 28-31/12)', () => {
        const scope = CustomerScope.of({
          applyTo: PromotionApplyTo.BIRTHDAY,
          customerGroupIds: [],
          birthdayMatch: PromotionBirthdayMatch.RANGE,
          birthdayBeforeDays: 5,
          birthdayAfterDays: 0,
        });
        const customer: CustomerScopeCustomer = { id: 'c1', birthDate: d(1990, 1, 2) };

        expect(scope.matches(customer, d(2025, 12, 28))).toBe(true);
        expect(scope.matches(customer, d(2025, 12, 27))).toBe(false);
      });
    });
  });
});
