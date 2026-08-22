import { TransferReportService } from './transfer-report.service';

/**
 * First tests for this engine — it had none.
 *
 * They read the SQL the service builds rather than its results, because the
 * failure they exist to catch is structural: the rows query and the count query
 * take the same filter fragment, so a relation joined in one but not the other
 * either fails with 42P01 or, worse, silently describes a different set.
 */
describe('TransferReportService.byBranch', () => {
  function capture() {
    const sql: string[] = [];
    const dataSource = {
      query: jest.fn().mockImplementation((text: string) => {
        sql.push(text);
        return Promise.resolve(text.includes('COUNT(*)') ? [{ total: 0 }] : []);
      }),
    };
    return { sql, service: new TransferReportService(dataSource as never) };
  }

  const baseQuery = {
    organizationId: 'org-1',
    startDate: new Date('2026-08-01'),
    endDate: new Date('2026-09-01'),
    sourceBranchId: 'branch-1',
    page: 1,
    pageSize: 20,
  };

  const rowsSql = (sql: string[]) => sql.find((t) => !t.includes('COUNT(*)'))!;
  const countSql = (sql: string[]) => sql.find((t) => t.includes('COUNT(*)'))!;

  it('runs without column filters', async () => {
    const { sql, service } = capture();

    const result = await service.byBranch(baseQuery);

    expect(result.total).toBe(0);
    expect(sql).toHaveLength(2);
  });

  // Regression: the rows query never received `filterWhere`, so a column filter
  // moved the count and the footer while the grid kept showing every row.
  it('applies the column filter to the rows query, not just the count', async () => {
    const { sql, service } = capture();

    await service.byBranch({
      ...baseQuery,
      columnFilters: { outQty: { operator: '>', value: 0 } },
    });

    expect(rowsSql(sql)).toContain('c.out_qty');
    expect(countSql(sql)).toContain('c.out_qty');
  });

  it('applies it on the aggregated grain too', async () => {
    const { sql, service } = capture();

    await service.byBranch({
      ...baseQuery,
      itemGroupBy: 'group',
      columnFilters: { outQty: { operator: '>', value: 0 } },
    });

    expect(rowsSql(sql)).toContain('ia.out_qty');
    expect(countSql(sql)).toContain('ia.out_qty');
  });

  // Regression: the count query lacked the INNER JOIN on branches that the rows
  // query has, so it counted pairs the grid could never show.
  it('counts over the same joins the rows query selects from', async () => {
    const { sql, service } = capture();

    await service.byBranch(baseQuery);

    expect(countSql(sql)).toContain('JOIN branches b ON b.id = c.other_branch_id');
  });

  it.each([
    ['brand', 'i.brand'],
    ['categoryName', 'ic.name'],
    ['parentSku', 'pr.code'],
    ['parentName', 'pr.name'],
  ])('resolves the %s predicate in both queries', async (key, column) => {
    const { sql, service } = capture();

    await service.byBranch({
      ...baseQuery,
      columnFilters: { [key]: { operator: '*', value: 'x' } },
    });

    for (const text of sql) {
      expect(text).toContain(column);
    }
  });

  it('joins the relations those predicates name, in the count query too', async () => {
    const { sql, service } = capture();

    await service.byBranch({
      ...baseQuery,
      columnFilters: { categoryName: { operator: '*', value: 'x' } },
    });

    expect(countSql(sql)).toContain('LEFT JOIN inventory_item_categories ic');
    expect(countSql(sql)).toContain('LEFT JOIN products pr');
  });

  it('refuses a column it has no expression for', async () => {
    const { service } = capture();

    await expect(
      service.byBranch({
        ...baseQuery,
        columnFilters: { nope: { operator: '=', value: 'x' } },
      }),
    ).rejects.toThrow(/nope/);
  });

  it('parameterises filter values rather than interpolating them', async () => {
    const { sql, service } = capture();

    await service.byBranch({
      ...baseQuery,
      columnFilters: { brand: { operator: '=', value: "'; DROP TABLE items --" } },
    });

    for (const text of sql) {
      expect(text).not.toContain('DROP TABLE');
    }
  });

  it.each([
    ['color', "LOWER(pad.name) IN ('màu sắc', 'màu', 'color')"],
    ['size', "LOWER(pad.name) = 'size'"],
    ['destinationBranchName', 'b.name'],
  ])('resolves the %s predicate in both queries', async (key, marker) => {
    const { sql, service } = capture();

    await service.byBranch({
      ...baseQuery,
      columnFilters: { [key]: { operator: '*', value: 'x' } },
    });

    for (const text of sql) {
      expect(text).toContain(marker);
    }
  });

  it('filters the average unit price without ever summing it', async () => {
    const { sql, service } = capture();

    const result = await service.byBranch({
      ...baseQuery,
      columnFilters: { outAvgPrice: { from: 100, to: 200 } },
    });

    // NULLIF guards the zero-quantity rows rather than failing the query.
    expect(rowsSql(sql)).toContain('NULLIF(c.out_qty, 0)');
    // Average of averages is not an average, so the footer never carries these.
    expect(result.totals).not.toHaveProperty('outAvgPrice');
    expect(result.totals).not.toHaveProperty('inAvgPrice');
  });
});
