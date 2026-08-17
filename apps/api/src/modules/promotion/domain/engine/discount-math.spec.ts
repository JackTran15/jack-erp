import { allocateProportionally } from './discount-math';
import { aCartLine } from './__fixtures__/promotion-fixture';

describe('allocateProportionally', () => {
  it('splits a discount proportionally, with the remainder handled by largest-remainder rounding', () => {
    const lines = [
      aCartLine({ lineId: 'l1', unitPrice: 300_000, quantity: 1 }),
      aCartLine({ lineId: 'l2', unitPrice: 700_000, quantity: 1 }),
    ];

    const result = allocateProportionally(lines, 100_000);

    expect(result.reduce((sum, ld) => sum + ld.discountAmount, 0)).toBe(100_000);
    expect(result.every((ld) => ld.discountAmount >= 0)).toBe(true);
  });

  it('never drives a share negative even with many near-identical lines (regression: naive last-line-absorbs-remainder can go negative)', () => {
    // 10 lines of value 1 splitting a discount of 5 -> naive "round each non-last
    // share, dump the remainder on the last line" yields 9 shares of round(0.5)=1
    // (sum 9), leaving the last line -4. Largest-remainder must avoid this.
    const lines = Array.from({ length: 10 }, (_, i) => aCartLine({ lineId: `l${i}`, unitPrice: 1, quantity: 1 }));

    const result = allocateProportionally(lines, 5);

    expect(result.reduce((sum, ld) => sum + ld.discountAmount, 0)).toBe(5);
    for (const lineDiscount of result) {
      expect(lineDiscount.discountAmount).toBeGreaterThanOrEqual(0);
      expect(lineDiscount.discountAmount).toBeLessThanOrEqual(1);
    }
  });

  it('returns an empty array for an empty or zero-value line set', () => {
    expect(allocateProportionally([], 100)).toEqual([]);
    expect(allocateProportionally([aCartLine({ unitPrice: 0, quantity: 1 })], 0)).toEqual([]);
  });
});
