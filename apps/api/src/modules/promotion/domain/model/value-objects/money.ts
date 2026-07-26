/** Rounds a VND amount to the nearest whole dong — the single rounding rule for the promotion engine. */
export function roundVnd(amount: number): number {
  return Math.round(amount);
}
