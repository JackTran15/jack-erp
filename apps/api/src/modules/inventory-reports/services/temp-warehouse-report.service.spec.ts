import { TempWarehouseReportService } from './temp-warehouse-report.service';

function serviceWith(queryImpl: jest.Mock) {
  return new TempWarehouseReportService({ query: queryImpl } as never);
}

/** So SQL theo cấu trúc, không theo cách xuống dòng của template literal. */
function flatten(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
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

  // AC-01 + AC-03 — khoá TOÀN BỘ khối CASE trong một assert: nhãn, điều kiện,
  // nhánh rỗng và thứ tự. Khoá từng mảnh rời sẽ để lọt đúng những lỗi nguy hiểm
  // nhất, ví dụ đảo hai điều kiện transfer cho nhau mà thứ tự nhãn vẫn y nguyên.
  it('emits the status CASE with the right labels, conditions and order', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([AGGREGATE_ROW])
      .mockResolvedValueOnce([]);
    const service = serviceWith(query);

    await service.list(BASE_QUERY);

    expect(flatten(query.mock.calls[0][0] as string)).toContain(
      flatten(`
        CASE
          WHEN p.invoice_id IS NOT NULL THEN 'Bán hàng kho tạm'
          WHEN p.exp_transfer_id IS NOT NULL THEN 'Chuyển kho xuất đi'
          WHEN p.ret_transfer_id IS NOT NULL THEN 'Chuyển kho trả lại'
          WHEN p.return_qty = p.out_qty THEN ''
          WHEN p.return_qty = 1 THEN 'Trả hàng trưng bày'
          ELSE 'Xuất không bán'
        END AS status
      `),
    );
  });

  it('maps a raw row onto the report row shape', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ ...AGGREGATE_ROW, total: '1' }])
      .mockResolvedValueOnce([
        {
          sku: 'TNV94-D-41',
          name: 'Giày nam TNV94-D-41',
          unit: 'Đôi',
          location: 'T10A.02',
          date: '15/08/2026',
          time: '09:11:00',
          staff: 'Admin User',
          out_qty: '1',
          return_qty: '0',
          sale_qty: '1',
          remaining_qty: '0',
          status: 'Bán hàng kho tạm',
          invoice: 'INV-202608-00165',
        },
      ]);
    const service = serviceWith(query);

    const result = await service.list(BASE_QUERY);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual({
      sku: 'TNV94-D-41',
      name: 'Giày nam TNV94-D-41',
      unit: 'Đôi',
      location: 'T10A.02',
      date: '15/08/2026',
      time: '09:11:00',
      staff: 'Admin User',
      outQty: 1,
      returnQty: 0,
      saleQty: 1,
      remainingQty: 0,
      status: 'Bán hàng kho tạm',
      invoice: 'INV-202608-00165',
    });
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
