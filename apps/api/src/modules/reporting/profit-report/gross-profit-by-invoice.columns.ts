import { ReportColumnDataType } from '@erp/shared-interfaces';

/**
 * Column registry for `gross-profit-by-invoice` — ONE ROW PER DAY in the
 * selected period (despite the report's name — see reports/gross-profit-by-invoice.report.ts).
 */
export interface GrossProfitByInvoiceColumnDef {
  key: string;
  type: ReportColumnDataType;
}

export const GROSS_PROFIT_BY_INVOICE_COLUMNS: GrossProfitByInvoiceColumnDef[] = [
  { key: 'date', type: ReportColumnDataType.DATE },
  { key: 'grossGoods', type: ReportColumnDataType.CURRENCY },
  { key: 'discount', type: ReportColumnDataType.CURRENCY },
  { key: 'revenue', type: ReportColumnDataType.CURRENCY },
  { key: 'costOfGoods', type: ReportColumnDataType.CURRENCY },
  { key: 'grossProfit', type: ReportColumnDataType.CURRENCY },
];

const BY_KEY = new Map(GROSS_PROFIT_BY_INVOICE_COLUMNS.map((c) => [c.key, c]));

export const getGrossProfitByInvoiceColumnDef = (
  key: string,
): GrossProfitByInvoiceColumnDef | undefined => BY_KEY.get(key);

export const isKnownGrossProfitByInvoiceColumn = (key: string): boolean =>
  BY_KEY.has(key);
