import {
  INVOICE_STATUS_OPTIONS,
  ReportColumnDataType,
} from '@erp/shared-interfaces';
import { enrichHeader, filterKindFor } from './report-column.util';

const base = (col: string, type: ReportColumnDataType) => ({
  col,
  name: col,
  desc: null,
  type,
  group: null,
});

describe('filterKindFor', () => {
  it('status → select', () => {
    expect(filterKindFor(ReportColumnDataType.ENUM, 'status')).toBe('select');
  });
  it('time/hour columns → time', () => {
    expect(filterKindFor(ReportColumnDataType.STRING, 'time')).toBe('time');
    expect(filterKindFor(ReportColumnDataType.STRING, 'hour')).toBe('time');
  });
  it('date/datetime → date', () => {
    expect(filterKindFor(ReportColumnDataType.DATE, 'date')).toBe('date');
    expect(filterKindFor(ReportColumnDataType.DATETIME, 'x')).toBe('date');
  });
  it('number/currency/percent → number', () => {
    expect(filterKindFor(ReportColumnDataType.NUMBER, 'x')).toBe('number');
    expect(filterKindFor(ReportColumnDataType.CURRENCY, 'x')).toBe('number');
    expect(filterKindFor(ReportColumnDataType.PERCENT, 'x')).toBe('number');
  });
  it('string → text', () => {
    expect(filterKindFor(ReportColumnDataType.STRING, 'note')).toBe('text');
  });
});

describe('enrichHeader', () => {
  it('right-aligns number columns', () => {
    const h = enrichHeader(base('revenue.total', ReportColumnDataType.CURRENCY));
    expect(h.filterKind).toBe('number');
    expect(h.align).toBe('right');
  });

  it('left-aligns text columns', () => {
    const h = enrichHeader(base('customer', ReportColumnDataType.STRING));
    expect(h.align).toBe('left');
    expect(h.filterKind).toBe('text');
    expect(h.filterOptions).toBeUndefined();
  });

  it('status column carries select filterOptions = real invoice statuses', () => {
    const h = enrichHeader(base('status', ReportColumnDataType.ENUM));
    expect(h.filterKind).toBe('select');
    expect(h.filterOptions).toEqual(INVOICE_STATUS_OPTIONS);
  });

  it('invoiceCode is a pinned link', () => {
    const h = enrichHeader(base('invoiceCode', ReportColumnDataType.STRING));
    expect(h.link).toBe(true);
    expect(h.pinned).toBe('left');
  });

  it('date column is pinned left with date filter', () => {
    const h = enrichHeader(base('date', ReportColumnDataType.DATE));
    expect(h.filterKind).toBe('date');
    expect(h.pinned).toBe('left');
  });
});
