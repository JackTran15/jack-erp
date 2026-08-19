import { InvoiceItemEntity } from '../entities/invoice-item.entity';

const round = (v: number) => Math.round(v * 100) / 100;

/** The header money a customer never actually handed over. */
export interface RefundableInvoiceHeader {
  discountAmount?: number | string | null;
  pointsDiscountAmount?: number | string | null;
  depositAmount?: number | string | null;
}

/**
 * What ONE unit of each line of an invoice is worth back to the customer.
 *
 * A refund gives back what was paid, not what the price tag said. On an invoice
 * with a 20% promotion, a 750.000 pair cost the customer 600.000, and 600.000 is
 * what returning it is worth — crediting the list price would hand back money
 * that was never collected.
 *
 * Two layers of discount come off:
 *   1. the promotion allocated to that line (`promotionDiscount`);
 *   2. its proportional share of the header money that was never paid either —
 *      points, deposit, and any manual invoice discount not already allocated
 *      per line.
 *
 * The header share is a flat proportion of net line value, so it factors out to
 * a single multiplier and the result stays linear per unit. That is what lets
 * the POS screen price a return cart line-by-line and still land on exactly the
 * figure `computeReturnedNet` charges at checkout.
 *
 * Keyed by `InvoiceItemEntity.id` — the id a return line points at through
 * `originalInvoiceItemId`.
 */
const netLineOf = (it: InvoiceItemEntity) =>
  Number(it.lineTotal) - Number(it.promotionDiscount ?? 0);

/**
 * The proportion of net line value that survives the header money the customer
 * never paid: points, deposit, and any manual invoice discount not already
 * allocated per line.
 *
 * `discountAmount` holds manual + promotion + voucher together, so the part
 * already allocated per line is subtracted first to avoid counting it twice.
 * A residual larger than the goods themselves would make refunds negative;
 * nothing back is the floor.
 */
export function refundableFactor(
  invoice: RefundableInvoiceHeader,
  items: InvoiceItemEntity[],
): number {
  const totalPromotionDiscount = items.reduce(
    (sum, it) => sum + Number(it.promotionDiscount ?? 0),
    0,
  );
  const sumNetLine = items.reduce((sum, it) => sum + netLineOf(it), 0);
  if (sumNetLine <= 0) return 1;

  const headerResidual =
    Number(invoice.pointsDiscountAmount ?? 0) +
    Number(invoice.depositAmount ?? 0) +
    Math.max(0, Number(invoice.discountAmount ?? 0) - totalPromotionDiscount);

  return Math.max(0, 1 - headerResidual / sumNetLine);
}

export function refundableUnitValues(
  invoice: RefundableInvoiceHeader,
  items: InvoiceItemEntity[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (!items.length) return out;

  const factor = refundableFactor(invoice, items);
  for (const it of items) {
    const qty = Number(it.quantity);
    const perUnit = qty > 0 ? netLineOf(it) / qty : netLineOf(it);
    out.set(it.id, round(perUnit * factor));
  }
  return out;
}
