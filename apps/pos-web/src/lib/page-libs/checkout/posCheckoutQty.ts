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

/**
 * Raw nhập vào có phải một số âm thực sự không?
 *
 * Dùng để phản hồi cho thu ngân khi giá trị bị kẹp: gõ `-5` lặng lẽ thành `1`
 * dễ khiến người dùng tưởng hệ thống chấp nhận bán số lượng âm.
 *
 * Cố tình KHÔNG coi chuỗi rỗng / `-` / rác là âm — `onChangeRaw` bắn theo từng
 * phím, nên xóa trắng ô để gõ lại sẽ nổ cảnh báo giả.
 *
 * Chỉ áp dụng cho dòng BÁN. Dòng trả hiển thị SL âm là đúng nghiệp vụ.
 */
export function isPosQtyRawNegative(raw: string): boolean {
  const n = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(n) && n < 0;
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
