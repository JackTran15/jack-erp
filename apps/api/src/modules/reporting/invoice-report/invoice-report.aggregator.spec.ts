import { ReportColumnDataType } from '@erp/shared-interfaces';
import {
  aggregateByDay,
  buildRow,
  buildTotals,
  cellValue,
  matchColumnFilter,
} from './invoice-report.aggregator';

const ACC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const invoices = [
  { id: 'i1', day: '2026-06-03', subtotal: 17000000, discountAmount: 0, pointsDiscountAmount: 0, totalPaid: 13600000 },
  { id: 'i2', day: '2026-06-03', subtotal: 3000000, discountAmount: 1000000, pointsDiscountAmount: 0, totalPaid: 2000000 },
  { id: 'i3', day: '2026-06-04', subtotal: 5000000, discountAmount: 0, pointsDiscountAmount: 0, totalPaid: 5000000 },
];
const payments = [
  { invoiceId: 'i1', paymentMethod: 'cash', amount: 13600000, accountId: ACC },
  { invoiceId: 'i3', paymentMethod: 'card', amount: 5000000, accountId: ACC },
];
const promotions = [
  { invoiceId: 'i2', promotionType: 'voucher', discountAmount: 500000 },
];

describe('aggregateByDay', () => {
  const b = aggregateByDay(invoices, payments, promotions);

  it('buckets by day', () => {
    expect([...b.keys()].sort()).toEqual(['2026-06-03', '2026-06-04']);
  });

  it('sums invoice fields per day', () => {
    expect(b.get('2026-06-03')!.sums.subtotal).toBe(20000000);
    expect(b.get('2026-06-03')!.sums.discountAmount).toBe(1000000);
  });

  it('cash + byAccount from payments (card is not cash)', () => {
    expect(b.get('2026-06-03')!.cash).toBe(13600000);
    expect(b.get('2026-06-03')!.byAccount[ACC]).toBe(13600000);
    expect(b.get('2026-06-04')!.byAccount[ACC]).toBe(5000000);
    expect(b.get('2026-06-04')!.cash).toBe(0);
  });

  it('voucher from promotions', () => {
    expect(b.get('2026-06-03')!.voucher).toBe(500000);
  });
});

describe('cellValue', () => {
  const day = aggregateByDay(invoices, payments, promotions).get('2026-06-03')!;

  it('computed total = goods - discount - promoPoints', () => {
    expect(cellValue('revenue.total', day)).toBe(19000000);
  });
  it('actual = totalPaid', () => {
    expect(cellValue('actualRevenue', day)).toBe(15600000);
  });
  it('promoRate = discount / goods * 100', () => {
    expect(cellValue('revenue.promoRate', day)).toBe(5);
  });
  it('dynamic column reads byAccount', () => {
    expect(cellValue(`payment.method.${ACC}`, day)).toBe(13600000);
  });
  it('date returns the bucket day', () => {
    expect(cellValue('date', day)).toBe('2026-06-03');
  });
});

describe('buildRow / buildTotals', () => {
  const b = aggregateByDay(invoices, payments, promotions);

  it('buildRow emits self-describing cells', () => {
    const row = buildRow(['date', 'revenue.goods'], b.get('2026-06-04')!);
    expect(row).toEqual([
      { col: 'date', type: ReportColumnDataType.DATE, value: '2026-06-04' },
      { col: 'revenue.goods', type: ReportColumnDataType.CURRENCY, value: 5000000 },
    ]);
  });

  it('buildTotals: date is null, numeric cols summed across days', () => {
    const totals = buildTotals(['date', 'revenue.goods'], [...b.values()]);
    expect(totals[0]).toEqual({ col: 'date', type: ReportColumnDataType.DATE, value: null });
    expect(totals[1].value).toBe(25000000);
  });
});

describe('matchColumnFilter', () => {
  it('numeric operators', () => {
    expect(matchColumnFilter(100, { col: 'x', lte: 100 })).toBe(true);
    expect(matchColumnFilter(101, { col: 'x', lte: 100 })).toBe(false);
    expect(matchColumnFilter(50, { col: 'x', gte: 10, lte: 100 })).toBe(true);
    expect(matchColumnFilter(5, { col: 'x', eq: 5 })).toBe(true);
    expect(matchColumnFilter(6, { col: 'x', eq: 5 })).toBe(false);
  });
  it('date range', () => {
    expect(matchColumnFilter('2026-06-03', { col: 'date', from: '2026-06-01', to: '2026-06-30' })).toBe(true);
    expect(matchColumnFilter('2026-07-03', { col: 'date', to: '2026-06-30' })).toBe(false);
  });
});
