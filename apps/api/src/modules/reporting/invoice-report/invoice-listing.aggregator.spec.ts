import { ColumnFilter } from '@erp/shared-interfaces';
import {
  InvoiceRowInput,
  buildInvoiceRow,
  buildListingTotals,
  listingCellValue,
} from './invoice-listing.aggregator';
import { matchColumnFilter } from './invoice-report.aggregator';

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
    // Read in business time: 08:30 UTC is 15:30 that afternoon in the shop.
    expect(listingCellValue('date', r)).toBe('2026-06-03');
    expect(listingCellValue('time', r)).toBe('15:30');
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

/**
 * AC-18 — the invoice report splits revenue by the channel the sale came
 * through. AC-28 — a channel registered after the fact needs no migration.
 *
 * Everything below runs on `invoices.sales_channel`, the label SNAPSHOTTED onto
 * the invoice at sale time. `sales_channels` is nowhere in this file on purpose:
 * it is the declaration, the varchar is the record (ADR-03).
 */
describe('salesChannel', () => {
  const WEB = 'Website công ty';

  it('splits invoices into one group per channel, counter sales included', () => {
    const rows = [
      row({ id: 'i1', salesChannel: WEB, subtotal: 1000000 }),
      row({ id: 'i2', salesChannel: 'ZALO', subtotal: 500000 }),
      // No channel at all — a sale rung up at the counter.
      row({ id: 'i3', salesChannel: null, subtotal: 300000 }),
    ];

    const byChannel = new Map<string, number>();
    for (const r of rows) {
      const key = String(listingCellValue('salesChannel', r));
      byChannel.set(key, (byChannel.get(key) ?? 0) + Number(listingCellValue('revenue.goods', r)));
    }

    expect([...byChannel.entries()]).toEqual([
      [WEB, 1000000],
      ['ZALO', 500000],
      ['Tại cửa hàng', 300000],
    ]);
  });

  it('reads a NULL channel as a counter sale, never as blank', () => {
    expect(listingCellValue('salesChannel', row({ salesChannel: null }))).toBe('Tại cửa hàng');
    // A row assembled without the field behaves identically to an explicit NULL.
    expect(listingCellValue('salesChannel', row({ salesChannel: undefined }))).toBe('Tại cửa hàng');
  });

  /**
   * AC-28 in one line: the resolver has never been told what channels exist, so
   * a channel registered five minutes ago reports exactly like one that shipped
   * with the product. No migration, no enum, no code change.
   */
  it('reports a channel it has never seen before, verbatim', () => {
    const r = row({ salesChannel: 'Sàn nội địa mới đăng ký' });
    expect(listingCellValue('salesChannel', r)).toBe('Sàn nội địa mới đăng ký');
  });

  /**
   * The case that proves the snapshot design is respected. This invoice's label
   * matches NO row in `sales_channels` — the channel was renamed, or deleted
   * outright, after the sale. It must still report under the label it was sold
   * with. A report that joined the registry instead would blank this row out or
   * drop it, and last quarter's numbers would silently move.
   */
  it('still reports an invoice whose channel was later renamed or deleted', () => {
    const renamed = row({ id: 'old', salesChannel: 'Kênh Web (tên cũ)' });
    const deleted = row({ id: 'gone', salesChannel: 'Sàn đã gỡ' });

    expect(listingCellValue('salesChannel', renamed)).toBe('Kênh Web (tên cũ)');
    expect(listingCellValue('salesChannel', deleted)).toBe('Sàn đã gỡ');

    // And they stay separate groups — not merged, not lumped into counter sales.
    const out = [renamed, deleted].map((r) => buildInvoiceRow(['salesChannel'], r));
    expect(out).toEqual([
      { salesChannel: 'Kênh Web (tên cũ)' },
      { salesChannel: 'Sàn đã gỡ' },
    ]);
  });

  it('filters on the very string the cell shows', () => {
    const rows = [
      row({ id: 'i1', salesChannel: WEB }),
      row({ id: 'i2', salesChannel: 'ZALO' }),
      row({ id: 'i3', salesChannel: null }),
    ];
    const keep = (f: ColumnFilter): string[] =>
      rows
        .filter((r) => matchColumnFilter(listingCellValue('salesChannel', r), f))
        .map((r) => r.id);

    expect(keep({ col: 'salesChannel', equals: 'ZALO' })).toEqual(['i2']);
    // Counter sales are filterable too — the displayed label IS the filter value,
    // which is only true because the substitution happens in listingCellValue.
    expect(keep({ col: 'salesChannel', equals: 'Tại cửa hàng' })).toEqual(['i3']);
    expect(keep({ col: 'salesChannel', contains: 'website' })).toEqual(['i1']);

    for (const r of rows) {
      expect(buildInvoiceRow(['salesChannel'], r)['salesChannel']).toBe(
        listingCellValue('salesChannel', r),
      );
    }
  });

  it('is not summed into the footer', () => {
    const totals = buildListingTotals(
      ['salesChannel'],
      [row({ salesChannel: WEB }), row({ salesChannel: 'ZALO' })],
    );
    expect(totals['salesChannel']).toBeNull();
  });
});

describe('buildInvoiceRow', () => {
  it('returns a row keyed by column field in the requested order', () => {
    const out = buildInvoiceRow(['date', 'invoiceCode', 'revenue.total'], row());
    expect(Object.keys(out)).toEqual(['date', 'invoiceCode', 'revenue.total']);
    expect(out).toEqual({
      date: '2026-06-03',
      invoiceCode: 'HD000001',
      'revenue.total': 18000000,
    });
  });
});

describe('buildListingTotals', () => {
  it('sums money columns and nulls out non-money columns', () => {
    const rows = [row(), row({ id: 'i2', subtotal: 5000000, discountAmount: 0 })];
    const totals = buildListingTotals(['date', 'invoiceCode', 'revenue.goods', 'revenue.promoRate'], rows);
    expect(totals['date']).toBeNull();
    expect(totals['invoiceCode']).toBeNull();
    expect(totals['revenue.goods']).toBe(25000000);
    // percent is not summed
    expect(totals['revenue.promoRate']).toBeNull();
  });
});
