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

/**
 * `summarize()` — Báo cáo 6.
 *
 * These read the generated SQL, not results, for the same reason as above: the
 * mocked DataSource cannot execute anything. That is a real ceiling and worth
 * naming — a passing suite here proves the query is SHAPED right, never that a
 * given voucher produces a given number. Behaviour is checked by running the
 * generated SQL against a populated database; see T-01-04 in
 * `.ai/features/transfer-summary-drilldown/`.
 *
 * What these do catch is the regression that produced "shipped 22, received
 * back 31": `received` computed from the receipt side, matched to `out` on
 * branch pair alone.
 */
/**
 * N4: the aggregate grain's count query used to read `FROM item_agg ia` alone
 * while the rows query read the same CTE through `joinLookup` and an INNER
 * `JOIN branches`. An INNER join drops rows, so `total` and the four footer
 * figures described a strictly larger set than the grid — enough to paginate
 * to a page that renders nothing.
 *
 * The cherry-pick in UOW-01 already carried the fix. These tests exist so it
 * cannot be lost again, because on `erp_dev_3008` the bug is **invisible**:
 * every `other_branch_id` resolves (0 of 7 unresolvable), so a live row count
 * agrees whether the join is there or not. Only the SQL shape shows it.
 */
describe('TransferReportService.byBranch — count and rows describe one set (N4)', () => {
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
    startDate: new Date('2026-01-01'),
    endDate: new Date('2027-01-01'),
    sourceBranchId: 'branch-1',
    page: 1,
    pageSize: 20,
  };

  const rowsSql = (sql: string[]) => sql.find((t) => !t.includes('COUNT(*)'))!;
  const countSql = (sql: string[]) => sql.find((t) => t.includes('COUNT(*)'))!;

  /** Every relation the query reads, in the order it joins them. */
  function relations(text: string): string[] {
    return [...text.matchAll(/(?:FROM|JOIN)\s+([a-z_]+)\s/g)]
      .map((m) => m[1])
      .filter((r) => r !== 'SELECT');
  }

  it.each(['parent', 'group'] as const)(
    'counts over the same relations it pages over, at the %s grain',
    async (itemGroupBy) => {
      const { sql, service } = capture();

      await service.byBranch({ ...baseQuery, itemGroupBy });

      // The row-dropping join is the one that matters: `branches` is INNER, so
      // a count without it counts groups the grid will never show.
      expect(countSql(sql)).toContain('JOIN branches b ON b.id = ia.other_branch_id');
      expect(rowsSql(sql)).toContain('JOIN branches b ON b.id = ia.other_branch_id');
      expect(relations(countSql(sql))).toEqual(relations(rowsSql(sql)));
    },
  );

  it.each(['parent', 'group'] as const)(
    'resolves the identity lookup in both queries at the %s grain',
    async (itemGroupBy) => {
      // Not just row parity: the identity filters compile to `p.` / `ic.`
      // expressions, so a count without the lookup join fails outright with
      // 42P01 the first time someone filters on a name.
      const { sql, service } = capture();
      const lookup = itemGroupBy === 'parent' ? 'JOIN products p' : 'JOIN inventory_item_categories ic';

      await service.byBranch({
        ...baseQuery,
        itemGroupBy,
        columnFilters: { itemName: { operator: '*', value: 'Giày' } },
      });

      expect(countSql(sql)).toContain(lookup);
      expect(rowsSql(sql)).toContain(lookup);
    },
  );

  it('keeps the member scope in both queries as well', async () => {
    const { sql, service } = capture();

    await service.byBranch({
      ...baseQuery,
      itemGroupBy: 'group',
      memberScope: { unit: 'Đôi' },
    });

    for (const text of [rowsSql(sql), countSql(sql)]) {
      expect(text).toContain('i.unit  = $8');
    }
  });
});

