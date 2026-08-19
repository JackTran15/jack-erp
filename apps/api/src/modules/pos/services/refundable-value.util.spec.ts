import { refundableFactor, refundableUnitValues } from './refundable-value.util';

const item = (over: Record<string, any> = {}) =>
  ({
    id: 'l1',
    quantity: 1,
    lineTotal: 750000,
    promotionDiscount: 0,
    ...over,
  }) as any;

describe('refundableUnitValues', () => {
  it('returns the list price when the sale carried no discount', () => {
    const map = refundableUnitValues({}, [item()]);
    expect(map.get('l1')).toBe(750000);
  });

  // The reported defect: a 20% promotion means the customer paid 600.000 for a
  // 750.000 pair, so 600.000 is what returning it is worth.
  it('takes off the promotion allocated to the line', () => {
    const map = refundableUnitValues({ discountAmount: 150000 }, [
      item({ promotionDiscount: 150000 }),
    ]);
    expect(map.get('l1')).toBe(600000);
  });

  it('spreads header money the customer never paid across the lines', () => {
    // 2 lines of 1.000.000; 200.000 paid in points → each line is worth 900.000.
    const map = refundableUnitValues({ pointsDiscountAmount: 200000 }, [
      item({ id: 'a', lineTotal: 1000000 }),
      item({ id: 'b', lineTotal: 1000000 }),
    ]);
    expect(map.get('a')).toBe(900000);
    expect(map.get('b')).toBe(900000);
  });

  it('does not count a per-line promotion twice through discountAmount', () => {
    // discountAmount carries manual + promotion + voucher together; the part
    // already allocated per line must not come off a second time.
    const map = refundableUnitValues({ discountAmount: 300000 }, [
      item({ id: 'a', lineTotal: 1000000, promotionDiscount: 150000 }),
      item({ id: 'b', lineTotal: 1000000, promotionDiscount: 150000 }),
    ]);
    expect(map.get('a')).toBe(850000);
    expect(map.get('b')).toBe(850000);
  });

  it('prices per unit, not per line', () => {
    const map = refundableUnitValues({}, [
      item({ quantity: 3, lineTotal: 900000 }),
    ]);
    expect(map.get('l1')).toBe(300000);
  });

  it('floors at zero when the header residual swallows the goods', () => {
    const map = refundableUnitValues({ pointsDiscountAmount: 5000000 }, [
      item({ lineTotal: 1000000 }),
    ]);
    expect(map.get('l1')).toBe(0);
    expect(refundableFactor({ pointsDiscountAmount: 5000000 }, [item()])).toBe(0);
  });

  it('leaves a fully-discounted invoice at a factor of 1 rather than dividing by zero', () => {
    expect(refundableFactor({}, [item({ lineTotal: 0 })])).toBe(1);
  });
});
