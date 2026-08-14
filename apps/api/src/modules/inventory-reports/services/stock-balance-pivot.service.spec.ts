import { StockBalancePivotService } from './stock-balance-pivot.service';

const BRANCH_TOTALS_ROWS = [
  { branch_id: 'branch-A', qty: '30' },
  { branch_id: 'branch-B', qty: '12' },
];

describe('StockBalancePivotService — tổng theo chi nhánh', () => {
  function makeService(pageRows: unknown[], countTotal: number, cellRows: unknown[]) {
    const query = jest
      .fn()
      // 1) trang, 2) count, 3) tổng theo chi nhánh, 4) ô của trang
      .mockResolvedValueOnce(pageRows)
      .mockResolvedValueOnce([{ total: countTotal }])
      .mockResolvedValueOnce(BRANCH_TOTALS_ROWS)
      .mockResolvedValueOnce(cellRows);
    return {
      service: new StockBalancePivotService({ query } as never),
      query,
    };
  }

  it('trả tổng riêng cho từng chi nhánh và một tổng chung', async () => {
    const { service } = makeService(
      [{ item_id: 'item-1', sku: 'SKU-1' }],
      1,
      [
        {
          agg_key: 'item-1',
          sku: 'SKU-1',
          item_name: 'Hàng 1',
          unit: 'Cái',
          branch_id: 'branch-A',
          branch_name: 'A',
          qty: '30',
          value: '0',
        },
      ],
    );

    const result = await service.aggregate({
      organizationId: 'org-1',
      page: 1,
      pageSize: 20,
    });

    expect(result.totals['perBranch.branch-A']).toBe(30);
    expect(result.totals['perBranch.branch-B']).toBe(12);
    // Cột "Tổng" phải bằng đúng tổng các cột chi nhánh.
    expect(result.totals.total).toBe(42);
  });

  it('tổng không đổi khi chỉ có một mã hàng trên trang — nó tả toàn tập', async () => {
    const { service } = makeService([{ item_id: 'item-1', sku: 'SKU-1' }], 500, [
      {
        agg_key: 'item-1',
        sku: 'SKU-1',
        item_name: 'Hàng 1',
        unit: 'Cái',
        branch_id: 'branch-A',
        branch_name: 'A',
        qty: '1',
        value: '0',
      },
    ]);

    const result = await service.aggregate({
      organizationId: 'org-1',
      page: 1,
      pageSize: 1,
    });

    // Ô của trang chỉ có 1, nhưng footer phải nói về cả 500 mã hàng.
    expect(result.total).toBe(500);
    expect(result.totals.total).toBe(42);
  });

  it('vẫn trả tổng khi trang rỗng, thay vì bỏ trống footer', async () => {
    const { service } = makeService([], 0, []);

    const result = await service.aggregate({
      organizationId: 'org-1',
      page: 9,
      pageSize: 20,
    });

    expect(result.data).toEqual([]);
    expect(result.totals.total).toBe(42);
  });
});
