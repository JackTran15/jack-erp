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

function build(rows: DocumentDetailRow[]) {
  const engine = {
    list: jest.fn().mockResolvedValue({ data: rows, total: rows.length }),
  };
  const branches = { find: jest.fn().mockResolvedValue([]) };
  return new DocumentDetailReport(engine as never, branches as never);
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
});
