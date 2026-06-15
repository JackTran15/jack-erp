import {
  ReportCell,
  ReportCellValue,
  ReportColumnDataType,
  ReportGroupBy,
} from '@erp/shared-interfaces';
import {
  getRevenueByItemColumnDef,
  RevenueByItemDimension,
} from './revenue-by-item.columns';

/**
 * One invoice LINE ITEM with its item metadata resolved INLINE (category/brand
 * flattened onto the row, not a root `{[id]: X}` map). The report's buildData
 * fetches + assembles these; the aggregator stays pure for testing.
 */
export interface RevenueByItemRowInput {
  itemId: string | null;
  itemCode: string;
  itemName: string;
  categoryId: string | null;
  itemCategory: string | null;
  brand: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineTotal: number;
}

/** One aggregated group (item / category / brand). */
export interface ItemGroupAggregate {
  key: string;
  sku: string | null;
  name: string;
  itemCategory: string | null;
  brand: string | null;
  unit: string | null;
  quantity: number;
  goods: number;
  discount: number;
  total: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

interface Dimension {
  key: string | null;
  sku: string | null;
  name: string;
  itemCategory: string | null;
  brand: string | null;
  unit: string | null;
}

/** Resolve the grouping key + dimension display fields for a row at a given grain. */
function dimensionOf(r: RevenueByItemRowInput, groupBy: ReportGroupBy): Dimension {
  switch (groupBy) {
    case ReportGroupBy.GROUP:
      return r.categoryId
        ? {
            key: r.categoryId,
            sku: null,
            name: r.itemCategory ?? r.categoryId,
            itemCategory: r.itemCategory,
            brand: null,
            unit: null,
          }
        : { key: null, sku: null, name: '', itemCategory: null, brand: null, unit: null };
    case ReportGroupBy.BRAND:
      return r.brand
        ? {
            key: r.brand,
            sku: null,
            name: r.brand,
            itemCategory: null,
            brand: r.brand,
            unit: null,
          }
        : { key: null, sku: null, name: '', itemCategory: null, brand: null, unit: null };
    case ReportGroupBy.ITEM:
    default:
      return {
        key: r.itemId ?? r.itemCode,
        sku: r.itemCode,
        name: r.itemName,
        itemCategory: r.itemCategory,
        brand: r.brand,
        unit: r.unit,
      };
  }
}

/**
 * Group rows by the grain key and sum measures. Rows with no key for the grain
 * (e.g. an item with no brand under groupBy=brand) are skipped. Sorted by the
 * dimension display name (vi locale) for a stable order.
 */
export function aggregateByItem(
  rows: RevenueByItemRowInput[],
  groupBy: ReportGroupBy,
): ItemGroupAggregate[] {
  const byKey = new Map<string, ItemGroupAggregate>();
  for (const r of rows) {
    const d = dimensionOf(r, groupBy);
    if (d.key === null) continue;
    let agg = byKey.get(d.key);
    if (!agg) {
      agg = {
        key: d.key,
        sku: d.sku,
        name: d.name,
        itemCategory: d.itemCategory,
        brand: d.brand,
        unit: d.unit,
        quantity: 0,
        goods: 0,
        discount: 0,
        total: 0,
      };
      byKey.set(d.key, agg);
    }
    agg.quantity += r.quantity;
    agg.goods += r.quantity * r.unitPrice;
    agg.discount += r.lineDiscount;
    agg.total += r.lineTotal;
  }
  return [...byKey.values()]
    .map((a) => ({
      ...a,
      quantity: round2(a.quantity),
      goods: round2(a.goods),
      discount: round2(a.discount),
      total: round2(a.total),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

const dimensionValue = (
  field: RevenueByItemDimension,
  agg: ItemGroupAggregate,
): ReportCellValue => {
  switch (field) {
    case 'sku':
      return agg.sku;
    case 'name':
      return agg.name;
    case 'itemCategory':
      return agg.itemCategory;
    case 'brand':
      return agg.brand;
    case 'unit':
      return agg.unit;
  }
};

/** Value of one column for one aggregated group (what the FE shows AND filters apply to). */
export function itemGroupCellValue(
  col: string,
  agg: ItemGroupAggregate,
): ReportCellValue {
  const def = getRevenueByItemColumnDef(col);
  if (!def) return null;
  switch (def.source.kind) {
    case 'dimension':
      return dimensionValue(def.source.field, agg);
    case 'measure':
      return agg[def.source.field];
    case 'computed':
      // promoRate — discount as a % of goods.
      return agg.goods > 0 ? round2((agg.discount / agg.goods) * 100) : 0;
    case 'placeholder':
      return def.source.placeholder;
  }
}

export function itemGroupColumnType(col: string): ReportColumnDataType {
  return getRevenueByItemColumnDef(col)?.type ?? ReportColumnDataType.STRING;
}

export function buildItemGroupRow(
  columns: string[],
  agg: ItemGroupAggregate,
): ReportCell[] {
  return columns.map((col) => ({
    col,
    type: itemGroupColumnType(col),
    value: itemGroupCellValue(col, agg),
  }));
}

/**
 * Footer totals — NUMBER/CURRENCY columns are summed across groups. The PERCENT
 * promoRate has no meaningful sum, so its footer cell is null.
 */
export function buildItemGroupTotals(
  columns: string[],
  groups: ItemGroupAggregate[],
): ReportCell[] {
  return columns.map((col) => {
    const type = itemGroupColumnType(col);
    const summable =
      type === ReportColumnDataType.CURRENCY ||
      type === ReportColumnDataType.NUMBER;
    const value = summable
      ? round2(
          groups.reduce((sum, g) => sum + Number(itemGroupCellValue(col, g) ?? 0), 0),
        )
      : null;
    return { col, type, value };
  });
}
