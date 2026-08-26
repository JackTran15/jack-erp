import { BadRequestException } from '@nestjs/common';
import { LineDiscountType } from '../entities/invoice-item.entity';
import { computeLineDiscount } from './line-discount.util';

describe('computeLineDiscount', () => {
  it('computes a percent discount off the line gross', () => {
    // The production case this whole feature exists for: 685.000 − 30% = 479.500.
    expect(
      computeLineDiscount({
        quantity: 1,
        unitPrice: 685000,
        lineDiscountType: LineDiscountType.PERCENT,
        lineDiscountValue: 30,
        lineDiscountReason: 'sale30',
      }),
    ).toEqual({
      amount: 205500,
      lineTotal: 479500,
      type: LineDiscountType.PERCENT,
      value: 30,
      reason: 'sale30',
    });
  });

  it('computes a flat amount discount', () => {
    expect(
      computeLineDiscount({
        quantity: 2,
        unitPrice: 150000,
        lineDiscountType: LineDiscountType.AMOUNT,
        lineDiscountValue: 30000,
      }),
    ).toEqual({
      amount: 30000,
      lineTotal: 270000,
      type: LineDiscountType.AMOUNT,
      value: 30000,
      reason: null,
    });
  });

  it('clamps a discount larger than the line gross so the total never goes negative', () => {
    expect(
      computeLineDiscount({
        quantity: 1,
        unitPrice: 100000,
        lineDiscountType: LineDiscountType.AMOUNT,
        lineDiscountValue: 150000,
      }),
    ).toMatchObject({ amount: 100000, lineTotal: 0 });
  });

  it('ignores a client-supplied lineDiscount amount when a type is present', () => {
    expect(
      computeLineDiscount({
        quantity: 1,
        unitPrice: 685000,
        lineDiscount: 0,
        lineDiscountType: LineDiscountType.PERCENT,
        lineDiscountValue: 30,
      }),
    ).toMatchObject({ amount: 205500, lineTotal: 479500 });
  });

  it('falls back to the raw lineDiscount amount when no type is given', () => {
    expect(
      computeLineDiscount({
        quantity: 1,
        unitPrice: 460000,
        lineDiscount: 60000,
      }),
    ).toEqual({
      amount: 60000,
      lineTotal: 400000,
      type: null,
      value: null,
      reason: null,
    });
  });

  it('treats a missing lineDiscount as zero', () => {
    expect(
      computeLineDiscount({ quantity: 1, unitPrice: 460000 }),
    ).toMatchObject({ amount: 0, lineTotal: 460000 });
  });

  it('rejects a missing or negative value when a type is set', () => {
    expect(() =>
      computeLineDiscount({
        quantity: 1,
        unitPrice: 100000,
        lineDiscountType: LineDiscountType.PERCENT,
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      computeLineDiscount({
        quantity: 1,
        unitPrice: 100000,
        lineDiscountType: LineDiscountType.AMOUNT,
        lineDiscountValue: -1,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a percent above 100', () => {
    expect(() =>
      computeLineDiscount({
        quantity: 1,
        unitPrice: 100000,
        lineDiscountType: LineDiscountType.PERCENT,
        lineDiscountValue: 101,
      }),
    ).toThrow(BadRequestException);
  });
});
