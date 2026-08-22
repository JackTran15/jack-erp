import { EXPORT_ROW_LIMIT } from '../../../reporting/report-core/report-export.service';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { TempWarehouseIssueRow } from '../../services/temp-warehouse-report.service';
import { InventoryReportDefinition } from '../inventory-report-definition';
import { TempWarehouseOutReport } from './temp-warehouse-out.report';

const actor = { userId: 'u1', organizationId: 'org-1', roles: [] } as unknown as ActorContext;

const engineRow: TempWarehouseIssueRow = {
  sku: 'SKU-1',
  name: 'Item 1',
  unit: 'Đôi',
  location: 'SR-01',
  date: '03/07/2026',
  time: '09:15:00',
  staff: 'Nguyễn Văn A',
  outQty: 1,
  returnQty: 0,
  saleQty: 0,
  remainingQty: 4,
  status: 'Xuất không bán',
  invoice: '',
};

/**
 * Stands in for the SQL engine: answers with one page, plus the count and the
 * totals of the WHOLE filtered set — which is what the definition now relies on
 * instead of measuring an in-memory array.
 */
function build(rows: TempWarehouseIssueRow[], total = rows.length) {
  const engine = {
    list: jest.fn().mockImplementation(({ page = 1, pageSize = 20 }) => {
      const offset = (page - 1) * pageSize;
      const totals: Record<string, number> = {};
      for (const key of ['outQty', 'returnQty', 'saleQty', 'remainingQty']) {
        totals[key] = rows.reduce(
          (sum, r) => sum + Number(r[key as keyof TempWarehouseIssueRow] ?? 0),
          0,
        );
      }
      return Promise.resolve({
        data: rows.slice(offset, offset + pageSize),
        total,
        totals,
      });
    }),
  };
  const branches = { find: jest.fn().mockResolvedValue([]) };
  const report = new TempWarehouseOutReport(engine as never, branches as never);
  return Object.assign(report, { engine }) as TempWarehouseOutReport & {
    engine: { list: jest.Mock };
  };
}

const dto: InventoryReportSearchDto = {
  reportType: 'inventory-temp-warehouse-out',
  columns: ['sku', 'date', 'time', 'staff', 'outQty', 'returnQty', 'status', 'invoice'],
  filters: { period: { from: '2026-07-01', to: '2026-07-31' } },
};

