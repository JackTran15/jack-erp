import { StockPeriodService } from './stock-period.service';

/**
 * ADR-07 — the four transfer columns moved into SQL, and their meaning changed.
 *
 * The JS version deduplicated "Sắp nhận về" on (item, destination branch) and
 * kept only the first match, so an item arriving from two sources was
 * under-counted — and "first" was whatever Postgres returned, because the
 * pending query had no ORDER BY. There was no well-defined behaviour to port,
 * so the product owner chose to fix it: sum every source.
 *
 * The three tests that used to live here specified that JS function. It has no
 * callers left, so they specified nothing and were replaced rather than kept.
 */
describe('StockPeriodService pending transfers', () => {
  function capture(rows: Record<string, unknown>[] = []) {
    const sql: string[] = [];
    const dataSource = {
      query: jest.fn().mockImplementation((text: string) => {
        sql.push(text);
        return Promise.resolve(
          text.includes('COUNT(*)')
            ? [{ total: rows.length, transfer_out_qty: '4', incoming_qty: '11' }]
            : rows,
        );
      }),
    };
    return { sql, service: new StockPeriodService(dataSource as never) };
  }

  const baseQuery = {
    organizationId: 'org-1',
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-07-01T00:00:00.000Z'),
    page: 1,
    pageSize: 20,
  };

  it('sums every pending source instead of keeping only the first', async () => {
    // The whole point of ADR-07. Two orders heading for the same destination
    // used to contribute one of them; now both count.
    const { sql, service } = capture();

    await service.aggregate({ ...baseQuery, groupBy: 'item_branch' });

    const [dataSql] = sql;
    expect(dataSql).toContain('pending_in AS (');
    expect(dataSql).toContain('SUM(pb.quantity)');
    // No dedup survives: grouping is by (item, destination) and nothing picks a
    // single row out of the group.
    expect(dataSql).not.toContain('DISTINCT ON (pb.destination_branch_id)');
  });

  it('attributes the branch figure to the default receiving location', async () => {
    // A transfer order names a destination BRANCH and no location, so the
    // per-location grid has to put a branch-level number on some row.
    const { sql, service } = capture();

    await service.aggregate({ ...baseQuery, groupBy: 'item_location' });

    const [dataSql] = sql;
    expect(dataSql).toContain('default_receiving AS (');
    expect(dataSql).toContain('st.is_default_receiving = TRUE');
    // The cast is load-bearing, not cosmetic: storages.branch_id is uuid while
    // transfer_orders.destination_branch_id is varchar, and Postgres has no
    // uuid = varchar operator. Dropping it fails at run time, not compile time.
    expect(dataSql).toContain(
      'JOIN default_receiving dr ON dr.branch_id::text = pb.destination_branch_id',
    );
  });

  it('picks the landing location deterministically', async () => {
    // erp_dev has exactly one candidate per branch today, but a branch
    // configured differently must still give a stable answer.
    const { sql, service } = capture();

    await service.aggregate({ ...baseQuery, groupBy: 'item_location' });

    expect(sql[0]).toContain(
      'ORDER BY st.branch_id, loc_r.is_default DESC,\n                 loc_r.is_unassigned DESC, loc_r.code ASC',
    );
  });

  it('leaves a branch with no default receiving warehouse unattributed', async () => {
    // An INNER JOIN, so such a branch contributes no incoming row at all —
    // rather than silently landing the figure on an arbitrary location.
    const { sql, service } = capture();

    await service.aggregate({ ...baseQuery, groupBy: 'item_location' });

    expect(sql[0]).toContain('JOIN default_receiving dr');
    expect(sql[0]).not.toContain('LEFT JOIN default_receiving dr');
  });

  it('keeps "đang chuyển đi" summing every order, as it always did', async () => {
    const { sql, service } = capture();

    await service.aggregate({ ...baseQuery, groupBy: 'item_branch' });

    expect(sql[0]).toContain('pending_out AS (');
    expect(sql[0]).toContain('SUM(pb.quantity)');
  });

  it('reads the four columns off the row rather than stitching them on', async () => {
    const { service } = capture([
      {
        item_id: 'item-1', sku: 'SKU-1', item_name: 'Hàng 1', unit: 'Cái',
        category_id: null, category_name: null,
        branch_id: 'branch-B', branch_code: null, branch_name: 'B',
        opening_qty: '0', opening_value: '0', in_qty: '0', in_value: '0',
        out_qty: '0', out_value: '0', closing_qty: '0', closing_value: '0',
        transfer_out_qty: '4', transfer_out_value: '400',
        incoming_qty: '11', incoming_value: '1100',
      },
    ]);

    const result = await service.aggregate({ ...baseQuery, groupBy: 'item_branch' });

    expect(result.data[0].transferOutQty).toBe(4);
    expect(result.data[0].transferOutValue).toBe(400);
    expect(result.data[0].incomingQty).toBe(11);
    expect(result.data[0].incomingValue).toBe(1100);
  });

  it('takes the transfer totals from the same count query as everything else', async () => {
    // They used to need buildRowKeysSql to replay the JS stitching over the
    // whole set. One query now covers rows, count and footer, so they cannot
    // describe different sets.
    const { sql, service } = capture([]);

    const result = await service.aggregate({ ...baseQuery, groupBy: 'item_branch' });

    expect(result.totals.transferOutQty).toBe(4);
    expect(result.totals.incomingQty).toBe(11);
    // Two queries, not four: the pending fetch and the row-key replay are gone.
    expect(sql).toHaveLength(2);
  });

  it('filters on a transfer column under SQL', async () => {
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      groupBy: 'item_branch',
      columnFilters: { transferOutQty: { operator: '>', value: 0 } },
    });

    for (const text of sql) {
      expect(text).toContain('COALESCE(pout.qty, 0)');
    }
  });

  it('leaves the parent/group grain without the CTEs it cannot use', async () => {
    // At that grain `item_id` is really an aggregate key, so no pending row ever
    // matched. The columns were always zero there; they still are, without
    // paying for a scan.
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      groupBy: 'item_branch',
      itemGroupBy: 'group',
    });

    expect(sql[0]).not.toContain('pending_base AS (');
  });
});

