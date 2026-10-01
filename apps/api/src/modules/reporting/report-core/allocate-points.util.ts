/**
 * Spread an invoice's redeemed-points amount across its lines.
 *
 * There is no per-line loyalty record, so "Điểm KM" at item grain is an
 * *allocation*, not a recorded fact — see ADR-04 of
 * `.ai/features/sales-report-km-and-drilldown`. Replace this the day a per-line
 * redemption row exists, and expect the figures to move.
 *
 * Sign and proportion are deliberately separate concerns:
 *
 * - The **sign** belongs to the caller. Pass the amount already signed the same
 *   way the invoice-grain reports sign it (`invoiceTypeSign × pointsAmount`),
 *   so a RETURN's allocation is negative and the four reports agree on Σ.
 * - The **proportion** is each line's share of goods, taken over the OUT lines —
 *   points are redeemed against what is sold, not against what comes back. A
 *   pure RETURN has no OUT line, so it falls back to its IN lines.
 *
 * Rounding drift lands on the last line, so `Σ allocation === amount` exactly:
 * accountants reconcile this column against the invoice header.
 */
import { ItemDirection } from '../../pos/entities/invoice-item.entity';
import { InvoiceType } from '../../pos/entities/invoice.entity';
import { invoiceTypeSign } from './report-query.util';

export interface AllocatablePointsLine {
  direction: ItemDirection;
  lineTotal: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function allocatePoints<T extends AllocatablePointsLine>(
  amount: number,
  lines: T[],
): Map<T, number> {
  const out = new Map<T, number>();
  if (!lines.length) return out;

  const total = Number(amount ?? 0);
  for (const l of lines) out.set(l, 0);
  if (total === 0) return out;

  const sold = lines.filter((l) => l.direction !== ItemDirection.IN);
  const eligible = sold.length ? sold : lines;
  const weights = eligible.map((l) => Math.abs(Number(l.lineTotal ?? 0)));
  const denominator = weights.reduce((a, b) => a + b, 0);

  // Every eligible line free (a 100%-discounted sale, a gift-only invoice):
  // put the whole amount on the first one rather than letting it vanish.
  if (denominator === 0) {
    out.set(eligible[0], round2(total));
    return out;
  }

  let running = 0;
  eligible.forEach((l, i) => {
    if (i === eligible.length - 1) {
      out.set(l, round2(total - running));
      return;
    }
    const share = round2((total * weights[i]) / denominator);
    running = round2(running + share);
    out.set(l, share);
  });
  return out;
}

/**
 * Every line's share of its invoice's redeemed points, signed the way the
 * invoice-grain reports sign the header (`invoiceTypeSign × pointsAmount`).
 *
 * Shares are a property of the invoice, so pass ALL of an invoice's lines —
 * allocate before any line filter, or filtering by category inflates every
 * share. Lines whose invoice is not in `invoices` get no entry.
 */
export function allocateInvoicePoints<T extends AllocatablePointsLine & { invoiceId: string }>(
  invoices: Array<{ id: string; type: InvoiceType; pointsDiscountAmount?: number | string | null }>,
  lines: T[],
): Map<T, number> {
  const out = new Map<T, number>();
  const linesByInvoice = new Map<string, T[]>();
  for (const li of lines) {
    const bucket = linesByInvoice.get(li.invoiceId);
    if (bucket) bucket.push(li);
    else linesByInvoice.set(li.invoiceId, [li]);
  }
  for (const invoice of invoices) {
    const own = linesByInvoice.get(invoice.id);
    if (!own?.length) continue;
    const signedPoints =
      invoiceTypeSign(invoice.type) * Number(invoice.pointsDiscountAmount ?? 0);
    for (const [line, amount] of allocatePoints(signedPoints, own)) {
      out.set(line, amount);
    }
  }
  return out;
}
