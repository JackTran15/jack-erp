import { ReportColumnDataType } from '@erp/shared-interfaces';
import { ReportBandId } from './invoice-report.columns';

/**
 * Column registry for the `revenue-by-item` report ("Doanh thu theo mặt hàng")
 * — ONE ROW PER ITEM (or category / brand, per the request `groupBy`). Kept
 * separate from the other report registries so the four reports never interfere.
 *
 * The revenue measures (goods/discount/promoPoints/promoRate/total) are banded
 * under "Doanh thu"; the catalog has NO dynamic payment-method columns.
 * Leading DIMENSION columns change meaning with `groupBy`: at item grain
 * `sku`/`itemName`/`unit` are the item's; at group/brand grain `sku`/`unit` are
 * null and `itemName` carries the category/brand label.
 */
export type RevenueByItemDimension =
  | 'sku'
  | 'name'
  | 'itemCategory'
  | 'brand'
  | 'unit'
  | 'locationCode'
  | 'locationName';

/** A summed measure off the aggregated group. */
export type RevenueByItemMeasure =
  | 'quantity'
  | 'goods'
  | 'discount'
  | 'promoPoints'
  | 'total';

/** How a column's value is produced (internal — not exposed in the catalog). */
export type RevenueByItemSource =
  | { kind: 'dimension'; field: RevenueByItemDimension }
  | { kind: 'measure'; field: RevenueByItemMeasure }
  | { kind: 'computed'; computed: 'promoRate' | 'unitPrice' }
  | { kind: 'placeholder'; placeholder: 0 };

export interface RevenueByItemColumnDef {
  key: string;
  type: ReportColumnDataType;
  group: ReportBandId | null;
  source: RevenueByItemSource;
}

/**
 * Curated whitelist, in the reference MISA export's column order (A→N):
 * identity dimensions, location, measures, then the trailing classification
 * dimensions (category/brand). `unitPrice` (Đơn giá TB) is a weighted-average
 * unit price of the aggregated group (goods ÷ quantity), so it stays
 * meaningful after lines are summed; its footer total is null (an average has
 * no meaningful sum). `revenue.promoPoints` allocates the invoice header's
 * redeemed points down to the lines (ADR-04) — an allocation, not a recorded
 * per-line fact. Labels live in
 * REVENUE_BY_ITEM_COLUMN_LABELS_VI / INVOICE_REPORT_COLUMN_LABELS_VI.
 */
export const REVENUE_BY_ITEM_COLUMNS: RevenueByItemColumnDef[] = [
  { key: 'sku', type: ReportColumnDataType.STRING, group: null, source: { kind: 'dimension', field: 'sku' } },
  { key: 'itemName', type: ReportColumnDataType.STRING, group: null, source: { kind: 'dimension', field: 'name' } },
  { key: 'unit', type: ReportColumnDataType.STRING, group: null, source: { kind: 'dimension', field: 'unit' } },
  { key: 'locationCode', type: ReportColumnDataType.STRING, group: null, source: { kind: 'dimension', field: 'locationCode' } },
  { key: 'locationName', type: ReportColumnDataType.STRING, group: null, source: { kind: 'dimension', field: 'locationName' } },
  { key: 'quantity', type: ReportColumnDataType.NUMBER, group: null, source: { kind: 'measure', field: 'quantity' } },
  { key: 'unitPrice', type: ReportColumnDataType.CURRENCY, group: null, source: { kind: 'computed', computed: 'unitPrice' } },
  { key: 'revenue.goods', type: ReportColumnDataType.CURRENCY, group: 'revenue', source: { kind: 'measure', field: 'goods' } },
  { key: 'revenue.discount', type: ReportColumnDataType.CURRENCY, group: 'revenue', source: { kind: 'measure', field: 'discount' } },
  { key: 'revenue.promoPoints', type: ReportColumnDataType.CURRENCY, group: 'revenue', source: { kind: 'measure', field: 'promoPoints' } },
  { key: 'revenue.promoRate', type: ReportColumnDataType.PERCENT, group: 'revenue', source: { kind: 'computed', computed: 'promoRate' } },
  { key: 'revenue.total', type: ReportColumnDataType.CURRENCY, group: 'revenue', source: { kind: 'measure', field: 'total' } },
  { key: 'itemCategory', type: ReportColumnDataType.STRING, group: null, source: { kind: 'dimension', field: 'itemCategory' } },
  { key: 'brand', type: ReportColumnDataType.STRING, group: null, source: { kind: 'dimension', field: 'brand' } },
];

const BY_KEY = new Map(REVENUE_BY_ITEM_COLUMNS.map((c) => [c.key, c]));

export const isKnownRevenueByItemColumn = (key: string): boolean => BY_KEY.has(key);
export const getRevenueByItemColumnDef = (
  key: string,
): RevenueByItemColumnDef | undefined => BY_KEY.get(key);
