import { ReportColumnDataType } from '@erp/shared-interfaces';

/**
 * Column registry for `profit-by-item` — ONE ROW PER ITEM (or parent product /
 * category, per the request `statBy`). The catalog DIFFERS by grain: item and
 * parent grain share the same (item-shaped) column set; group grain has its
 * own, distinct set (no SKU/unit/quantity/profitPerUnit — a category has none
 * of those). See TKT-PRF-02.
 */
export interface ProfitColumnDef {
  key: string;
  type: ReportColumnDataType;
}

/** item | parent grain — one row per SKU or per parent product. */
export const PROFIT_BY_ITEM_COLUMNS: ProfitColumnDef[] = [
  { key: 'skuCode', type: ReportColumnDataType.STRING },
  { key: 'itemName', type: ReportColumnDataType.STRING },
  { key: 'unit', type: ReportColumnDataType.STRING },
  { key: 'location', type: ReportColumnDataType.STRING },
  { key: 'quantity', type: ReportColumnDataType.NUMBER },
  { key: 'revenue', type: ReportColumnDataType.CURRENCY },
  { key: 'costOfGoods', type: ReportColumnDataType.CURRENCY },
  { key: 'grossProfit', type: ReportColumnDataType.CURRENCY },
  { key: 'profitPerUnit', type: ReportColumnDataType.CURRENCY },
  { key: 'marginOnRevenue', type: ReportColumnDataType.PERCENT },
  { key: 'marginOnCost', type: ReportColumnDataType.PERCENT },
  { key: 'categoryName', type: ReportColumnDataType.STRING },
];

/** group grain — one row per item category. */
export const PROFIT_BY_GROUP_COLUMNS: ProfitColumnDef[] = [
  { key: 'categoryCode', type: ReportColumnDataType.STRING },
  { key: 'categoryName', type: ReportColumnDataType.STRING },
  { key: 'revenue', type: ReportColumnDataType.CURRENCY },
  { key: 'costOfGoods', type: ReportColumnDataType.CURRENCY },
  { key: 'grossProfit', type: ReportColumnDataType.CURRENCY },
  { key: 'marginOnRevenue', type: ReportColumnDataType.PERCENT },
  { key: 'marginOnCost', type: ReportColumnDataType.PERCENT },
];

const BY_KEY = new Map(
  [...PROFIT_BY_ITEM_COLUMNS, ...PROFIT_BY_GROUP_COLUMNS].map((c) => [c.key, c]),
);

export const getProfitByItemColumnDef = (key: string): ProfitColumnDef | undefined =>
  BY_KEY.get(key);

export const isKnownProfitByItemColumn = (key: string): boolean => BY_KEY.has(key);
