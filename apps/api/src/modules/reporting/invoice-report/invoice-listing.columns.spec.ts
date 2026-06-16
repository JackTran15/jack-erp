import { ReportColumnDataType } from '@erp/shared-interfaces';
import {
  INVOICE_LISTING_COLUMNS,
  getListingColumnDef,
  isAcceptedListingColumn,
  isKnownListingColumn,
} from './invoice-listing.columns';

const ACC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('invoice-listing.columns', () => {
  it('declares the full MISA column set with the expected bands', () => {
    const byKey = new Map(INVOICE_LISTING_COLUMNS.map((c) => [c.key, c]));
    // Leading ungrouped columns
    for (const k of ['date', 'time', 'invoiceCode', 'status']) {
      expect(byKey.get(k)?.group).toBeNull();
    }
    expect(byKey.get('revenue.total')?.group).toBe('revenue');
    expect(byKey.get('payment.cash')?.group).toBe('customerPayment');
    expect(byKey.get('platform.fee')?.group).toBe('platform');
  });

  it('classifies unbacked columns as placeholder', () => {
    const placeholders = INVOICE_LISTING_COLUMNS.filter(
      (c) => c.classification === 'placeholder',
    ).map((c) => c.key);
    expect(placeholders).toEqual(
      expect.arrayContaining([
        'revenue.fee',
        'payment.collectOnBehalf',
        'payment.bankAccount',
        'salesChannel',
        'platform.fee',
        'platform.otherIncome',
        'platform.revenue',
      ]),
    );
  });

  it('marks computed columns as derived', () => {
    expect(getListingColumnDef('revenue.total')?.classification).toBe('derived');
    expect(getListingColumnDef('revenue.promoRate')?.classification).toBe('derived');
    expect(getListingColumnDef('payment.debt')?.classification).toBe('derived');
  });

  it('types money columns as currency and rate as percent', () => {
    expect(getListingColumnDef('revenue.total')?.type).toBe(ReportColumnDataType.CURRENCY);
    expect(getListingColumnDef('revenue.promoRate')?.type).toBe(ReportColumnDataType.PERCENT);
    expect(getListingColumnDef('status')?.type).toBe(ReportColumnDataType.ENUM);
  });

  it('accepts fixed keys and well-formed dynamic keys, rejects unknown', () => {
    expect(isKnownListingColumn('revenue.total')).toBe(true);
    expect(isKnownListingColumn('bogus')).toBe(false);
    expect(isAcceptedListingColumn(`payment.method.${ACC}`)).toBe(true);
    expect(isAcceptedListingColumn('bogus')).toBe(false);
    expect(isAcceptedListingColumn('payment.method.not-a-uuid')).toBe(false);
  });
});
