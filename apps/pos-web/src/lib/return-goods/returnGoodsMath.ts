import type { ReturnInvoiceRow, ReturnableItem } from "./return-goods.types";

/** Clamps a user-entered return quantity to `[0, max]`, rounding non-integers down. */
export function clampReturnQty(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const floored = Math.floor(value);
  return Math.min(Math.max(floored, 0), Math.max(max, 0));
}

/** Sum of `totalAmount` across rows; used by the table summary footer. */
export function sumInvoiceTotals(rows: ReadonlyArray<ReturnInvoiceRow>): number {
  return rows.reduce((acc, row) => acc + row.totalAmount, 0);
}

/** Sum of (unitPrice × qty) for the items the operator chose to return. */
export function sumSelectedReturnTotal(
  items: ReadonlyArray<ReturnableItem>,
  qtyById: Readonly<Record<string, number>>,
  selectedIds: ReadonlySet<string>,
): number {
  return items.reduce((acc, item) => {
    if (!selectedIds.has(item.id)) return acc;
    const qty = qtyById[item.id] ?? 0;
    return acc + qty * item.unitPrice;
  }, 0);
}
