import {
  ReportCellValue,
  ReportColumnDataType,
  ReportRow,
} from '@erp/shared-interfaces';
import {
  getRevenueByItemColumnDef,
  RevenueByItemDimension,
} from './revenue-by-item.columns';

/**
 * Internal row grain. Public `statBy` is item|parent|group; `statisticByBrand`
 * adds the 'brand' grain. 'parent' groups by the item's parent product
 * (item.productId); items without a parent product fall back to item grain.
 */
export type ItemGrain = 'item' | 'parent' | 'group' | 'brand';

/**
 * One invoice LINE ITEM with its item metadata resolved INLINE (category/brand
 * flattened onto the row, not a root `{[id]: X}` map). The report's buildData
 * fetches + assembles these; the aggregator stays pure for testing.
 */
export interface RevenueByItemRowInput {
  itemId: string | null;
  itemCode: string;
  itemName: string;
  /** Parent product (mẫu mã) — for statBy=parent; null when the item has no parent. */
  parentId: string | null;
  parentSku: string | null;
  parentName: string | null;
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

const EMPTY_DIMENSION: Dimension = {
  key: null,
  sku: null,
  name: '',
  itemCategory: null,
  brand: null,
  unit: null,
};

/** Resolve the grouping key + dimension display fields for a row at a given grain. */
function dimensionOf(r: RevenueByItemRowInput, grain: ItemGrain): Dimension {
  switch (grain) {
    case 'group':
      return r.categoryId
        ? {
            key: r.categoryId,
            sku: null,
            name: r.itemCategory ?? r.categoryId,
            itemCategory: r.itemCategory,
            brand: null,
            unit: null,
          }
        : EMPTY_DIMENSION;
    case 'brand':
      return r.brand
        ? {
            key: r.brand,
            sku: null,
            name: r.brand,
            itemCategory: null,
            brand: r.brand,
            unit: null,
          }
        : EMPTY_DIMENSION;
    case 'parent':
      // Group by parent product (mẫu mã); items without a parent fall back to item grain.
      return r.parentId
        ? {
            key: r.parentId,
            sku: r.parentSku,
            name: r.parentName ?? r.parentSku ?? r.itemName,
            itemCategory: r.itemCategory,
            brand: r.brand,
            unit: r.unit,
          }
        : {
            key: r.itemId ?? r.itemCode,
            sku: r.itemCode,
            name: r.itemName,
            itemCategory: r.itemCategory,
            brand: r.brand,
            unit: r.unit,
          };
    case 'item':
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
  grain: ItemGrain,
): ItemGroupAggregate[] {
  const byKey = new Map<string, ItemGroupAggregate>();
  for (const r of rows) {
    const d = dimensionOf(r, grain);
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
): ReportRow {
  const row: ReportRow = {};
  for (const col of columns) row[col] = itemGroupCellValue(col, agg);
  return row;
}

/**
 * Footer totals — NUMBER/CURRENCY columns are summed across groups. The PERCENT
 * promoRate has no meaningful sum, so its footer cell is null.
 */
export function buildItemGroupTotals(
  columns: string[],
  groups: ItemGroupAggregate[],
): ReportRow {
  const out: ReportRow = {};
  for (const col of columns) {
    const type = itemGroupColumnType(col);
    const summable =
      type === ReportColumnDataType.CURRENCY ||
      type === ReportColumnDataType.NUMBER;
    out[col] = summable
      ? round2(
          groups.reduce((sum, g) => sum + Number(itemGroupCellValue(col, g) ?? 0), 0),
        )
      : null;
  }
  return out;
}
