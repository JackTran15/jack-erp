import { BadRequestException } from '@nestjs/common';
import { LineDiscountType } from '../entities/invoice-item.entity';

export interface LineDiscountInput {
  quantity: number;
  unitPrice: number;
  lineDiscount?: number;
  lineDiscountType?: LineDiscountType;
  lineDiscountValue?: number;
  lineDiscountReason?: string;
}

export interface ResolvedLineDiscount {
  amount: number;
  lineTotal: number;
  type: LineDiscountType | null;
  value: number | null;
  reason: string | null;
}

/**
 * Resolves a line item's manual discount into the persisted breakdown. When a
 * `lineDiscountType` is supplied the server computes the discount amount from
 * the raw value (percent of gross, or a flat amount), clamped to the line
 * gross so the line total never goes negative. With no type it falls back to
 * the legacy raw `lineDiscount` amount (type/value stay null), preserving the
 * previous arithmetic. The free-text reason is kept regardless.
 *
 * Single source of truth for every document that carries line items — sale
 * drafts, exchanges and returns alike. The client sends the *intent*
 * (type + value + reason); the amount and the line total are the server's to
 * derive. A client-supplied `lineDiscount` amount is ignored whenever a type is
 * present, so a UI that shows one number and posts another cannot drift the
 * stored totals away from what the cashier saw.
 */
export function computeLineDiscount(
  item: LineDiscountInput,
): ResolvedLineDiscount {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const gross = item.quantity * item.unitPrice;
  const reason = item.lineDiscountReason ?? null;

  if (item.lineDiscountType) {
    const value = item.lineDiscountValue;
    if (value === undefined || value === null || value < 0) {
      throw new BadRequestException(
        'lineDiscountValue is required and must be >= 0 when lineDiscountType is set',
      );
    }
    if (item.lineDiscountType === LineDiscountType.PERCENT && value > 100) {
      throw new BadRequestException(
        'lineDiscountValue must be <= 100 for percent discounts',
      );
    }
    const raw =
      item.lineDiscountType === LineDiscountType.PERCENT
        ? round2((gross * value) / 100)
        : round2(value);
    const amount = Math.min(raw, gross);
    return {
      amount,
      lineTotal: round2(gross - amount),
      type: item.lineDiscountType,
      value,
      reason,
    };
  }

  // Legacy path: identical arithmetic to the previous implementation.
  const amount = item.lineDiscount ?? 0;
  return { amount, lineTotal: gross - amount, type: null, value: null, reason };
}
