import { ReportColumnDataType } from '@erp/shared-interfaces';
import { debtColumn } from '../debt-report/debt-report-column.util';
import { enrichHeader as enrichInvoiceHeader } from '../invoice-report/report-column.util';
import { enrichHeader as enrichProfitHeader } from '../profit-report/report-column.util';
import { REPORT_COLUMN_WIDTHS, reportColumnWidth } from './report-column-widths';

const base = (col: string, type: ReportColumnDataType) => ({
  col,
  name: col,
  desc: null,
  type,
  group: null,
});

describe('REPORT_COLUMN_WIDTHS', () => {
  it('sizes the shared identity columns on the inventory scale', () => {
    expect(reportColumnWidth('sku')).toBe(140);
    expect(reportColumnWidth('skuCode')).toBe(140);
    expect(reportColumnWidth('itemName')).toBe(220);
    expect(reportColumnWidth('unit')).toBe(110);
    expect(reportColumnWidth('date')).toBe(120);
    expect(reportColumnWidth('documentNumber')).toBe(130);
  });

  it('sizes the location columns of the revenue/profit reports at 220', () => {
    expect(reportColumnWidth('location')).toBe(220);
    expect(reportColumnWidth('locationCode')).toBe(220);
    expect(reportColumnWidth('locationName')).toBe(220);
  });

  it('leaves amount and quantity columns to the FE default', () => {
    for (const col of ['quantity', 'unitPrice', 'lineRevenue', 'revenue', 'debtClosing', 'grossProfit']) {
      expect(reportColumnWidth(col)).toBeUndefined();
    }
  });

  it('every hint is a positive whole number of pixels', () => {
    for (const [col, width] of Object.entries(REPORT_COLUMN_WIDTHS)) {
      expect({ col, ok: Number.isInteger(width) && width > 0 }).toEqual({ col, ok: true });
    }
  });
});

describe('column utils forward the shared width', () => {
  it('invoice enrichHeader', () => {
    expect(enrichInvoiceHeader(base('sku', ReportColumnDataType.STRING)).width).toBe(140);
    expect(enrichInvoiceHeader(base('itemName', ReportColumnDataType.STRING)).width).toBe(220);
    expect(enrichInvoiceHeader(base('lineRevenue', ReportColumnDataType.CURRENCY)).width).toBeUndefined();
    expect(enrichInvoiceHeader(base('locationCode', ReportColumnDataType.STRING)).width).toBe(220);
    expect(enrichInvoiceHeader(base('locationName', ReportColumnDataType.STRING)).width).toBe(220);
  });

  it('profit enrichHeader', () => {
    expect(enrichProfitHeader(base('skuCode', ReportColumnDataType.STRING)).width).toBe(140);
    expect(enrichProfitHeader(base('khoanMuc', ReportColumnDataType.STRING)).width).toBe(220);
    expect(enrichProfitHeader(base('grossProfit', ReportColumnDataType.CURRENCY)).width).toBeUndefined();
    expect(enrichProfitHeader(base('location', ReportColumnDataType.STRING)).width).toBe(220);
  });

  it('debtColumn', () => {
    expect(debtColumn('customerName', ReportColumnDataType.STRING).width).toBe(200);
    expect(debtColumn('documentNumber', ReportColumnDataType.STRING).width).toBe(130);
    expect(debtColumn('debtClosing', ReportColumnDataType.CURRENCY)).not.toHaveProperty('width');
  });

  it('the same column key is the same width in every group', () => {
    const invoice = enrichInvoiceHeader(base('itemName', ReportColumnDataType.STRING)).width;
    const profit = enrichProfitHeader(base('itemName', ReportColumnDataType.STRING)).width;
    const debt = debtColumn('itemName', ReportColumnDataType.STRING).width;
    expect(new Set([invoice, profit, debt]).size).toBe(1);
  });
});
