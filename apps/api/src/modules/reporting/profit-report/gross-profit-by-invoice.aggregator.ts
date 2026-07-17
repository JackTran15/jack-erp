import { ReportCellValue, ReportRow } from '@erp/shared-interfaces';

/** One invoice's header contribution for one day bucket (already type-signed). */
export interface InvoiceDayInput {
  id: string;
  /** Bucket key — yyyy-mm-dd. */
  day: string;
  /** signedGoods(invoice) — net goods amount before discount. */
  grossGoods: number;
  /** discountAmount + pointsDiscountAmount, signed by invoice type. */
  discount: number;
}

/** One invoice line's COGS contribution (already direction-signed: OUT +, IN −). */
export interface LineCostInput {
  invoiceId: string;
  costOfGoods: number;
}

export interface DayAggregate {
  day: string;
  grossGoods: number;
  discount: number;
  costOfGoods: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Group invoices (+ their lines' COGS) by day, summing every backing field. */
export function aggregateGrossProfitByDay(
  invoices: InvoiceDayInput[],
  lineCosts: LineCostInput[],
): Map<string, DayAggregate> {
  const buckets = new Map<string, DayAggregate>();
  const dayOf = new Map<string, string>();

  for (const inv of invoices) {
    dayOf.set(inv.id, inv.day);
    const b = buckets.get(inv.day) ?? { day: inv.day, grossGoods: 0, discount: 0, costOfGoods: 0 };
    b.grossGoods += inv.grossGoods;
    b.discount += inv.discount;
    buckets.set(inv.day, b);
  }

  for (const lc of lineCosts) {
    const day = dayOf.get(lc.invoiceId);
    if (!day) continue;
    const b = buckets.get(day);
    if (!b) continue;
    b.costOfGoods += lc.costOfGoods;
  }

  for (const b of buckets.values()) {
    b.grossGoods = round2(b.grossGoods);
    b.discount = round2(b.discount);
    b.costOfGoods = round2(b.costOfGoods);
  }

  return buckets;
}

/** Value of one column for one day bucket. */
export function cellValue(col: string, agg: DayAggregate): ReportCellValue {
  const revenue = round2(agg.grossGoods - agg.discount);
  switch (col) {
    case 'date':
      return agg.day;
    case 'grossGoods':
      return agg.grossGoods;
    case 'discount':
      return agg.discount;
    case 'revenue':
      return revenue;
    case 'costOfGoods':
      return agg.costOfGoods;
    case 'grossProfit':
      return round2(revenue - agg.costOfGoods);
    default:
      return null;
  }
}

export function buildRow(columns: string[], agg: DayAggregate): ReportRow {
  const row: ReportRow = {};
  for (const col of columns) row[col] = cellValue(col, agg);
  return row;
}

/** Footer totals — every column here is summable (dates aren't requested as a total). */
export function buildTotals(columns: string[], days: DayAggregate[]): ReportRow {
  const totalGrossGoods = round2(days.reduce((s, d) => s + d.grossGoods, 0));
  const totalDiscount = round2(days.reduce((s, d) => s + d.discount, 0));
  const totalRevenue = round2(totalGrossGoods - totalDiscount);
  const totalCost = round2(days.reduce((s, d) => s + d.costOfGoods, 0));
  const totalGrossProfit = round2(totalRevenue - totalCost);

  const out: ReportRow = {};
  for (const col of columns) {
    switch (col) {
      case 'grossGoods':
        out[col] = totalGrossGoods;
        break;
      case 'discount':
        out[col] = totalDiscount;
        break;
      case 'revenue':
        out[col] = totalRevenue;
        break;
      case 'costOfGoods':
        out[col] = totalCost;
        break;
      case 'grossProfit':
        out[col] = totalGrossProfit;
        break;
      default:
        out[col] = null;
    }
  }
  return out;
}
