import { ReportCellValue, ReportColumnDataType, ReportRow } from '@erp/shared-interfaces';
import { ItemDirection } from '../../pos/entities/invoice-item.entity';
import { getProfitByItemColumnDef } from './profit-by-item.columns';

/** Row grain — "Thống kê theo": Hàng hoá (item, default) | Mẫu mã (parent) | Nhóm hàng hóa (group). */
export type ProfitItemGrain = 'item' | 'parent' | 'group';

/**
 * One invoice LINE ITEM with its item metadata resolved INLINE. The report's
 * buildData fetches + assembles these; the aggregator stays pure for testing.
 */
export interface ProfitByItemRowInput {
  itemId: string | null;
  itemCode: string;
  itemName: string;
  parentId: string | null;
  parentSku: string | null;
  parentName: string | null;
  categoryId: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  unit: string | null;
  /** Item's current WAREHOUSE (non-showroom) location code, item grain only. */
  location: string | null;
  /** Line movement direction — OUT adds, IN (return leg) subtracts. */
  direction: ItemDirection;
  quantity: number;
  lineTotal: number;
  /** COGS snapshot at sale time (InvoiceItemEntity.costPrice), per unit. */
  costPrice: number;
}

/** One aggregated group (item / parent / category). */
export interface ProfitItemGroupAggregate {
  key: string;
  skuCode: string | null;
  itemName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  unit: string | null;
  /** Only ever set at item grain — a parent/category row spans multiple items, so no single location applies. */
  location: string | null;
  quantity: number;
  revenue: number;
  costOfGoods: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface Dimension {
  key: string | null;
  skuCode: string | null;
  itemName: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  unit: string | null;
  location: string | null;
}

const EMPTY_DIMENSION: Dimension = {
  key: null,
  skuCode: null,
  itemName: null,
  categoryCode: null,
  categoryName: null,
  unit: null,
  location: null,
};

/** Resolve the grouping key + dimension display fields for a row at a given grain. */
function dimensionOf(r: ProfitByItemRowInput, grain: ProfitItemGrain): Dimension {
  switch (grain) {
    case 'group':
      return r.categoryId
        ? {
            key: r.categoryId,
            skuCode: null,
            itemName: null,
            categoryCode: r.categoryCode,
            categoryName: r.categoryName ?? r.categoryCode ?? r.categoryId,
            unit: null,
            location: null,
          }
        : EMPTY_DIMENSION;
    case 'parent':
      // Group by parent product (Mẫu mã) — spans multiple items, so no single
      // location applies (see EMPTY_DIMENSION/location comment above); items
      // without a parent fall back to item grain, still without location.
      return r.parentId
        ? {
            key: r.parentId,
            skuCode: r.parentSku,
            itemName: r.parentName ?? r.parentSku ?? r.itemName,
            categoryCode: r.categoryCode,
            categoryName: r.categoryName,
            unit: r.unit,
            location: null,
          }
        : {
            key: r.itemId ?? r.itemCode,
            skuCode: r.itemCode,
            itemName: r.itemName,
            categoryCode: r.categoryCode,
            categoryName: r.categoryName,
            unit: r.unit,
            location: null,
          };
    case 'item':
    default:
      return {
        key: r.itemId ?? r.itemCode,
        skuCode: r.itemCode,
        itemName: r.itemName,
        categoryCode: r.categoryCode,
        categoryName: r.categoryName,
        unit: r.unit,
        location: r.location,
      };
  }
}

/**
 * Group rows by the grain key and sum quantity/revenue/costOfGoods. Rows with
 * no key for the grain (e.g. an item with no category under statBy=group) are
 * skipped. Sorted by the dimension display name (vi locale) for stable order.
 */
export function aggregateProfitByItem(
  rows: ProfitByItemRowInput[],
  grain: ProfitItemGrain,
): ProfitItemGroupAggregate[] {
  const byKey = new Map<string, ProfitItemGroupAggregate>();
  for (const r of rows) {
    const d = dimensionOf(r, grain);
    if (d.key === null) continue;
    let agg = byKey.get(d.key);
    if (!agg) {
      agg = {
        key: d.key,
        skuCode: d.skuCode,
        itemName: d.itemName,
        categoryCode: d.categoryCode,
        categoryName: d.categoryName,
        unit: d.unit,
        location: d.location,
        quantity: 0,
        revenue: 0,
        costOfGoods: 0,
      };
      byKey.set(d.key, agg);
    }
    // Net returns/exchanges via line direction: OUT adds, IN (return leg) subtracts.
    const sign = r.direction === ItemDirection.IN ? -1 : 1;
    agg.quantity += sign * r.quantity;
    agg.revenue += sign * r.lineTotal;
    agg.costOfGoods += sign * r.quantity * r.costPrice;
  }
  return [...byKey.values()]
    .map((a) => ({
      ...a,
      quantity: round2(a.quantity),
      revenue: round2(a.revenue),
      costOfGoods: round2(a.costOfGoods),
    }))
    .sort((a, b) => (a.itemName ?? a.categoryName ?? '').localeCompare(b.itemName ?? b.categoryName ?? '', 'vi'));
}

/** Value of one column for one aggregated group (what the FE shows AND filters apply to). */
export function itemGroupCellValue(
  col: string,
  agg: ProfitItemGroupAggregate,
): ReportCellValue {
  const grossProfit = round2(agg.revenue - agg.costOfGoods);
  switch (col) {
    case 'skuCode':
      return agg.skuCode;
    case 'itemName':
      return agg.itemName;
    case 'categoryCode':
      return agg.categoryCode;
    case 'categoryName':
      return agg.categoryName;
    case 'unit':
      return agg.unit;
    case 'location':
      return agg.location;
    case 'quantity':
      return agg.quantity;
    case 'revenue':
      return agg.revenue;
    case 'costOfGoods':
      return agg.costOfGoods;
    case 'grossProfit':
      return grossProfit;
    case 'profitPerUnit':
      return agg.quantity !== 0 ? round2(grossProfit / agg.quantity) : null;
    case 'marginOnRevenue':
      return agg.revenue !== 0 ? round2((grossProfit / agg.revenue) * 100) : null;
    case 'marginOnCost':
      return agg.costOfGoods !== 0 ? round2((grossProfit / agg.costOfGoods) * 100) : null;
    default:
      return null;
  }
}

export function buildItemGroupRow(columns: string[], agg: ProfitItemGroupAggregate): ReportRow {
  const row: ReportRow = {};
  for (const col of columns) row[col] = itemGroupCellValue(col, agg);
  return row;
}

/**
 * Footer totals — CURRENCY/NUMBER columns are summed then `grossProfit`-derived
 * ratios are recomputed from the SUMMED totals (not averaged per-row).
 * `profitPerUnit` has no meaningful sum across mixed items — its footer cell is
 * always null (matches the reference UI: the "Lợi nhuận đơn vị" column is blank
 * on the Tổng row).
 */
export function buildItemGroupTotals(
  columns: string[],
  groups: ProfitItemGroupAggregate[],
): ReportRow {
  const totalRevenue = round2(groups.reduce((s, g) => s + g.revenue, 0));
  const totalCost = round2(groups.reduce((s, g) => s + g.costOfGoods, 0));
  const totalQuantity = round2(groups.reduce((s, g) => s + g.quantity, 0));
  const totalGrossProfit = round2(totalRevenue - totalCost);

  const out: ReportRow = {};
  for (const col of columns) {
    switch (col) {
      case 'quantity':
        out[col] = totalQuantity;
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
      case 'profitPerUnit':
        out[col] = null;
        break;
      case 'marginOnRevenue':
        out[col] = totalRevenue !== 0 ? round2((totalGrossProfit / totalRevenue) * 100) : null;
        break;
      case 'marginOnCost':
        out[col] = totalCost !== 0 ? round2((totalGrossProfit / totalCost) * 100) : null;
        break;
      default:
        out[col] = null;
    }
  }
  return out;
}

export function columnDataType(col: string): ReportColumnDataType {
  return getProfitByItemColumnDef(col)?.type ?? ReportColumnDataType.STRING;
}
