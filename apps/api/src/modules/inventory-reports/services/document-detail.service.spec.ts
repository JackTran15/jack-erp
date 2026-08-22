import { DocumentDetailService } from './document-detail.service';

/**
 * First tests for this engine — it had none.
 *
 * They read the SQL the service builds rather than its results. The failure they
 * exist to catch is structural: the rows query and the count query take the same
 * filter fragment, so a relation joined in one but not the other either fails
 * with 42P01 or silently describes a different set (ADR-04). This report unions
 * three document streams, so every predicate also has to sit at the outer stage
 * where all three already have the same shape.
 */
describe('DocumentDetailService.list', () => {
  function capture() {
    const sql: string[] = [];
    const dataSource = {
      query: jest.fn().mockImplementation((text: string) => {
        sql.push(text);
        return Promise.resolve(text.includes('COUNT(*)') ? [{ total: 0 }] : []);
      }),
    };
    return { sql, service: new DocumentDetailService(dataSource as never) };
  }

  const baseQuery = {
    organizationId: 'org-1',
    startDate: new Date('2026-08-01'),
    endDate: new Date('2026-09-01'),
    page: 1,
    pageSize: 20,
  };

  const rowsSql = (sql: string[]) => sql.find((t) => !t.includes('COUNT(*)'))!;
  const countSql = (sql: string[]) => sql.find((t) => t.includes('COUNT(*)'))!;

  it('runs without column filters', async () => {
    const { sql, service } = capture();

    const result = await service.list(baseQuery);

    expect(result.total).toBe(0);
    expect(sql).toHaveLength(2);
  });

  it.each([
    ['date', "to_char(l.posted_at, 'DD/MM/YYYY')"],
    ['documentType', "WHEN l.doc_kind = 'GOODS_RECEIPT'"],
    ['warehouse', 'COALESCE(loc.name, bs.name)'],
    ['notes', 'l.notes'],
    ['customer', "l.counterparty_kind = 'supplier'"],
    ['branchName', 'bs.name'],
    ['receiverBranchName', 'br.name'],
    ['group', 'ic.name'],
    ['parentSku', 'pr.code'],
    ['parentName', 'pr.name'],
  ])('resolves the %s predicate in both queries', async (key, marker) => {
    const { sql, service } = capture();

    await service.list({
      ...baseQuery,
      columnFilters: { [key]: { operator: '*', value: 'x' } },
    });

    expect(rowsSql(sql)).toContain(marker);
    expect(countSql(sql)).toContain(marker);
  });

  it('joins the relations those predicates name in the count query too', async () => {
    const { sql, service } = capture();

    await service.list({
      ...baseQuery,
      columnFilters: { warehouse: { operator: '*', value: 'Kho' } },
    });

    const count = countSql(sql);
    expect(count).toContain('LEFT JOIN locations loc');
    expect(count).toContain('LEFT JOIN branches bs');
    expect(count).toContain('LEFT JOIN branches br');
    expect(count).toContain('LEFT JOIN inventory_item_categories ic');
    expect(count).toContain('LEFT JOIN products pr');
  });

  it('renders the document type label from the shared constant', async () => {
    // The cell shows a Vietnamese label; filtering has to match that label, not
    // the enum behind it. Building the CASE from the shared map is what keeps
    // the two from drifting.
    const { sql, service } = capture();

    await service.list({
      ...baseQuery,
      columnFilters: { documentType: { operator: '=', value: 'Phiếu điều chuyển kho' } },
    });

    expect(rowsSql(sql)).toContain("THEN 'Phiếu điều chuyển kho'");
  });

  it('filters the date on the format the column displays', async () => {
    // The column is declared STRING, so the grid gives it a TEXT filter box and
    // the user types against dd/MM/yyyy. Matching ISO here would never hit.
    const { sql, service } = capture();

    await service.list({
      ...baseQuery,
      columnFilters: { date: { operator: '*', value: '08/2026' } },
    });

    expect(rowsSql(sql)).toContain("to_char(l.posted_at, 'DD/MM/YYYY')");
  });

  it.each(['branchCode', 'receiverBranchCode'])(
    'refuses %s, because the column is always null',
    async (key) => {
      const { service } = capture();

      await expect(
        service.list({
          ...baseQuery,
          columnFilters: { [key]: { operator: '=', value: 'HN' } },
        }),
      ).rejects.toThrow(new RegExp(key));
    },
  );

  it('keeps the filter on the keyset export path as well', async () => {
    // Export walks by cursor. Same filter, or the file disagrees with the grid.
    const { sql, service } = capture();

    await service.list({
      ...baseQuery,
      keyset: true,
      columnFilters: { warehouse: { operator: '*', value: 'Kho' } },
    });

    expect(rowsSql(sql)).toContain('COALESCE(loc.name, bs.name)');
  });

  it('parameterises filter values rather than interpolating them', async () => {
    const { sql, service } = capture();

    await service.list({
      ...baseQuery,
      columnFilters: { notes: { operator: '=', value: "'; DROP TABLE items --" } },
    });

    for (const text of sql) {
      expect(text).not.toContain('DROP TABLE');
    }
  });
});
