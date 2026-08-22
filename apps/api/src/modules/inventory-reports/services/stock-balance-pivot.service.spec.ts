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

/**
 * Column filters, which this engine never compiled into SQL before — it only
 * hashed them into the cache key, so the grid showed unfiltered rows.
 *
 * The pivot picks the page's items first and fans the per-branch cells out
 * afterwards, so every predicate has to land in the first step. These tests read
 * the SQL to prove it does, and that the count and footer queries get the same.
 */
describe('StockBalancePivotService column filters', () => {
  function capture() {
    const sql: Array<{ text: string; params: unknown[] }> = [];
    const dataSource = {
      query: jest.fn().mockImplementation((text: string, params: unknown[]) => {
        sql.push({ text, params });
        return Promise.resolve(text.includes('COUNT(') ? [{ total: 0 }] : []);
      }),
    };
    return { sql, service: new StockBalancePivotService(dataSource as never) };
  }

  const baseQuery = { organizationId: 'org-1', page: 1, pageSize: 20 };
  const BRANCH = '11111111-2222-4333-8444-555555555555';

  const pageSql = (sql: { text: string }[]) =>
    sql.find((q) => q.text.includes('LIMIT'))!.text;
  const countSql = (sql: { text: string }[]) =>
    sql.find((q) => q.text.includes('COUNT('))!.text;
  const footerSql = (sql: { text: string }[]) =>
    sql.find((q) => q.text.includes('GROUP BY sb.branch_id'))!.text;

  it.each([
    ['name', 'i.name'],
    ['group', 'ic.name'],
    ['parentSku', 'pr.code'],
    ['brand', 'i.brand'],
  ])('applies the %s predicate to page, count and footer', async (key, column) => {
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      columnFilters: { [key]: { operator: '*', value: 'x' } },
    });

    expect(pageSql(sql)).toContain(column);
    expect(countSql(sql)).toContain(column);
    expect(footerSql(sql)).toContain(column);
  });

  it('joins the relations those predicates name, everywhere they are used', async () => {
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      columnFilters: { group: { operator: '*', value: 'Giày' } },
    });

    for (const q of sql) {
      expect(q.text).toContain('LEFT JOIN inventory_item_categories ic');
      expect(q.text).toContain('LEFT JOIN products pr');
    }
  });

  it('rebuilds the total column as a sum at the item-choosing step', async () => {
    // "Tổng" only exists after the cells are folded in JS, so filtering it means
    // recreating the sum before the page is cut — not after.
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      columnFilters: { total: { operator: '>', value: 100 } },
    });

    expect(pageSql(sql)).toContain('SUM(sbt.quantity)');
    expect(countSql(sql)).toContain('SUM(sbt.quantity)');
  });

  it('binds a dynamic branch column id as a parameter, never as text', async () => {
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      columnFilters: { [`branch.qty.${BRANCH}`]: { operator: '>', value: 0 } },
    });

    const page = sql.find((q) => q.text.includes('LIMIT'))!;
    expect(page.text).toContain('sbb.branch_id = $5');
    expect(page.text).not.toContain(BRANCH);
    expect(page.params).toContain(BRANCH);
  });

  it('keeps the branch id and the filter value in the order they were built', async () => {
    // The branch id is bound before the filter values, so both halves keep the
    // indices their SQL was written against. Off-by-one here is a wrong answer,
    // not an error.
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      columnFilters: { [`branch.qty.${BRANCH}`]: { operator: '>', value: 7 } },
    });

    const page = sql.find((q) => q.text.includes('LIMIT'))!;
    expect(page.params[4]).toBe(BRANCH);
    expect(page.params[5]).toBe(7);
  });

  it('AND-s two branch columns with distinct parameters', async () => {
    const other = '99999999-8888-4777-8666-555555555555';
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      columnFilters: {
        [`branch.qty.${BRANCH}`]: { operator: '>', value: 0 },
        [`branch.qty.${other}`]: { operator: '>', value: 0 },
      },
    });

    const page = sql.find((q) => q.text.includes('LIMIT'))!;
    expect(page.text).toContain('sbb.branch_id = $5');
    expect(page.text).toContain('sbb.branch_id = $6');
    expect(page.params.slice(4, 6)).toEqual([BRANCH, other]);
  });

  it('refuses a branch key that is not a uuid', async () => {
    const { service } = capture();

    await expect(
      service.aggregate({
        ...baseQuery,
        columnFilters: {
          "branch.qty.'; DROP TABLE items --": { operator: '>', value: 0 },
        },
      }),
    ).rejects.toThrow(/không phải mã chi nhánh hợp lệ/);
  });

  it('refuses an item-level filter on the parent/group grain', async () => {
    // A row there is a product or a category; `color` has no value to compare
    // against, so refusing beats quietly ignoring the filter.
    const { service } = capture();

    await expect(
      service.aggregate({
        ...baseQuery,
        itemGroupBy: 'group',
        columnFilters: { color: { operator: '=', value: 'Đen' } },
      }),
    ).rejects.toThrow(/color/);
  });
});
