import { TempWarehouseReportService } from './temp-warehouse-report.service';

function serviceWith(queryImpl: jest.Mock) {
  return new TempWarehouseReportService({ query: queryImpl } as never);
}

const AGGREGATE_ROW = {
  total: '2',
  out_qty: '2',
  return_qty: '0',
  sale_qty: '1',
  remaining_qty: '1',
};

const BASE_QUERY = {
  organizationId: 'org-1',
  startDate: new Date('2026-08-01T00:00:00.000Z'),
  endDate: new Date('2026-09-01T00:00:00.000Z'),
  page: 1,
  pageSize: 20,
};

describe('TempWarehouseReportService', () => {
  it('returns whole-set totals alongside the page', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([AGGREGATE_ROW])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);

    const result = await service.list(BASE_QUERY);

    expect(result.total).toBe(2);
    expect(result.totals).toEqual({
      outQty: 2,
      returnQty: 0,
      saleQty: 1,
      remainingQty: 1,
    });
  });

  it('counts and totals in one statement over the same stage the grid reads', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([AGGREGATE_ROW])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);

    await service.list(BASE_QUERY);

    const [aggregateSql] = query.mock.calls[0] as [string, unknown[]];
    expect(aggregateSql).toContain('FROM enriched');
    expect(aggregateSql).toContain('COUNT(*)');
    expect(aggregateSql).toContain('SUM(out_qty)');
  });

  it('applies a column filter to the rows query and the totals query alike', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ ...AGGREGATE_ROW, total: '1' }])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);

    await service.list({
      ...BASE_QUERY,
      columnFilters: { saleQty: { operator: '>=', value: 1 } },
    });

    const [aggregateSql, aggregateParams] = query.mock.calls[0] as [
      string,
      unknown[],
    ];
    const [rowsSql, rowsParams] = query.mock.calls[1] as [string, unknown[]];

    // Same predicate on both sides — this is what stops the footer from
    // describing a different set than the rows above it.
    expect(aggregateSql).toContain('(sale_qty) >= $7');
    expect(rowsSql).toContain('(sale_qty) >= $7');
    expect(aggregateParams).toContain(1);
    // The rows query appends LIMIT/OFFSET after the filter's parameters.
    expect(rowsParams.slice(0, aggregateParams.length)).toEqual(aggregateParams);
  });

  it('skips the rows query when nothing matches, but still reports zero totals', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      { total: '0', out_qty: '0', return_qty: '0', sale_qty: '0', remaining_qty: '0' },
    ]);
    const service = serviceWith(query);

    const result = await service.list(BASE_QUERY);

    expect(query).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual([]);
    expect(result.totals).toEqual({
      outQty: 0,
      returnQty: 0,
      saleQty: 0,
      remainingQty: 0,
    });
  });
});
