import {
  ColumnFilter,
  ReportCellValue,
  ReportColumnDataType,
  ReportRow,
} from '@erp/shared-interfaces';
import {
  getSummaryColumnDef,
  InvoiceSumField,
  isDynamicColumnKey,
  parseDynamicColumnKey,
} from './invoice-report.columns';

export interface InvoiceAggInput {
  id: string;
  /** Bucket key — yyyy-mm-dd. */
  day: string;
  subtotal: number;
  discountAmount: number;
  pointsDiscountAmount: number;
  totalPaid: number;
}

export interface PaymentAggInput {
  invoiceId: string;
  paymentMethod: string;
  amount: number;
  accountId: string;
}

export interface PromotionAggInput {
  invoiceId: string;
  promotionType: string;
  discountAmount: number;
}

export interface DayAggregate {
  day: string;
  sums: Record<InvoiceSumField, number>;
  cash: number;
  voucher: number;
  /** COA accountId -> Σ payment amount. */
  byAccount: Record<string, number>;
}

const CASH_METHOD = 'cash';
const VOUCHER_PROMOTION = 'voucher';

const emptyDay = (day: string): DayAggregate => ({
  day,
  sums: { subtotal: 0, discountAmount: 0, pointsDiscountAmount: 0, totalPaid: 0 },
  cash: 0,
  voucher: 0,
  byAccount: {},
});

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Group invoices (+ their payments and promotions) by day, summing every backing field. */
export function aggregateByDay(
  invoices: InvoiceAggInput[],
  payments: PaymentAggInput[],
  promotions: PromotionAggInput[],
): Map<string, DayAggregate> {
  const buckets = new Map<string, DayAggregate>();
  const dayOf = new Map<string, string>();

  for (const inv of invoices) {
    dayOf.set(inv.id, inv.day);
    const b = buckets.get(inv.day) ?? emptyDay(inv.day);
    b.sums.subtotal += inv.subtotal;
    b.sums.discountAmount += inv.discountAmount;
    b.sums.pointsDiscountAmount += inv.pointsDiscountAmount;
    b.sums.totalPaid += inv.totalPaid;
    buckets.set(inv.day, b);
  }

  for (const p of payments) {
    const day = dayOf.get(p.invoiceId);
    if (!day) continue;
    const b = buckets.get(day);
    if (!b) continue;
    if (p.paymentMethod === CASH_METHOD) b.cash += p.amount;
    b.byAccount[p.accountId] = (b.byAccount[p.accountId] ?? 0) + p.amount;
  }

  for (const pr of promotions) {
    const day = dayOf.get(pr.invoiceId);
    if (!day) continue;
    const b = buckets.get(day);
    if (!b) continue;
    if (pr.promotionType === VOUCHER_PROMOTION) b.voucher += pr.discountAmount;
  }

  return buckets;
}

export function combineAggregates(aggs: DayAggregate[]): DayAggregate {
  const total = emptyDay('');
  for (const a of aggs) {
    total.sums.subtotal += a.sums.subtotal;
    total.sums.discountAmount += a.sums.discountAmount;
    total.sums.pointsDiscountAmount += a.sums.pointsDiscountAmount;
    total.sums.totalPaid += a.sums.totalPaid;
    total.cash += a.cash;
    total.voucher += a.voucher;
    for (const [k, v] of Object.entries(a.byAccount)) {
      total.byAccount[k] = (total.byAccount[k] ?? 0) + v;
    }
  }
  return total;
}

/** Aggregated value of one column for one day's bucket (the value the FE shows AND the value filters apply to). */
export function cellValue(col: string, agg: DayAggregate): ReportCellValue {
  const dyn = parseDynamicColumnKey(col);
  if (dyn) return agg.byAccount[dyn.accountId] ?? 0;

  const def = getSummaryColumnDef(col);
  if (!def) return null;
  switch (def.source.kind) {
    case 'groupKey':
      return agg.day || null;
    case 'invoiceSum':
      return agg.sums[def.source.field];
    case 'cashPayments':
      return agg.cash;
    case 'voucherPromotions':
      return agg.voucher;
    case 'computed':
      if (def.source.computed === 'actual') return agg.sums.totalPaid;
      if (def.source.computed === 'total') {
        return agg.sums.subtotal - agg.sums.discountAmount - agg.sums.pointsDiscountAmount;
      }
      // promoRate: discount as a percentage of goods
      return agg.sums.subtotal > 0
        ? round2((agg.sums.discountAmount / agg.sums.subtotal) * 100)
        : 0;
  }
}

export function columnType(col: string): ReportColumnDataType {
  if (isDynamicColumnKey(col)) return ReportColumnDataType.CURRENCY;
  return getSummaryColumnDef(col)?.type ?? ReportColumnDataType.STRING;
}

export function buildRow(columns: string[], agg: DayAggregate): ReportRow {
  const row: ReportRow = {};
  for (const col of columns) row[col] = cellValue(col, agg);
  return row;
}

export function buildTotals(columns: string[], aggs: DayAggregate[]): ReportRow {
  const combined = combineAggregates(aggs);
  const row: ReportRow = {};
  // The date column has no meaningful total.
  for (const col of columns) row[col] = col === 'date' ? null : cellValue(col, combined);
  return row;
}

/** True when `f` carries any text operator (string-column filters). */
function hasTextOperator(f: ColumnFilter): boolean {
  return (
    f.contains !== undefined ||
    f.equals !== undefined ||
    f.startsWith !== undefined ||
    f.endsWith !== undefined ||
    f.notContains !== undefined
  );
}

/** Post-aggregate predicate for a per-column filter. All operators present in `f` must hold (AND). */
export function matchColumnFilter(value: ReportCellValue, f: ColumnFilter): boolean {
  // String/text column (or a text operator targeting an empty cell).
  if (typeof value === 'string' || hasTextOperator(f)) {
    const s = String(value ?? '');
    const lower = s.toLowerCase();
    // date / string column — yyyy-mm-dd sorts lexicographically
    if (f.from !== undefined && s < f.from) return false;
    if (f.to !== undefined && s > f.to) return false;
    if (f.eq !== undefined && s !== String(f.eq)) return false;
    if (f.equals !== undefined && s !== f.equals) return false;
    if (f.contains !== undefined && !lower.includes(f.contains.toLowerCase())) return false;
    if (f.startsWith !== undefined && !s.startsWith(f.startsWith)) return false;
    if (f.endsWith !== undefined && !s.endsWith(f.endsWith)) return false;
    if (f.notContains !== undefined && lower.includes(f.notContains.toLowerCase())) {
      return false;
    }
    return true;
  }
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  if (f.eq !== undefined && n !== Number(f.eq)) return false;
  if (f.lt !== undefined && !(n < f.lt)) return false;
  if (f.lte !== undefined && !(n <= f.lte)) return false;
  if (f.gt !== undefined && !(n > f.gt)) return false;
  if (f.gte !== undefined && !(n >= f.gte)) return false;
  return true;
}
