/**
 * Shared quantity rules for POS checkout: toolbar “SL”, cart line edits, add-to-cart.
 * Integer pieces, minimum {@link POS_CHECKOUT_QTY_MIN}; comma accepted as decimal separator in raw strings.
 */

export const POS_CHECKOUT_QTY_MIN = 1;

export interface ClampPosCheckoutQtyOptions {
  /**
   * Return-credit / exchange-return pane: stored `qty` is magnitude; UI may show a negative sign.
   * User input is clamped with `Math.abs` before applying the minimum.
   */
  treatAsSignedReturnMagnitude?: boolean;
}

/**
 * Parses raw input the same way as cart line qty: `,` → `.`, then floor to whole units.
 * Empty / invalid → `0` (caller should clamp with {@link clampPosCheckoutQty}).
 */
export function parsePosQtyRawFloored(raw: string): number {
  return Math.floor(Number.parseFloat(raw.replace(",", ".")) || 0);
}

/** Floored integer (or result of {@link parsePosQtyRawFloored}) → safe stored qty ≥ min. */
export function clampPosCheckoutQty(
  floored: number,
  options: ClampPosCheckoutQtyOptions = {},
): number {
  const { treatAsSignedReturnMagnitude = false } = options;
  if (treatAsSignedReturnMagnitude) {
    return Math.max(POS_CHECKOUT_QTY_MIN, Math.abs(floored));
  }
  return Math.max(POS_CHECKOUT_QTY_MIN, floored);
}

/** Raw qty field → safe stored qty. */
export function safePosCheckoutQtyFromRaw(
  raw: string,
  options: ClampPosCheckoutQtyOptions = {},
): number {
  return clampPosCheckoutQty(parsePosQtyRawFloored(raw), options);
}

/** Numeric value (steppers, `Number(raw)`, programmatic qty) → safe stored qty. */
export function clampPosCheckoutQtyNumber(
  n: number,
  options: ClampPosCheckoutQtyOptions = {},
): number {
  if (!Number.isFinite(n)) return POS_CHECKOUT_QTY_MIN;
  return clampPosCheckoutQty(Math.floor(n), options);
}
