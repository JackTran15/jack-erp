import { TransferDetailService } from './transfer-detail.service';

/**
 * Structural tests — the mocked DataSource cannot execute SQL, so these assert
 * the query's shape. Behaviour was checked by running the generated SQL against
 * `erp_dev`; the figures are recorded in T-03-02.
 *
 * The shape matters more here than usual: `received` and `unmatched` have to
 * PARTITION `out`, or the L3 total stops equalling the difference cell that
 * opened it.
 */
describe('TransferDetailService', () => {
  function capture() {
    const sql: string[] = [];
    const dataSource = {
      query: jest.fn().mockImplementation((text: string) => {
        sql.push(text);
        return Promise.resolve(text.includes('COUNT(*)') ? [{ total: 0 }] : []);
      }),
    };
    return { sql, service: new TransferDetailService(dataSource as never) };
  }

  const base = {
    organizationId: 'org-1',
    startDate: new Date('2026-07-09'),
    endDate: new Date('2026-08-31'),
    sourceBranchId: 'src',
    destinationBranchId: 'dst',
    page: 1,
    pageSize: 20,
  } as const;

  const rowsSql = (sql: string[]) => sql.find((t) => !t.includes('COUNT(*)'))!;
  const countSql = (sql: string[]) => sql.find((t) => t.includes('COUNT(*)'))!;

  it('pages in SQL', async () => {
    const { sql, service } = capture();

    await service.detail({ ...base, leg: 'out' });

    expect(rowsSql(sql)).toContain('LIMIT $7 OFFSET $8');
  });

  /**
   * `received` and `unmatched` are the same query with opposite predicates on
   * whether the LATERAL found a paired receipt. That is what makes them add
   * back up to `out`.
   */
  it('partitions `out` into received and unmatched on the same predicate', async () => {
    const { sql, service } = capture();

    await service.detail({ ...base, leg: 'received' });
    const text = rowsSql(sql);

    expect(text).toContain("($6 <> 'received'  OR pair.document_number IS NOT NULL)");
    expect(text).toContain("($6 <> 'unmatched' OR pair.document_number IS NULL)");
  });

  /** ADR-03: the legacy flow is atomic, so it can never be "not yet received". */
  it('excludes legacy transfers from the unmatched leg', async () => {
    const { sql, service } = capture();

    await service.detail({ ...base, leg: 'unmatched' });
    const legacy = rowsSql(sql).slice(rowsSql(sql).indexOf('FROM stock_transfers'));

    expect(legacy).toContain("$6 <> 'unmatched'");
  });

  it('reads receipts, and pairs back to the issue, on the `in` leg', async () => {
    const { sql, service } = capture();

    await service.detail({ ...base, leg: 'in' });
    const text = rowsSql(sql);

    expect(text).toContain('FROM goods_receipts gr');
    expect(text).toContain('gi.reference_id = gr.reference_id');
  });

  it('orders the branch pair the same way on both issue and receipt legs', async () => {
    const out = capture();
    await out.service.detail({ ...base, leg: 'out' });
    const inn = capture();
    await inn.service.detail({ ...base, leg: 'in' });

    // Source ships, destination receives — whichever document is primary.
    expect(rowsSql(out.sql)).toContain('gi.branch_id = $4::text');
    expect(rowsSql(out.sql)).toContain('gi.target_branch_id = $5::uuid');
    expect(rowsSql(inn.sql)).toContain('gr.branch_id = $5::text');
    expect(rowsSql(inn.sql)).toContain('gr.source_branch_id = $4');
  });

  /**
   * Regression guard for 42P01: the count query must carry every join the rows
   * query does, or a filter naming a joined relation breaks only the footer.
   */
  it('gives the count query the same CTE and item join as the rows query', async () => {
    const { sql, service } = capture();

    await service.detail({ ...base, leg: 'out' });

    expect(countSql(sql)).toContain('WITH legs AS (');
    expect(countSql(sql)).toContain('JOIN items i ON i.id = l.item_id');
  });

  /**
   * Báo cáo 6 prices the legacy flow from `items.purchase_price`, so this must
   * too — `stock_transfer_lines.unit_price` exists and is truer, but using it
   * would make the dialog disagree with the cell that opened it.
   */
  it('prices legacy transfer lines the way the parent report does', async () => {
    const { sql, service } = capture();

    await service.detail({ ...base, leg: 'out' });

    expect(rowsSql(sql)).toContain('COALESCE(i.purchase_price, 0)');
    expect(rowsSql(sql)).not.toContain('stl.unit_price');
  });
});
