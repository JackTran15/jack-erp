import { ReportColumnDataType } from '@erp/shared-interfaces';
import {
  InvoiceRowInput,
  buildInvoiceRow,
  buildListingTotals,
  listingCellValue,
} from './invoice-listing.aggregator';

const ACC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const row = (over: Partial<InvoiceRowInput> = {}): InvoiceRowInput => ({
  id: 'i1',
  issuedAt: new Date('2026-06-03T08:30:00Z'),
  code: 'HD000001',
  status: 'paid',
  subtotal: 20000000,
  discountAmount: 2000000,
  pointsDiscountAmount: 0,
  totalPaid: 18000000,
  amountDue: 18000000,
  note: 'ghi chú',
  customerName: 'Nguyễn Văn A',
  customerPhone: '0900000000',
  cashier: 'NV000002',
  salesperson: 'NV000003',
  storeCode: 'Chi nhánh 1',
  cash: 18000000,
  bankTransfer: 0,
  voucher: 0,
  byAccount: { [ACC]: 18000000 },
  ...over,
});

describe('listingCellValue', () => {
  it('reads backed invoice fields, splitting date and time', () => {
    const r = row();
    expect(listingCellValue('date', r)).toBe('2026-06-03');
    expect(listingCellValue('time', r)).toBe('08:30');
    expect(listingCellValue('invoiceCode', r)).toBe('HD000001');
    expect(listingCellValue('status', r)).toBe('paid');
    expect(listingCellValue('revenue.goods', r)).toBe(20000000);
    expect(listingCellValue('note', r)).toBe('ghi chú');
  });

  it('returns deterministic placeholders for unbacked columns', () => {
    const r = row();
    expect(listingCellValue('revenue.fee', r)).toBe(0);
    expect(listingCellValue('platform.fee', r)).toBe(0);
    expect(listingCellValue('platform.revenue', r)).toBe(0);
    expect(listingCellValue('payment.collectOnBehalf', r)).toBe(0);
    expect(listingCellValue('payment.bankAccount', r)).toBeNull();
    expect(listingCellValue('salesChannel', r)).toBeNull();
  });

  it('pivots payments per method and per account', () => {
    const r = row({ cash: 10000000, bankTransfer: 8000000, voucher: 500000 });
    expect(listingCellValue('payment.cash', r)).toBe(10000000);
    expect(listingCellValue('payment.bankTransfer', r)).toBe(8000000);
    expect(listingCellValue('payment.voucher', r)).toBe(500000);
    expect(listingCellValue(`payment.method.${ACC}`, r)).toBe(18000000);
    expect(listingCellValue('payment.method.bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', r)).toBe(0);
  });

  it('computes total, promoRate and debt', () => {
    expect(listingCellValue('revenue.total', row())).toBe(18000000); // 20m - 2m - 0
    expect(listingCellValue('revenue.promoRate', row())).toBe(10); // 2m / 20m * 100
    expect(listingCellValue('revenue.promoRate', row({ subtotal: 0 }))).toBe(0);
    // debt only for debt-like statuses
    expect(listingCellValue('payment.debt', row())).toBe(0);
    expect(
      listingCellValue('payment.debt', row({ status: 'partial_debt', amountDue: 18000000, totalPaid: 5000000 })),
    ).toBe(13000000);
  });

  it('inlines resolved relations', () => {
    const r = row();
    expect(listingCellValue('customer', r)).toBe('Nguyễn Văn A');
    expect(listingCellValue('customerPhone', r)).toBe('0900000000');
    expect(listingCellValue('cashier', r)).toBe('NV000002');
    expect(listingCellValue('salesperson', r)).toBe('NV000003');
    expect(listingCellValue('storeCode', r)).toBe('Chi nhánh 1');
  });
});

describe('buildInvoiceRow', () => {
  it('returns self-describing cells in the requested column order', () => {
    const cells = buildInvoiceRow(['date', 'invoiceCode', 'revenue.total'], row());
    expect(cells).toEqual([
      { col: 'date', type: ReportColumnDataType.DATE, value: '2026-06-03' },
      { col: 'invoiceCode', type: ReportColumnDataType.STRING, value: 'HD000001' },
      { col: 'revenue.total', type: ReportColumnDataType.CURRENCY, value: 18000000 },
    ]);
  });
});

describe('buildListingTotals', () => {
  it('sums money columns and nulls out non-money columns', () => {
    const rows = [row(), row({ id: 'i2', subtotal: 5000000, discountAmount: 0 })];
    const totals = buildListingTotals(['date', 'invoiceCode', 'revenue.goods', 'revenue.promoRate'], rows);
    expect(totals[0]).toMatchObject({ col: 'date', value: null });
    expect(totals[1]).toMatchObject({ col: 'invoiceCode', value: null });
    expect(totals[2]).toMatchObject({ col: 'revenue.goods', value: 25000000 });
    // percent is not summed
    expect(totals[3]).toMatchObject({ col: 'revenue.promoRate', value: null });
  });
});