describe('TransferReportService.summarize', () => {
  function capture() {
    const sql: string[] = [];
    const dataSource = {
      query: jest.fn().mockImplementation((text: string) => {
        sql.push(text);
        return Promise.resolve([]);
      }),
    };
    return { sql, service: new TransferReportService(dataSource as never) };
  }

  const run = async () => {
    const { sql, service } = capture();
    await service.summarize({
      organizationId: 'org-1',
      startDate: new Date('2026-07-09'),
      endDate: new Date('2026-08-31'),
    });
    return sql[0];
  };

  it('selects the branch code so "Mã cửa hàng" can render', async () => {
    const text = await run();

    expect(text).toContain('b.code AS branch_code');
    // Grouping has to carry it, or Postgres rejects the statement outright.
    expect(text).toContain('GROUP BY b.id, b.code, b.name');
  });

  /**
   * The load-bearing one. `received` must be measured on the ISSUE lines, so
   * that it is a subset of the rows producing `out` and `received - out <= 0`
   * holds by construction. A branch reading it off `goods_receipt_lines` is
   * exactly the defect this feature removed.
   */
  it('never derives `received` from the receipt side', async () => {
    const text = await run();

    // Check per UNION branch rather than across the whole statement: the outer
    // SELECT legitimately aggregates `received_qty`, and the IN leg legitimately
    // reads `goods_receipt_lines`. What must not exist is one branch doing both.
    const cte = text.slice(text.indexOf('WITH movements AS ('), text.indexOf('SELECT\n        b.id'));
    const receiptBranches = cte
      .split('UNION ALL')
      .filter((b) => b.includes('goods_receipt_lines'));

    expect(receiptBranches.length).toBeGreaterThan(0);
    for (const branch of receiptBranches) {
      expect(branch).toContain('0::numeric AS received_qty, 0::numeric AS received_value');
    }
  });

  it('gates `received` on a posted paired receipt, found via the transfer order', async () => {
    const text = await run();

    expect(text).toContain("gi.reference_type = 'TRANSFER_ORDER'");
    expect(text).toContain('gi.reference_id IS NOT NULL');
    expect(text).toContain('gr_p.reference_id = gi.reference_id');
    expect(text).toContain('CASE WHEN');
  });

  /**
   * AC-04. A transfer issue raised outside a transfer order carries no
   * reference, so `reference_id IS NOT NULL` is the whole rule keeping it out
   * of `received`. There is no such voucher in the dataset to test against —
   * the predicate's presence is all this level can assert.
   */
  it('excludes reference-less issues from `received` (AC-04, structural only)', async () => {
    const text = await run();

    const paired = text.slice(text.indexOf('CASE WHEN'));
    expect(paired).toContain('gi.reference_id IS NOT NULL');
  });

  /**
   * AC-05. The legacy single-phase flow posts both legs atomically, so it must
   * keep contributing to `received` unconditionally — no pairing predicate.
   */
  it('leaves the legacy stock_transfers leg unconditional (AC-05)', async () => {
    const text = await run();

    expect(text).toContain('stl.quantity::numeric AS received_qty');
  });

  /**
   * ADR-01 / D3: the pairing is deliberately NOT bounded by the period end, so
   * "chênh lệch" reads as "still unconfirmed as of now". Flipping that is a
   * one-line change; this pins which line it is.
   */
  it('does not bound the paired receipt by the period end', async () => {
    const text = await run();

    const exists = text.slice(text.indexOf('EXISTS ('), text.indexOf('EXISTS (') + 400);
    expect(exists).not.toContain('gr_p.posted_at');
  });
});

/**
 * `summarizeByCounterpart()` — L1 of the drill-down.
 *
 * AC-07 says the dialog's footer equals the row that opened it. That holds by
 * construction: these are the four `summarize()` movement branches with one
 * anchor predicate added and the grouping moved to the other end. So the thing
 * worth pinning here is that the two queries stay STRUCTURALLY the same — the
 * day someone hand-tunes one of them is the day the numbers drift apart.
 */
