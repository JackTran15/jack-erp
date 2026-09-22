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
        'platform.fee',
        'platform.otherIncome',
        'platform.revenue',
      ]),
    );
  });

  /**
   * AC-28 — "register a new channel, sell through it, the report splits it out,
   * and no migration runs". What makes that true is visible right here in the
   * declaration: the column is backed by a free-form varchar on the invoice and
   * carries no list of accepted channels, so a channel nobody has heard of yet
   * costs one row in `sales_channels` and zero lines of code.
   */
  it('backs salesChannel with the invoice snapshot, with no channel whitelist', () => {
    const def = getListingColumnDef('salesChannel');
    expect(def?.classification).toBe('backed');
    expect(def?.source).toEqual({ kind: 'invoiceField', field: 'salesChannel' });
    // STRING, not ENUM: an ENUM column would imply a fixed catalogue of values
    // and would need a code change per new channel.
    expect(def?.type).toBe(ReportColumnDataType.STRING);
    // Nothing in the registry enumerates channel names.
    expect(JSON.stringify(INVOICE_LISTING_COLUMNS)).not.toMatch(
      /WEB|ZALO|Shopee|TikTok/i,
    );
  });

  /**
   * A-21 is still pending — which GL account the delivery fee posts to is
   * undecided, and the fee is not merchandise revenue. Until that is settled the
   * fee stays a deterministic 0 here rather than being folded into the revenue
   * band, so no report can quietly start counting it as goods sold.
   */
  it('keeps the delivery fee out of merchandise revenue while A-21 is pending', () => {
    expect(getListingColumnDef('revenue.fee')?.source).toEqual({
      kind: 'placeholder',
      placeholder: 0,
    });
    expect(getListingColumnDef('revenue.total')?.source).toEqual({
      kind: 'computed',
      computed: 'total',
    });
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