describe('StockPeriodService item-level text filters', () => {
  function capture() {
    const sql: string[] = [];
    const dataSource = {
      query: jest.fn().mockImplementation((text: string) => {
        sql.push(text);
        return Promise.resolve(text.includes('COUNT(*)') ? [{ total: 0 }] : []);
      }),
    };
    return { sql, service: new StockPeriodService(dataSource as never) };
  }

  const baseQuery = {
    organizationId: 'org-1',
    startDate: new Date('2026-08-01'),
    endDate: new Date('2026-09-01'),
    groupBy: 'item_location' as const,
    page: 1,
    pageSize: 50,
  };

  /** Every query built from `filterWhere`; the pending-transfer query is not one. */
  function filterAwareQueries(sql: string[]): string[] {
    return sql.filter((text) => text.includes('WITH') && text.includes('combined'));
  }

  it.each([
    ['categoryName', 'ic.name'],
    ['parentSku', 'pr.code'],
    ['parentName', 'pr.name'],
  ])('splices the %s predicate into every filter-aware query', async (key, column) => {
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      columnFilters: { [key]: { operator: '*', value: 'x' } },
    });

    const queries = filterAwareQueries(sql);
    expect(queries.length).toBeGreaterThanOrEqual(2);
    for (const text of queries) {
      expect(text).toContain(column);
    }
  });

  it('joins products and categories in every query that carries the predicate', async () => {
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      columnFilters: { categoryName: { operator: '=', value: 'Giày nam' } },
    });

    for (const text of filterAwareQueries(sql)) {
      expect(text).toContain('LEFT JOIN inventory_item_categories ic');
      expect(text).toContain('LEFT JOIN products pr');
    }
  });

  it('filters colour on the same expression the cell displays', async () => {
    // Two copies of that correlated lookup would drift; one constant cannot.
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      columnFilters: { color: { operator: '=', value: 'Đen' } },
    });

    const [dataSql] = sql;
    const marker = "LOWER(pad.name) IN ('màu sắc', 'màu', 'color')";
    // Once in the SELECT list that renders the cell, once in the predicate.
    expect(dataSql.split(marker)).toHaveLength(3);
  });

  it('parameterises filter values rather than interpolating them', async () => {
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      columnFilters: { categoryName: { operator: '=', value: "'; DROP TABLE items --" } },
    });

    for (const text of sql) {
      expect(text).not.toContain('DROP TABLE');
    }
  });

  it('leaves the parent/group grain without item-level text specs', async () => {
    // Those grains project from `item_agg`, where a single item's parent and
    // colour do not exist. Filtering them has to be refused, not guessed at.
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

describe('StockPeriodService location filters', () => {
  function capture() {
    const sql: string[] = [];
    const dataSource = {
      query: jest.fn().mockImplementation((text: string) => {
        sql.push(text);
        return Promise.resolve(text.includes('COUNT(*)') ? [{ total: 0 }] : []);
      }),
    };
    return { sql, service: new StockPeriodService(dataSource as never) };
  }

  const baseQuery = {
    organizationId: 'org-1',
    startDate: new Date('2026-08-01'),
    endDate: new Date('2026-09-01'),
    page: 1,
    pageSize: 50,
  };

  it.each([
    ['locationCode', 'loc.code'],
    ['locationName', 'loc.name'],
  ])('filters %s under SQL on the item_location grain', async (key, column) => {
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      groupBy: 'item_location',
      columnFilters: { [key]: { operator: '+', value: 'A1' } },
    });

    const filterAware = sql.filter((t) => t.includes('combined'));
    for (const text of filterAware) {
      expect(text).toContain(column);
      // The predicate is worthless without the relation it names.
      expect(text).toContain('LEFT JOIN locations loc');
    }
  });

  it('refuses a location filter on the item_branch grain', async () => {
    // Those rows are keyed by branch; there is no location to compare against,
    // so answering with unfiltered rows under a filtered-looking UI is the one
    // outcome that must not happen.
    const { service } = capture();

    await expect(
      service.aggregate({
        ...baseQuery,
        groupBy: 'item_branch',
        columnFilters: { locationCode: { operator: '=', value: 'A1' } },
      }),
    ).rejects.toThrow(/locationCode/);
  });

  it('leaves the location join out when nothing needs it', async () => {
    const { sql, service } = capture();

    await service.aggregate({ ...baseQuery, groupBy: 'item_branch' });

    const countSql = sql.find((t) => t.includes('COUNT(*)'))!;
    expect(countSql).not.toContain('LEFT JOIN locations loc');
  });
});

