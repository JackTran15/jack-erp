import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { StockPeriodRow } from '../../services/stock-period.service';
import { StockSummaryByStoreReport } from './stock-summary-by-store.report';

const actor = { userId: 'u1', organizationId: 'org-1', roles: [] } as unknown as ActorContext;

const engineRow: StockPeriodRow = {
  itemId: 'item-1',
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
  branchCode: null,
  branchName: 'CN Cần Thơ',
  openingQty: 10,
  openingValue: 1000,
  inQty: 5,
  inValue: 500,
  outQty: 3,
  outValue: 300,
  closingQty: 12,
  closingValue: 1200,
  transferOutQty: 0,
  transferOutValue: 0,
  incomingQty: 0,
  incomingValue: 0,
};

function build(rows: StockPeriodRow[], total = rows.length) {
  const engine = {
    // Stands in for SQL: one page, plus the whole-set count and totals.
    aggregate: jest.fn().mockImplementation(({ page = 1, pageSize = 20 }) => {
      const offset = (page - 1) * pageSize;
      const totals: Record<string, number> = {};
      for (const key of ['openingQty', 'openingValue', 'inQty', 'inValue',
        'outQty', 'outValue', 'closingQty', 'closingValue'] as const) {
        totals[key] = rows.reduce((sum, r) => sum + Number(r[key] ?? 0), 0);
      }
      return Promise.resolve({ data: rows.slice(offset, offset + pageSize), total, totals });
    }),
  };
  const branches = { find: jest.fn().mockResolvedValue([]) };
  return {
    report: new StockSummaryByStoreReport(engine as never, branches as never),
    engine,
  };
}

const dto: InventoryReportSearchDto = {
  reportType: 'inventory-stock-summary-by-store',
  columns: ['sku', 'branchCode', 'branch', 'openingQty', 'endingQty', 'endingValue'],
  filters: { period: { from: '2026-07-01', to: '2026-07-31' } },
};

describe('StockSummaryByStoreReport', () => {
  it('aggregates per branch and maps branch identity', async () => {
    const { report, engine } = build([engineRow]);
    const result = await report.buildData(dto, actor);
    expect(engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ groupBy: 'item_branch' }),
    );
    expect(result.rows[0]).toEqual({
      sku: 'SKU-1',
      branchCode: null,
      branch: 'CN Cần Thơ',
      openingQty: 10,
      endingQty: 12,
      endingValue: 1200,
    });
  });

  it('exposes opening/in/out/ending bands in the catalog', async () => {
    const { report } = build([]);
    const cols = await report.buildColumns();
    expect(cols.find((c) => c.col === 'openingQty')!.group).toEqual({
      id: 'opening',
      name: 'Tồn đầu kỳ',
    });
    expect(cols.find((c) => c.col === 'endingValue')!.group).toEqual({
      id: 'ending',
      name: 'Tồn cuối kỳ',
    });
  });

  it('answers a page of an over-cap organisation instead of refusing (AC-22)', async () => {
    const { report } = build([engineRow], 74_515);

    const result = await report.buildData({ ...dto, page: 1, limit: 50 }, actor);

    expect(result.total).toBe(74_515);
    expect(result.rows).toHaveLength(1);
  });

  it('pushes the branch column filter down under its engine name', async () => {
    const { report, engine } = build([engineRow]);

    await report.buildData(
      { ...dto, columnFilters: [{ col: 'branch', equals: 'CN Cần Thơ' }] },
      actor,
    );

    expect(engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        columnFilters: { branchName: { operator: '=', value: 'CN Cần Thơ' } },
      }),
    );
  });

  it('pushes page, limit and the unit/brand dropdowns down', async () => {
    const { report, engine } = build([engineRow]);

    await report.buildData(
      { ...dto, page: 3, limit: 50, filters: { ...dto.filters, unit: 'Cái' } },
      actor,
    );

    expect(engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 3,
        pageSize: 50,
        columnFilters: { unit: { operator: '=', value: 'Cái' } },
      }),
    );
  });

  it('takes totals from the engine and maps endingQty onto closingQty', async () => {
    const { report } = build([engineRow]);

    const result = await report.buildData(
      { ...dto, columns: ['sku', 'endingQty', 'endingValue'] },
      actor,
    );

    expect(result.totals!.endingQty).toBe(12);
    expect(result.totals!.endingValue).toBe(1200);
  });

  it('offers countRows so the export path keeps its cap (ADR-01)', async () => {
    const { report, engine } = build([engineRow], 74_515);

    await expect(report.countRows(dto, actor)).resolves.toEqual({
      total: 74_515,
      subject: 'rows',
    });
    expect(engine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 1 }),
    );
  });
});
