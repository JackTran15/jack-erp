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

describe('enrichHeader — `date` is not a globally linked column', () => {
  it('leaves `date` unlinked', () => {
    // daily-sales-summary sets `link` on its own `date` header (see its
    // buildColumns). Adding 'date' to LINK_COLUMNS here would look like the same
    // fix but would also light the column up on invoice-order-listing and
    // invoice-item-revenue-detail, where clicking it means nothing.
    const header = enrichHeader({
      col: 'date',
      name: 'Ngày',
      desc: null,
      type: ReportColumnDataType.DATE,
      group: null,
    });

    expect(header.link).toBeFalsy();
  });
});
