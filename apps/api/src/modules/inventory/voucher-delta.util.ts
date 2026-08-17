/**
 * Line-level difference between what a warehouse voucher currently has on the books
 * and what the user just submitted.
 *
 * Editing a posted voucher and deleting one are the same computation: deleting is an
 * edit whose `after` is empty. Every stock-ledger and journal adjustment this feature
 * writes is derived from the result, so the arithmetic lives here on its own — no Nest,
 * no TypeORM, no queries — and is tested directly.
 *
 * Sign convention: deltas are expressed in the voucher's own direction. A positive
 * `quantityDelta` means the voucher now carries more than the books say, whichever way
 * the voucher moves stock. Callers translate that into a signed ledger movement.
 */

/** goods_receipt_lines.quantity / goods_issue_lines.quantity are numeric(18,3). */
const QUANTITY_SCALE = 3;
/** Money columns are numeric(18,2) throughout. */
const MONEY_SCALE = 2;

export interface VoucherLineSnapshot {
  itemId: string;
  locationId: string;
  quantity: number | string;
  unitPrice: number | string;
}

export interface VoucherLineDelta {
  itemId: string;
  locationId: string;
  quantityDelta: number;
  valueDelta: number;
  /** Always positive — the ledger stores cost per unit unsigned. */
  unitCostForDelta: number;
}

interface Aggregate {
  itemId: string;
  locationId: string;
  quantity: number;
  value: number;
}

/** Half-up rounding that stays symmetric around zero (Math.round(-2.5) is -2). */
function round(value: number, scale: number): number {
  const factor = 10 ** scale;
  const scaled = value * factor;
  const rounded =
    scaled >= 0
      ? Math.round(scaled + Number.EPSILON)
      : -Math.round(-scaled + Number.EPSILON);
  return rounded / factor;
}

function keyOf(line: { itemId: string; locationId: string }): string {
  return `${line.itemId}::${line.locationId}`;
}

/**
 * Collapse lines onto their (item, location) pair. A voucher may legitimately carry the
 * same item at the same location on two rows; comparing row by row would report a
 * phantom delta, so both sides are summed before they are compared.
 */
function aggregate(lines: VoucherLineSnapshot[]): Map<string, Aggregate> {
  const byKey = new Map<string, Aggregate>();
  for (const line of lines) {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
      throw new Error(
        `Voucher line for item ${line.itemId} has a non-numeric quantity or unit price`,
      );
    }
    const key = keyOf(line);
    const current = byKey.get(key);
    if (current) {
      current.quantity += quantity;
      current.value += quantity * unitPrice;
    } else {
      byKey.set(key, {
        itemId: line.itemId,
        locationId: line.locationId,
        quantity,
        value: quantity * unitPrice,
      });
    }
  }
  return byKey;
}

/**
 * Unit cost to stamp on the adjustment. When the quantity moves, it is whatever the
 * value change implies per unit; when only the value moves, it is the voucher's own
 * price for that line, which keeps the number readable in the stock ledger even though
 * `lineValue` is what actually drives the balance.
 */
function resolveUnitCost(
  quantityDelta: number,
  valueDelta: number,
  after: Aggregate | undefined,
  before: Aggregate | undefined,
): number {
  if (quantityDelta !== 0) {
    return round(Math.abs(valueDelta / quantityDelta), MONEY_SCALE);
  }
  const source = after && after.quantity !== 0 ? after : before;
  if (!source || source.quantity === 0) return 0;
  return round(Math.abs(source.value / source.quantity), MONEY_SCALE);
}

/**
 * Difference between two snapshots of a voucher's lines, keyed by (item, location).
 * Pairs that did not move at all are left out; `after = []` yields the full reversal
 * that deleting a voucher needs.
 */
export function computeVoucherDelta(
  before: VoucherLineSnapshot[],
  after: VoucherLineSnapshot[],
): VoucherLineDelta[] {
  const beforeByKey = aggregate(before);
  const afterByKey = aggregate(after);

  const deltas: VoucherLineDelta[] = [];
  for (const key of new Set([...beforeByKey.keys(), ...afterByKey.keys()])) {
    const b = beforeByKey.get(key);
    const a = afterByKey.get(key);
    const quantityDelta = round(
      (a?.quantity ?? 0) - (b?.quantity ?? 0),
      QUANTITY_SCALE,
    );
    const valueDelta = round((a?.value ?? 0) - (b?.value ?? 0), MONEY_SCALE);
    if (quantityDelta === 0 && valueDelta === 0) continue;

    const anchor = a ?? b!;
    deltas.push({
      itemId: anchor.itemId,
      locationId: anchor.locationId,
      quantityDelta,
      valueDelta,
      unitCostForDelta: resolveUnitCost(quantityDelta, valueDelta, a, b),
    });
  }

  // Stable order so ledger rows, logs and test expectations line up run after run.
  return deltas.sort(
    (x, y) =>
      x.itemId.localeCompare(y.itemId) ||
      x.locationId.localeCompare(y.locationId),
  );
}
