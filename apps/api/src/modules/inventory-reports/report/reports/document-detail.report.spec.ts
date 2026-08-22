import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { DocumentDetailRow } from '../../services/document-detail.service';
import { DocumentDetailReport } from './document-detail.report';

const actor = { userId: 'u1', organizationId: 'org-1', roles: [] } as unknown as ActorContext;

function engineRow(overrides: Partial<DocumentDetailRow>): DocumentDetailRow {
  return {
    docKind: 'GOODS_RECEIPT',
    postedAt: new Date('2026-07-03T10:00:00Z'),
    documentNumber: 'PNK-26-0001',
    referenceNumber: 'ref-1',
    sku: 'SKU-1',
    itemName: 'Item 1',
    parentSku: null,
    parentName: null,
    unit: 'Cái',
    categoryId: 'cat-1',
    categoryName: 'Nhóm A',
    brand: null,
    color: null,
    size: null,
    branchId: 'b1',
    branchName: 'CN 1',
    receiverBranchId: null,
    receiverBranchName: null,
    locationId: 'loc-1',
    locationCode: 'A-01',
    locationName: 'Kho chính',
    inQty: 5,
    inUnitPrice: 100,
    inValue: 500,
    inSalePrice: null,
    outQty: 0,
    outUnitPrice: 0,
    outValue: 0,
    outSalePrice: null,
    customerName: 'NCC Alpha',
    notes: null,
    ...overrides,
  };
}

function build(rows: DocumentDetailRow[], total = rows.length) {
  const engine = {
    // Stands in for SQL: one page, plus the whole-set count and totals.
    list: jest.fn().mockImplementation(({ page = 1, pageSize = 20 }) => {
      const offset = (page - 1) * pageSize;
      const totals: Record<string, number> = {};
      for (const key of ['inQty', 'inValue', 'outQty', 'outValue'] as const) {
        totals[key] = rows.reduce((sum, r) => sum + Number(r[key] ?? 0), 0);
      }
      return Promise.resolve({
        data: rows.slice(offset, offset + pageSize),
        total,
        totals,
        nextCursor: null,
        hasMore: false,
      });
    }),
  };
  const branches = { find: jest.fn().mockResolvedValue([]) };
  return Object.assign(
    new DocumentDetailReport(engine as never, branches as never),
    { engine },
  ) as DocumentDetailReport & { engine: { list: jest.Mock } };
}

const dto: InventoryReportSearchDto = {
  reportType: 'inventory-document-detail',
  columns: [
    'date', 'documentType', 'warehouse', 'documentNumber', 'reference',
    'customer', 'branchCode', 'inQty', 'inUnitPrice', 'inValue', 'inSalePrice',
  ],
  filters: { period: { from: '2026-07-01', to: '2026-07-31' } },
};

describe('DocumentDetailReport', () => {
  it('exposes the full catalog with VI doc-kind bands', async () => {
    const cols = await build([]).buildColumns();
    expect(cols).toHaveLength(27);
    expect(cols.find((c) => c.col === 'inQty')!.group).toEqual({
      id: 'in',
      name: 'Nhập kho',
    });
    expect(cols.find((c) => c.col === 'date')!.pinned).toBe('left');
  });

  it('maps rows — VI doc labels, formatted date, null no-source columns', async () => {
    const result = await build([engineRow({})]).buildData(dto, actor);
    expect(result.rows).toEqual([
      {
        date: '03/07/2026',
        documentType: 'Phiếu nhập kho mua hàng',
        warehouse: 'Kho chính',
        documentNumber: 'PNK-26-0001',
        reference: 'ref-1',
        customer: 'NCC Alpha',
        branchCode: null,
        inQty: 5,
        inUnitPrice: 100,
        inValue: 500,
        inSalePrice: null,
      },
    ]);
  });

  it('sums totals but nulls non-additive unit prices', async () => {
    const rows = [engineRow({}), engineRow({ inQty: 3, inValue: 900, inUnitPrice: 300 })];
    const result = await build(rows).buildData(dto, actor);
    expect(result.totals!.inQty).toBe(8);
    expect(result.totals!.inValue).toBe(1400);
    expect(result.totals!.inUnitPrice).toBeNull();
    expect(result.totals!.documentNumber).toBeNull();
  });
});

