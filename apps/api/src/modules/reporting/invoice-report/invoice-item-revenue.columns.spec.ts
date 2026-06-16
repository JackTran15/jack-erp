import { ReportColumnDataType } from '@erp/shared-interfaces';
import {
  INVOICE_ITEM_REVENUE_COLUMNS,
  getItemRevenueColumnDef,
  isKnownItemRevenueColumn,
} from './invoice-item-revenue.columns';

describe('invoice-item-revenue.columns', () => {
  it('declares the MISA line-item column set in order, starting with date/time/invoice/sku', () => {
    const keys = INVOICE_ITEM_REVENUE_COLUMNS.map((c) => c.key);
    expect(keys.slice(0, 5)).toEqual([
      'date',
      'time',
      'invoiceCode',
      'sku',
      'itemName',
    ]);
    expect(keys).toEqual(expect.arrayContaining(['lineRevenue', 'supplier', 'itemNote']));
  });

  it('classifies unbacked columns as placeholder', () => {
    const placeholders = INVOICE_ITEM_REVENUE_COLUMNS.filter(
      (c) => c.classification === 'placeholder',
    ).map((c) => c.key);
    expect(placeholders).toEqual(
      expect.arrayContaining([
        'revenue.promoPoints',
        'reference',
        'payment.bankAccount',
        'salesChannel',
        'receiver',
        'receiverPhone',
      ]),
    );
  });

  it('marks the gross line amount as derived and everything else backed/placeholder', () => {
    expect(getItemRevenueColumnDef('lineAmount')?.classification).toBe('derived');
    expect(getItemRevenueColumnDef('sku')?.classification).toBe('backed');
    expect(getItemRevenueColumnDef('lineRevenue')?.classification).toBe('backed');
  });

  it('types money columns as currency, quantity as number', () => {
    expect(getItemRevenueColumnDef('unitPrice')?.type).toBe(ReportColumnDataType.CURRENCY);
    expect(getItemRevenueColumnDef('lineRevenue')?.type).toBe(ReportColumnDataType.CURRENCY);
    expect(getItemRevenueColumnDef('quantity')?.type).toBe(ReportColumnDataType.NUMBER);
    expect(getItemRevenueColumnDef('date')?.type).toBe(ReportColumnDataType.DATE);
  });

  it('has no bands (flat) and no dynamic payment columns', () => {
    // The registry carries no group/band metadata on any column.
    expect(INVOICE_ITEM_REVENUE_COLUMNS.every((c) => !('group' in c))).toBe(true);
    expect(isKnownItemRevenueColumn('payment.method.aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe(false);
  });

  it('accepts known keys, rejects unknown', () => {
    expect(isKnownItemRevenueColumn('lineRevenue')).toBe(true);
    expect(isKnownItemRevenueColumn('bogus')).toBe(false);
  });
});
