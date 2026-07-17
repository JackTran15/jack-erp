import {
  aggregateGrossProfitByDay,
  buildTotals,
  cellValue,
  InvoiceDayInput,
  LineCostInput,
} from './gross-profit-by-invoice.aggregator';

const invoice = (over: Partial<InvoiceDayInput> = {}): InvoiceDayInput => ({
  id: 'inv1',
  day: '2026-07-01',
  grossGoods: 1000,
  discount: 100,
  ...over,
});

describe('aggregateGrossProfitByDay', () => {
  it('sums grossGoods/discount by day and derives revenue = grossGoods - discount', () => {
    const buckets = aggregateGrossProfitByDay(
      [invoice({ id: 'a', grossGoods: 1000, discount: 100 }), invoice({ id: 'b', grossGoods: 500, discount: 0 })],
      [],
    );
    const day = buckets.get('2026-07-01')!;
    expect(day.grossGoods).toBe(1500);
    expect(day.discount).toBe(100);
    expect(cellValue('revenue', day)).toBe(1400);
  });

  it('attributes line costs to the invoice header day via invoiceId', () => {
    const buckets = aggregateGrossProfitByDay(
      [invoice({ id: 'a', day: '2026-07-01' }), invoice({ id: 'b', day: '2026-07-02', grossGoods: 2000, discount: 0 })],
      [
        { invoiceId: 'a', costOfGoods: 300 } as LineCostInput,
        { invoiceId: 'b', costOfGoods: 700 } as LineCostInput,
      ],
    );
    expect(buckets.get('2026-07-01')!.costOfGoods).toBe(300);
    expect(buckets.get('2026-07-02')!.costOfGoods).toBe(700);
  });

  it('produces a negative costOfGoods for a day with only a RETURN invoice (no sale)', () => {
    const buckets = aggregateGrossProfitByDay(
      [invoice({ id: 'r', day: '2026-07-12', grossGoods: 0, discount: 0 })],
      [{ invoiceId: 'r', costOfGoods: -528000 }],
    );
    const day = buckets.get('2026-07-12')!;
    expect(day.costOfGoods).toBe(-528000);
    expect(cellValue('grossProfit', day)).toBe(528000);
  });
});

describe('buildTotals', () => {
  it('sums every column across all days (cross-checked against the reference mock totals)', () => {
    const buckets = aggregateGrossProfitByDay(
      [
        invoice({ id: 'a', day: '2026-07-01', grossGoods: 850000, discount: 0 }),
        invoice({ id: 'b', day: '2026-07-03', grossGoods: 14400000, discount: 4680000 }),
      ],
      [
        { invoiceId: 'a', costOfGoods: 391000 },
        { invoiceId: 'b', costOfGoods: 1056000 },
      ],
    );
    const days = [...buckets.values()];
    const totals = buildTotals(['grossGoods', 'discount', 'revenue', 'costOfGoods', 'grossProfit'], days);
    expect(totals.grossGoods).toBe(15250000);
    expect(totals.discount).toBe(4680000);
    expect(totals.revenue).toBe(10570000);
    expect(totals.costOfGoods).toBe(1447000);
    expect(totals.grossProfit).toBe(9123000);
  });
});