describe('TransferReportService.summarizeByCounterpart', () => {
  function capture(rows: unknown[] = []) {
    const sql: string[] = [];
    const dataSource = {
      query: jest.fn().mockImplementation((text: string) => {
        sql.push(text);
        return Promise.resolve(text.includes('COUNT(*)') ? [{ total: 0 }] : rows);
      }),
    };
    return { sql, service: new TransferReportService(dataSource as never) };
  }

  const base = {
    organizationId: 'org-1',
    startDate: new Date('2026-07-09'),
    endDate: new Date('2026-08-31'),
    branchId: 'branch-anchor',
  };

  const rowsSql = (sql: string[]) => sql.find((t) => !t.includes('COUNT(*)'))!;
  const countSql = (sql: string[]) => sql.find((t) => t.includes('COUNT(*)'))!;

  it('pages in SQL rather than in memory', async () => {
    const { sql, service } = capture();

    await service.summarizeByCounterpart({ ...base, page: 3, pageSize: 20 });

    expect(rowsSql(sql)).toContain('LIMIT $5 OFFSET $6');
  });

  it('derives page totals and the row count from the same CTE', async () => {
    const { sql, service } = capture();

    await service.summarizeByCounterpart(base);

    // Both statements must carry the whole movements CTE, or the footer
    // describes a different set from the grid.
    expect(rowsSql(sql)).toContain('WITH movements AS (');
    expect(countSql(sql)).toContain('WITH movements AS (');
    expect(countSql(sql)).toContain('COUNT(*)::int AS total');
  });

  it('groups by the counterpart branch, not the anchor', async () => {
    const { sql, service } = capture();

    await service.summarizeByCounterpart(base);

    expect(rowsSql(sql)).toContain('AS counterpart_id');
    expect(rowsSql(sql)).toContain('b.id::text = m.counterpart_id');
    expect(rowsSql(sql)).toContain('GROUP BY b.id, b.code, b.name');
  });

  /**
   * The AC-07 guarantee, expressed the only way a mocked DataSource can: the
   * anchor is applied on all four movement branches, so no leg can leak
   * traffic that the parent row does not also count.
   */
  it('anchors every movement branch on the clicked branch', async () => {
    const { sql, service } = capture();

    await service.summarizeByCounterpart(base);

    const cte = rowsSql(sql).slice(0, rowsSql(sql).indexOf('agg AS ('));
    const branches = cte.split('UNION ALL');
    expect(branches).toHaveLength(4);
    for (const branch of branches) {
      expect(branch).toMatch(/=\s*\$4/);
    }
  });

  it('reuses the same pairing predicate as the parent report', async () => {
    const { sql, service } = capture();

    await service.summarizeByCounterpart(base);

    expect(rowsSql(sql)).toContain('gr_p.reference_id = gi.reference_id');
    expect(rowsSql(sql)).toContain("gi.reference_type = 'TRANSFER_ORDER'");
  });

  it('keeps the legacy transfer leg contributing to received', async () => {
    const { sql, service } = capture();

    await service.summarizeByCounterpart(base);

    expect(rowsSql(sql)).toContain('stl.quantity::numeric AS received_qty');
  });
});


/**
 * L1's column filters — the same "validated then dropped" bug as the L2/L3
 * dialogs, in the summary that opens them (ADR-06, AC-16).
 */
describe('TransferReportService.summarizeByCounterpart column filters', () => {
  function capture() {
    const sql: Array<{ text: string; params: unknown[] }> = [];
    const dataSource = {
      query: jest.fn().mockImplementation((text: string, params: unknown[]) => {
        sql.push({ text, params });
        return Promise.resolve(text.includes('COUNT(*)') ? [{ total: 0 }] : []);
      }),
    };
    return { sql, service: new TransferReportService(dataSource as never) };
  }

  const base = {
    organizationId: 'org-1',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2027-01-01'),
    branchId: 'branch-1',
    page: 1,
    pageSize: 20,
  };

  type Captured = { text: string; params: unknown[] };
  const rows = (sql: Captured[]) => sql.find((q) => !q.text.includes('COUNT(*)'))!;
  const count = (sql: Captured[]) => sql.find((q) => q.text.includes('COUNT(*)'))!;

  it('filters the rows and the footer by the same predicate', async () => {
    const { sql, service } = capture();

    await service.summarizeByCounterpart({
      ...base,
      columnFilters: { branchName: { operator: '*', value: 'HCM' } },
    });

    expect(rows(sql).text).toContain('branch_name');
    expect(count(sql).text).toContain('branch_name');
    expect(rows(sql).params).toContain('%HCM%');
    expect(count(sql).params).toContain('%HCM%');
  });

  it.each([
    ['diffQty', '(received_qty - out_qty)'],
    ['diffValue', '(received_value - out_value)'],
    ['inOutDiffQty', '(in_qty - out_qty)'],
    ['inOutDiffValue', '(in_value - out_value)'],
  ])('compiles the derived column %s to the arithmetic the row shows', async (col, expr) => {
    // These are not columns of `agg`; filtering them has to repeat the same
    // subtraction the row mapper does, or the filter and the number disagree.
    const { sql, service } = capture();

    await service.summarizeByCounterpart({
      ...base,
      columnFilters: { [col]: { operator: '>=', value: 1 } },
    });

    expect(rows(sql).text).toContain(expr);
  });

  it('keeps LIMIT behind the bound filter values', async () => {
    const { sql, service } = capture();

    await service.summarizeByCounterpart({
      ...base,
      columnFilters: { outQty: { operator: '>=', value: 1 } },
    });

    expect(rows(sql).text).toContain('LIMIT $6 OFFSET $7');
  });

  it('refuses a column it has no expression for', async () => {
    const { service } = capture();

    await expect(
      service.summarizeByCounterpart({
        ...base,
        columnFilters: { nonsense: { operator: '=', value: 'x' } },
      }),
    ).rejects.toThrow(/nonsense/);
  });
});
