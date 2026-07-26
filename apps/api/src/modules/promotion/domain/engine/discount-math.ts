import { PromotionDiscountMode } from '@erp/shared-interfaces';
import { CartLine } from '../model/cart';
import { LineDiscount } from '../model/evaluation';
import { roundVnd } from '../model/value-objects/money';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lineTotal(line: CartLine): number {
  return line.quantity * line.unitPrice - (line.manualLineDiscount ?? 0);
}

export function sumLines(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

/** Discount per unit given a unit price and a discount mode/value. FIXED_PRICE = new selling price (clamped >= 0). */
export function perUnitDiscount(
  unitPrice: number,
  mode: PromotionDiscountMode | undefined,
  value: number | undefined,
): number {
  if (mode === undefined || value === undefined) return 0;
  switch (mode) {
    case PromotionDiscountMode.PERCENT:
      return unitPrice * (value / 100);
    case PromotionDiscountMode.AMOUNT:
      return value;
    case PromotionDiscountMode.FIXED_PRICE:
      return Math.max(0, unitPrice - value);
    default:
      return 0;
  }
}

/** Discount against a total amount (used when a tier applies to a group/invoice total rather than a per-unit price). */
export function totalDiscount(
  amount: number,
  mode: PromotionDiscountMode | undefined,
  value: number | undefined,
): number {
  if (mode === undefined || value === undefined) return 0;
  switch (mode) {
    case PromotionDiscountMode.PERCENT:
      return amount * (value / 100);
    case PromotionDiscountMode.AMOUNT:
      return value;
    case PromotionDiscountMode.FIXED_PRICE:
      return Math.max(0, amount - value);
    default:
      return 0;
  }
}

/**
 * Splits a total discount across lines by each line's share of the group
 * total, using the largest-remainder method so `sum(lineDiscounts) ===
 * discountAmount` exactly. Dumping the whole rounding remainder onto a single
 * line (as a naive "round each share, put the leftover on the last line"
 * scheme would) can drive that line's share negative when several lines have
 * near-identical values — e.g. 10 lines of 1 with discountAmount=5: 9 shares
 * round 0.5 up to 1 (sum 9), leaving -4 for the last line. Largest-remainder
 * instead floors every share and hands out the (small, non-negative)
 * leftover one dong at a time to the lines with the biggest fractional part,
 * so no share can exceed its own line total or go negative — assumes the
 * caller already clamped `discountAmount` to `[0, groupTotal]`.
 */
export function allocateProportionally(lines: CartLine[], discountAmount: number): LineDiscount[] {
  const groupTotal = sumLines(lines);
  if (groupTotal <= 0 || lines.length === 0) return [];

  const rawShares = lines.map((line) => (discountAmount * lineTotal(line)) / groupTotal);
  const shares = rawShares.map((raw) => Math.floor(raw));
  let leftover = roundVnd(discountAmount) - shares.reduce((sum, share) => sum + share, 0);

  const byFractionDesc = rawShares
    .map((raw, index) => ({ index, fraction: raw - Math.floor(raw) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (let i = 0; leftover > 0 && i < byFractionDesc.length; i += 1, leftover -= 1) {
    shares[byFractionDesc[i].index] += 1;
  }

  return lines.map((line, index) => {
    const share = shares[index];
    const perUnit = line.quantity > 0 ? share / line.quantity : 0;
    return {
      lineId: line.lineId,
      discountAmount: share,
      unitPriceAfter: Math.max(0, roundVnd(line.unitPrice - perUnit)),
    };
  });
}