/**
 * A fake engine that behaves like the keyset SQL: half-open window filter,
 * `(posted_at DESC, docKind:lineId DESC)` ordering, cursor continuation.
 */
function buildKeyset(rows: (DocumentDetailRow & { lineId: string })[]) {
  const calls: Record<string, unknown>[] = [];
  const engine = {
    list: jest.fn(async (q: any) => {
      calls.push(q);
      const key = (r: DocumentDetailRow & { lineId: string }) =>
        `${r.docKind}:${r.lineId}`;
      let ordered = [...rows].sort((a, b) => {
        const t = new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
        return t !== 0 ? t : key(b).localeCompare(key(a));
      });
      if (q.startDate) {
        ordered = ordered.filter((r) => new Date(r.postedAt) >= q.startDate);
      }
      if (q.endDate) {
        ordered = ordered.filter((r) => new Date(r.postedAt) < q.endDate);
      }
      if (q.cursor) {
        const at = new Date(q.cursor.at).getTime();
        ordered = ordered.filter((r) => {
          const t = new Date(r.postedAt).getTime();
          return t < at || (t === at && key(r) < q.cursor.id);
        });
      }
      const page = ordered.slice(0, q.pageSize);
      const last = page[page.length - 1];
      return {
        data: page,
        total: q.keyset ? 0 : ordered.length,
        nextCursor: last
          ? { at: new Date(last.postedAt).toISOString(), id: key(last) }
          : null,
        hasMore: page.length === q.pageSize,
      };
    }),
  };
  const branches = { find: jest.fn().mockResolvedValue([]) };
  return {
    report: new DocumentDetailReport(engine as never, branches as never),
    calls,
  };
}

const dated = (lineId: string, iso: string, documentNumber: string) =>
  ({
    ...engineRow({ postedAt: new Date(iso), documentNumber }),
    lineId,
  }) as DocumentDetailRow & { lineId: string };