describe('StockPeriodService branch-grain filters', () => {
  function capture() {
    const sql: string[] = [];
    const dataSource = {
      query: jest.fn().mockImplementation((text: string) => {
        sql.push(text);
        return Promise.resolve(text.includes('COUNT(*)') ? [{ total: 0 }] : []);
      }),
    };
    return { sql, service: new StockPeriodService(dataSource as never) };
  }

  const baseQuery = {
    organizationId: 'org-1',
    startDate: new Date('2026-08-01'),
    endDate: new Date('2026-09-01'),
    page: 1,
    pageSize: 50,
  };

  it('filters branchName under SQL on the item_branch grain', async () => {
    const { sql, service } = capture();

    await service.aggregate({
      ...baseQuery,
      groupBy: 'item_branch',
      columnFilters: { branchName: { operator: '=', value: 'Hà Nội' } },
    });

    for (const text of sql.filter((t) => t.includes('combined'))) {
      expect(text).toContain('b.name');
      expect(text).toContain('JOIN branches b ON b.id::text = c.group_key');
    }
  });

  it('refuses branchName on the item_location grain', async () => {
    const { service } = capture();

    await expect(
      service.aggregate({
        ...baseQuery,
        groupBy: 'item_location',
        columnFilters: { branchName: { operator: '=', value: 'Hà Nội' } },
      }),
    ).rejects.toThrow(/branchName/);
  });

  it('has no spec for branchCode, because the column is always null', async () => {
    // Every query selects `NULL::text AS branch_code`. A filter that matched
    // nothing while looking active is worse than an explicit refusal.
    const { service } = capture();

    await expect(
      service.aggregate({
        ...baseQuery,
        groupBy: 'item_branch',
        columnFilters: { branchCode: { operator: '=', value: 'HN' } },
      }),
    ).rejects.toThrow(/branchCode/);
  });

  it('casts the branch join, because branch_id is varchar and branches.id is uuid', async () => {
    const { sql, service } = capture();

    await service.aggregate({ ...baseQuery, groupBy: 'item_branch' });

    const countSql = sql.find((t) => t.includes('COUNT(*)'))!;
    expect(countSql).toContain('b.id::text = c.group_key');
  });
});
