import { ReportColumnDataType } from '@erp/shared-interfaces';

/**
 * Column registry for the `revenue-by-item` report ("Doanh thu theo mặt hàng")
 * — ONE ROW PER ITEM (or category / brand, per the request `groupBy`). Kept
 * separate from the other report registries so the four reports never interfere.
 *
 * The catalog is FLAT (no bands) and has NO dynamic payment-method columns.
 * Leading DIMENSION columns change meaning with `groupBy`: at item grain
 * `sku`/`itemName`/`unit` are the item's; at group/brand grain `sku`/`unit` are
 * null and `itemName` carries the category/brand label.
 */
export type RevenueByItemDimension =
  | 'sku'
  | 'name'
  | 'itemCategory'
  | 'brand'
  | 'unit';

/** A summed measure off the aggregated group. */
export type RevenueByItemMeasure = 'quantity' | 'goods' | 'discount' | 'total';

/** How a column's value is produced (internal — not exposed in the catalog). */
export type RevenueByItemSource =
  | { kind: 'dimension'; field: RevenueByItemDimension }
  | { kind: 'measure'; field: RevenueByItemMeasure }
  | { kind: 'computed'; computed: 'promoRate' }
  | { kind: 'placeholder'; placeholder: 0 };

export interface RevenueByItemColumnDef {
  key: string;
  type: ReportColumnDataType;
  source: RevenueByItemSource;
}

/**
 * Curated whitelist in on-screen order: dimension columns then measures.
 * `unitPrice` is intentionally absent — a per-unit price has no meaning once
 * lines are aggregated. `revenue.promoPoints` is a placeholder (0) until a
 * per-line loyalty backing exists. Labels live in INVOICE_REPORT_COLUMN_LABELS_VI.
 */
export const REVENUE_BY_ITEM_COLUMNS: RevenueByItemColumnDef[] = [
  { key: 'sku', type: ReportColumnDataType.STRING, source: { kind: 'dimension', field: 'sku' } },
  { key: 'itemName', type: ReportColumnDataType.STRING, source: { kind: 'dimension', field: 'name' } },
  { key: 'itemCategory', type: ReportColumnDataType.STRING, source: { kind: 'dimension', field: 'itemCategory' } },
  { key: 'brand', type: ReportColumnDataType.STRING, source: { kind: 'dimension', field: 'brand' } },
  { key: 'unit', type: ReportColumnDataType.STRING, source: { kind: 'dimension', field: 'unit' } },
  { key: 'quantity', type: ReportColumnDataType.NUMBER, source: { kind: 'measure', field: 'quantity' } },
  { key: 'revenue.goods', type: ReportColumnDataType.CURRENCY, source: { kind: 'measure', field: 'goods' } },
  { key: 'revenue.discount', type: ReportColumnDataType.CURRENCY, source: { kind: 'measure', field: 'discount' } },
  { key: 'revenue.total', type: ReportColumnDataType.CURRENCY, source: { kind: 'measure', field: 'total' } },
  { key: 'revenue.promoRate', type: ReportColumnDataType.PERCENT, source: { kind: 'computed', computed: 'promoRate' } },
  { key: 'revenue.promoPoints', type: ReportColumnDataType.CURRENCY, source: { kind: 'placeholder', placeholder: 0 } },
];

const BY_KEY = new Map(REVENUE_BY_ITEM_COLUMNS.map((c) => [c.key, c]));

export const isKnownRevenueByItemColumn = (key: string): boolean => BY_KEY.has(key);
export const getRevenueByItemColumnDef = (
  key: string,
): RevenueByItemColumnDef | undefined => BY_KEY.get(key);