describe('DocumentDetailReport.exportSource', () => {
  it('sums quantities and values but not unit prices', () => {
    const { report } = buildKeyset([]);
    const summable = report.exportSource.summable([
      'inQty',
      'inValue',
      'inUnitPrice',
      'documentNumber',
    ]);
    // Unit prices are per-line rates: adding them together means nothing.
    expect(summable).toEqual(['inQty', 'inValue']);
  });

  it('exports newest first, the same way the table reads', () => {
    const { report } = buildKeyset([]);
    expect(report.exportSource.order).toBe('desc');
  });

  it('walks pages by cursor without repeating or losing a line', async () => {
    // Two lines of the same document share a posted_at: the line id is the
    // only thing that can move the cursor past them.
    const rows = [
      dated('l1', '2026-07-10T10:00:00Z', 'PNK-1'),
      dated('l2', '2026-07-10T10:00:00Z', 'PNK-1'),
      dated('l3', '2026-07-09T10:00:00Z', 'PNK-2'),
      dated('l4', '2026-07-08T10:00:00Z', 'PNK-3'),
    ];
    const { report } = buildKeyset(rows);

    const seen: string[] = [];
    let cursor: any = null;
    let hasMore = true;
    let guard = 0;
    while (hasMore && guard++ < 10) {
      const page = await report.exportSource.page(dto, actor, {
        partition: {
          from: new Date('2026-07-01T00:00:00Z'),
          to: new Date('2026-08-01T00:00:00Z'),
        },
        cursor,
        size: 2,
      });
      seen.push(...page.rows.map((r) => r.documentNumber as string));
      cursor = page.nextCursor;
      hasMore = page.hasMore && cursor !== null;
    }

    expect(seen).toHaveLength(4);
    expect(seen).toEqual(['PNK-1', 'PNK-1', 'PNK-2', 'PNK-3']);
  });

  it('asks the engine for keyset mode and one page at a time', async () => {
    const { report, calls } = buildKeyset([dated('l1', '2026-07-10T10:00:00Z', 'PNK-1')]);

    await report.exportSource.page(dto, actor, {
      partition: {
        from: new Date('2026-07-05T00:00:00Z'),
        to: new Date('2026-07-12T00:00:00Z'),
      },
      cursor: null,
      size: 500,
    });

    expect(calls[0]).toMatchObject({
      keyset: true,
      pageSize: 500,
      startDate: new Date('2026-07-05T00:00:00Z'),
      endDate: new Date('2026-07-12T00:00:00Z'),
    });
  });

  it('keeps a window to its own lines', async () => {
    const { report } = buildKeyset([
      dated('l1', '2026-07-03T10:00:00Z', 'IN'),
      dated('l2', '2026-07-20T10:00:00Z', 'OUT'),
    ]);

    const page = await report.exportSource.page(dto, actor, {
      partition: {
        from: new Date('2026-07-01T00:00:00Z'),
        to: new Date('2026-07-10T00:00:00Z'),
      },
      cursor: null,
      size: 50,
    });

    expect(page.rows.map((r) => r.documentNumber)).toEqual(['IN']);
  });

  it('projects only the requested columns', async () => {
    const { report } = buildKeyset([dated('l1', '2026-07-10T10:00:00Z', 'PNK-1')]);

    const page = await report.exportSource.page(
      { ...dto, columns: ['documentNumber', 'inQty'] },
      actor,
      {
        partition: {
          from: new Date('2026-07-01T00:00:00Z'),
          to: new Date('2026-08-01T00:00:00Z'),
        },
        cursor: null,
        size: 50,
      },
    );

    expect(Object.keys(page.rows[0])).toEqual(['documentNumber', 'inQty']);
  });

  it('answers a page of an over-cap organisation instead of refusing (AC-22)', async () => {
    const report = build([engineRow({})], 74_515);

    const result = await report.buildData({ ...dto, page: 1, limit: 50 }, actor);

    expect(result.total).toBe(74_515);
    expect(result.rows).toHaveLength(1);
  });

  it('pushes page, limit and column filters down under their engine names', async () => {
    const report = build([engineRow({})]);

    await report.buildData(
      {
        ...dto,
        page: 2,
        limit: 50,
        columnFilters: [
          { col: 'name', contains: 'giày' },
          { col: 'reference', contains: 'PO-1' },
          { col: 'warehouse', contains: 'Kho' },
        ],
      },
      actor,
    );

    expect(report.engine.list).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 50,
        columnFilters: {
          itemName: { operator: '*', value: 'giày' },
          referenceNumber: { operator: '*', value: 'PO-1' },
          warehouse: { operator: '*', value: 'Kho' },
        },
      }),
    );
  });

  it('keeps no countRows, because the export streams by cursor (ADR-01)', () => {
    // ReportExportService only enforces the cap for definitions WITHOUT an
    // exportSource. This one streams, so the cap has nothing to protect and is
    // deliberately absent — not an oversight.
    const report = build([]);

    expect(report.exportSource).toBeDefined();
    expect((report as { countRows?: unknown }).countRows).toBeUndefined();
  });

  it('gives the keyset export the same predicate as the grid (AC-20)', async () => {
    // Two read paths, one filter. If the export built its own, the file would
    // quietly cover a different set than the table it was exported from.
    const report = build([engineRow({})]);
    const filters = [{ col: 'warehouse', contains: 'Kho' }];

    await report.buildData({ ...dto, columnFilters: filters }, actor);
    await report.exportSource!.page({ ...dto, columnFilters: filters }, actor, {
      partition: {},
      cursor: null,
      size: 500,
    } as never);

    const [[gridQuery], [exportQuery]] = report.engine.list.mock.calls;
    expect(exportQuery.columnFilters).toEqual(gridQuery.columnFilters);
    // And the export walks by cursor rather than by offset.
    expect(exportQuery.keyset).toBe(true);
  });

  it('no longer re-filters the exported page in memory', async () => {
    // SQL already applied the predicate. Filtering again after the cursor sized
    // the page could only shorten it, which confuses the walk.
    const report = build([engineRow({}), engineRow({ sku: 'SKU-2' })]);

    const page = await report.exportSource!.page(
      { ...dto, columnFilters: [{ col: 'name', contains: 'no-such-item' }] },
      actor,
      { partition: {}, cursor: null, size: 500 } as never,
    );

    expect(page.rows).toHaveLength(2);
  });
});