describe('TempWarehouseOutReport', () => {
  it('exposes status as a select column with the engine status values', async () => {
    const cols = await build([]).buildColumns();
    const status = cols.find((c) => c.col === 'status')!;
    expect(status.filterKind).toBe('select');
    expect(status.filterOptions!.map((o) => o.value)).toEqual([
      'Xuất không bán',
      'Trả hàng trưng bày',
      'Bán hàng trưng bày',
      'Bán hàng kho tạm',
      'Chuyển kho xuất đi',
      'Chuyển kho trả lại',
    ]);
    expect(cols.find((c) => c.col === 'time')!.filterKind).toBe('time');
    expect(cols.find((c) => c.col === 'date')!.filterKind).toBe('date');
  });

  it('projects engine rows onto the requested columns', async () => {
    const rows = [engineRow, { ...engineRow, sku: 'SKU-2', returnQty: 1 }];
    const result = await build(rows).buildData(dto, actor);

    expect(result.total).toBe(2);
    expect(Object.keys(result.rows[0])).toEqual(dto.columns);
    expect(result.rows.map((r) => r.sku)).toEqual(['SKU-1', 'SKU-2']);
  });

  // The filter used to be applied in JS after the whole set was materialised.
  // It now has to reach SQL, or paging would filter only the page in view.
  it('pushes the column filter down to the engine', async () => {
    const report = build([engineRow]);

    await report.buildData(
      { ...dto, columnFilters: [{ col: 'status', equals: 'Xuất không bán' }] },
      actor,
    );

    expect(report.engine.list).toHaveBeenCalledWith(
      expect.objectContaining({
        columnFilters: { status: { operator: '=', value: 'Xuất không bán' } },
      }),
    );
  });

  it('pushes page and limit down instead of slicing in memory', async () => {
    const report = build([engineRow]);

    await report.buildData({ ...dto, page: 3, limit: 50 }, actor);

    expect(report.engine.list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3, pageSize: 50 }),
    );
  });

  it('takes total and totals from the engine, not from the page in hand', async () => {
    // The footer must describe the whole filtered set. Measuring the array the
    // engine returned would silently turn it into a per-page footer.
    const report = build([engineRow], 74_515);

    const result = await report.buildData(
      { ...dto, columns: [...dto.columns!, 'saleQty'], page: 1, limit: 1 },
      actor,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(74_515);
    expect(result.totals!.outQty).toBe(1);
  });

  // Export calls buildData with limit = EXPORT_ROW_LIMIT, the grid with a small
  // limit. Both must report the same total and the same footer — that is what
  // stops the Excel total row disagreeing with the grid footer.
  it('gives export and grid the same total and totals for the same filter', async () => {
    const rows = [
      engineRow,
      { ...engineRow, sku: 'SKU-2' },
      { ...engineRow, sku: 'SKU-3', status: 'Bán hàng kho tạm', invoice: 'INV-9' },
    ];
    const report = build(rows);
    const filtered = {
      ...dto,
      columnFilters: [{ col: 'status', equals: 'Xuất không bán' }],
    };

    const grid = await report.buildData({ ...filtered, page: 1, limit: 1 }, actor);
    const exported = await report.buildData(
      { ...filtered, page: 1, limit: EXPORT_ROW_LIMIT },
      actor,
    );

    expect(grid.rows).toHaveLength(1);
    expect(exported.rows).toHaveLength(3);
    expect(grid.total).toBe(exported.total);
    expect(grid.totals).toEqual(exported.totals);
    // Both asked the engine for the same predicate, which is the real assertion.
    const [[gridQuery], [exportQuery]] = report.engine.list.mock.calls;
    expect(gridQuery.columnFilters).toEqual(exportQuery.columnFilters);
  });

  // ── ADR-01: the row cap moved out of buildData and into countRows ──────────
  //
  // `ReportExportService.prepareExport` only enforces the cap for definitions
  // that expose `countRows()`. Before this change no inventory definition had
  // one, so the `assertUnderRowCap` call inside `buildData` was the only thing
  // standing between a 74k-row organisation and an export that materialises the
  // lot. Removing that call without adding this method would have quietly
  // unguarded the export path — hence the pair of tests below.
  describe('countRows', () => {
    it('reports the whole-set total without loading rows', async () => {
      const report = build([engineRow], 74_515);

      await expect(report.countRows(dto, actor)).resolves.toEqual({
        total: 74_515,
        subject: 'rows',
      });
      // pageSize 1: the count comes from the engine's own COUNT, not from
      // reading 74k rows and measuring the array.
      expect(report.engine.list).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 1 }),
      );
    });

    it('scopes the count exactly like buildData does', async () => {
      // Two callers, one scope builder — a count that described a different
      // period or branch set than the rows would be worse than no count.
      const report = build([engineRow]);
      await report.buildData(dto, actor);
      await report.countRows(dto, actor);

      const [[rowsQuery], [countQuery]] = report.engine.list.mock.calls;
      const { page: _p1, pageSize: _s1, ...rowsScope } = rowsQuery;
      const { page: _p2, pageSize: _s2, ...countScope } = countQuery;
      expect(countScope).toEqual(rowsScope);
    });

    it('satisfies the branch prepareExport gates the cap on', () => {
      // report-export.service.ts: `if (!definition.exportSource && definition.countRows)`.
      // report-export.service.spec.ts already proves that branch throws over the
      // cap before any byte is written; this asserts the definition enters it.
      // Typed as the contract, because that is what prepareExport sees.
      const report: InventoryReportDefinition = build([]);
      expect(report.exportSource).toBeUndefined();
      expect(typeof report.countRows).toBe('function');
    });

    it('lets buildData answer without tripping the row cap (AC-01)', async () => {
      // The grid asks for one page. It must get one page, not a 400, however
      // many rows the organisation has.
      const report = build([engineRow], 74_515);

      const result = await report.buildData({ ...dto, page: 1, limit: 50 }, actor);

      expect(result.total).toBeGreaterThan(0);
    });
  });
});
