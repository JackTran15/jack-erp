import { BadRequestException } from '@nestjs/common';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InventoryReportSearchDto } from '../../dto/inventory-report-search.dto';
import { StockPeriodRow } from '../../services/stock-period.service';
import { StockSummaryReport } from './stock-summary.report';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchIds: ['branch-1'],
  roles: [],
} as unknown as ActorContext;

function periodRow(overrides: Partial<StockPeriodRow>): StockPeriodRow {
  return {
    itemId: 'item-1',
    sku: 'SKU-1',
    itemName: 'Item 1',
    parentSku: null,
    parentName: null,
    unit: 'Cái',
    categoryId: 'cat-1',
    categoryName: 'Nhóm A',
    brand: 'Lasta',
    color: 'Nâu',
    size: '39',
    locationId: 'loc-1',
    locationCode: 'A-01',
    locationName: 'Kệ A1',
    branchId: 'branch-1',
    branchCode: null,
    branchName: 'CN 1',
    openingQty: 10,
    openingValue: 1000,
    inQty: 5,
    inValue: 500,
    outQty: 3,
    outValue: 300,
    closingQty: 12,
    closingValue: 1200,
    transferOutQty: 1,
    transferOutValue: 100,
    incomingQty: 2,
    incomingValue: 200,
    ...overrides,
  };
}

const TOTAL_KEYS = [
  'openingQty', 'openingValue', 'inQty', 'inValue', 'outQty', 'outValue',
  'closingQty', 'closingValue',
] as const;

function build(rows: StockPeriodRow[], total = rows.length) {
  const stockPeriod = {
    // Stands in for the SQL engine: one page of rows, plus the count and the
    // totals of the WHOLE filtered set — the contract buildData now leans on.
    aggregate: jest.fn().mockImplementation(({ page = 1, pageSize = 20 }) => {
      const offset = (page - 1) * pageSize;
      const totals: Record<string, number> = {};
      for (const key of TOTAL_KEYS) {
        totals[key] = rows.reduce((sum, r) => sum + Number(r[key] ?? 0), 0);
      }
      return Promise.resolve({
        data: rows.slice(offset, offset + pageSize),
        total,
        totals,
      });
    }),
  };
  const branches = { find: jest.fn().mockResolvedValue([]) };
  const locations = { find: jest.fn().mockResolvedValue([]) };
  const report = new StockSummaryReport(
    stockPeriod as never,
    branches as never,
    locations as never,
  );
  return { report, stockPeriod, branches, locations };
}

const baseDto: InventoryReportSearchDto = {
  reportType: 'inventory-stock-summary',
  columns: ['sku', 'name', 'inQty', 'endingQty', 'endingValue', 'supplier'],
  filters: { period: { from: '2026-07-01', to: '2026-07-31' } },
};

describe('StockSummaryReport', () => {
  it('builds the full catalog with VI labels, bands and metadata', async () => {
    const { report } = build([]);
    const cols = await report.buildColumns();

    expect(cols.map((c) => c.col)).toEqual([
      'name', 'parentSku', 'parentName', 'color', 'size', 'unit', 'group',
      'brand', 'sku', 'positionCode', 'positionName',
      'openingQty', 'openingValue', 'inQty', 'inValue', 'outQty', 'outValue',
      'endingQty', 'endingValue', 'transferOutQty', 'transferOutValue',
      'incomingQty', 'incomingValue', 'supplier',
    ]);
    const name = cols.find((c) => c.col === 'name')!;
    expect(name.name).toBe('Tên hàng hóa');
    expect(name.pinned).toBe('left');
    const inQty = cols.find((c) => c.col === 'inQty')!;
    expect(inQty.name).toBe('Số lượng');
    expect(inQty.group).toEqual({ id: 'in', name: 'Nhập trong kỳ' });
    expect(inQty.align).toBe('right');
    expect(inQty.filterKind).toBe('number');
    expect(cols.find((c) => c.col === 'supplier')!.filterKind).toBe('text');
  });

  it('maps engine rows through — including brand/color/size, closing→ending and supplier', async () => {
    const { report } = build([periodRow({ supplier: 'NCC Alpha' })]);
    const result = await report.buildData(
      {
        ...baseDto,
        columns: ['sku', 'color', 'size', 'brand', 'endingQty', 'endingValue', 'transferOutQty', 'incomingQty', 'supplier'],
      },
      actor,
    );
    expect(result.rows).toEqual([
      {
        sku: 'SKU-1',
        color: 'Nâu',
        size: '39',
        brand: 'Lasta',
        endingQty: 12,
        endingValue: 1200,
        transferOutQty: 1,
        incomingQty: 2,
        supplier: 'NCC Alpha',
      },
    ]);
  });

  it('takes totals and total from the engine, not from the page in hand', async () => {
    // The footer has to describe the whole filtered set. Summing the rows the
    // engine returned would quietly turn it into a per-page footer.
    const rows = [1, 2, 3].map((n) =>
      periodRow({ itemId: `item-${n}`, sku: `SKU-${n}`, inQty: n }),
    );
    const { report } = build(rows);

    const result = await report.buildData({ ...baseDto, page: 1, limit: 1 }, actor);

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(3);
    expect(result.totals!.inQty).toBe(6);
    expect(result.totals!.sku).toBeNull();
    expect(result.totals!.supplier).toBeNull();
  });

  it('maps endingQty onto the engine closingQty total (ADR-03)', async () => {
    const { report } = build([periodRow({ closingQty: 12, closingValue: 1200 })]);

    const result = await report.buildData(baseDto, actor);

    expect(result.totals!.endingQty).toBe(12);
    expect(result.totals!.endingValue).toBe(1200);
  });

  // The reported failure. The grid asks for one page of a 74,515-row
  // organisation; it used to get "Report exceeds 50000 rows (74515)".
  it('answers a page of an over-cap organisation instead of refusing (AC-01)', async () => {
    const { report } = build([periodRow({})], 74_515);

    const result = await report.buildData({ ...baseDto, page: 1, limit: 50 }, actor);

    expect(result.total).toBe(74_515);
    expect(result.rows).toHaveLength(1);
  });

  it('pushes page and limit down instead of slicing in memory', async () => {
    const { report, stockPeriod } = build([periodRow({})]);

    await report.buildData({ ...baseDto, page: 4, limit: 50 }, actor);

    expect(stockPeriod.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ page: 4, pageSize: 50 }),
    );
  });

  it('pushes column filters down under their engine names', async () => {
    const { report, stockPeriod } = build([periodRow({})]);

    await report.buildData(
      {
        ...baseDto,
        columnFilters: [
          { col: 'name', contains: 'giày' },
          { col: 'endingQty', gte: 25 },
          { col: 'group', equals: 'Nhóm A' },
          { col: 'positionCode', startsWith: 'A1' },
        ],
      },
      actor,
    );

    expect(stockPeriod.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        columnFilters: {
          itemName: { operator: '*', value: 'giày' },
          closingQty: { operator: '>=', value: 25 },
          categoryName: { operator: '=', value: 'Nhóm A' },
          locationCode: { operator: '+', value: 'A1' },
        },
      }),
    );
  });

  it('pushes the unit and brand dropdowns down too (A-11)', async () => {
    // Left in JS these would filter only the page in view — a wrong answer that
    // looks right, which is worse than the 400 being removed here.
    const { report, stockPeriod } = build([periodRow({})]);

    await report.buildData(
      { ...baseDto, filters: { ...baseDto.filters, unit: 'Đôi', brand: 'Lasta' } },
      actor,
    );

    expect(stockPeriod.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        columnFilters: {
          unit: { operator: '=', value: 'Đôi' },
          brand: { operator: '=', value: 'Lasta' },
        },
      }),
    );
  });

  it('AND-s the unit dropdown with a unit column filter', async () => {
    const { report, stockPeriod } = build([periodRow({})]);

    await report.buildData(
      {
        ...baseDto,
        filters: { ...baseDto.filters, unit: 'Đôi' },
        columnFilters: [{ col: 'unit', contains: 'ô' }],
      },
      actor,
    );

    expect(stockPeriod.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        columnFilters: {
          unit: [
            { operator: '*', value: 'ô' },
            { operator: '=', value: 'Đôi' },
          ],
        },
      }),
    );
  });

  // UOW-03 gave these SQL expressions of their own, so every column in the
  // catalog now filters under SQL and none of them answer 400 any more.
  it.each(['supplier', 'transferOutQty', 'incomingQty', 'incomingValue'])(
    'pushes the %s filter down to the engine',
    async (col) => {
      const { report, stockPeriod } = build([periodRow({})]);

      await report.buildData({ ...baseDto, columnFilters: [{ col, gte: 1 }] }, actor);

      const [[query]] = stockPeriod.aggregate.mock.calls;
      expect(query.columnFilters[col]).toEqual({ operator: '>=', value: 1 });
    },
  );

  it('has an engine name for every column it advertises', async () => {
    // A column the grid offers a filter box for but the engine cannot resolve
    // is a 400 the user only discovers by typing into it.
    const { report, stockPeriod } = build([periodRow({})]);
    const cols = await report.buildColumns();

    await report.buildData(
      { ...baseDto, columnFilters: cols.map((c) => ({ col: c.col, contains: 'x' })) },
      actor,
    );

    const [[query]] = stockPeriod.aggregate.mock.calls;
    expect(Object.keys(query.columnFilters)).toHaveLength(cols.length);
  });

  it('scopes countRows exactly like buildData (ADR-01)', async () => {
    const { report, stockPeriod } = build([periodRow({})], 74_515);

    await report.buildData(baseDto, actor);
    await expect(report.countRows(baseDto, actor)).resolves.toEqual({
      total: 74_515,
      subject: 'rows',
    });

    const [[rowsQuery], [countQuery]] = stockPeriod.aggregate.mock.calls;
    const { page: _p1, pageSize: _s1, ...rowsScope } = rowsQuery;
    const { page: _p2, pageSize: _s2, ...countScope } = countQuery;
    expect(countScope).toEqual(rowsScope);
  });

  it('rejects unknown columns', async () => {
    const { report } = build([]);
    await expect(
      report.buildData({ ...baseDto, columns: ['sku', 'nope'] }, actor),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects store ids outside the actor branch permissions (403)', async () => {
    const { report } = build([periodRow({})]);
    await expect(
      report.buildData(
        {
          ...baseDto,
          filters: {
            period: { from: '2026-07-01', to: '2026-07-31' },
            store: { scope: 'group', storeIds: ['branch-1', 'branch-foreign'] },
          },
        },
        actor,
      ),
    ).rejects.toThrow('Access denied for stores: branch-foreign');
  });

  it('clamps an absent/all store scope to the permitted branches', async () => {
    const { report, stockPeriod } = build([periodRow({})]);
    await report.buildData(baseDto, actor);
    expect(stockPeriod.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ branchIds: ['branch-1'] }),
    );
  });

  // The supplier used to arrive from a second query issued after the rows came
  // back, which is why it could be neither filtered nor paged on. It rides on
  // the row now, and that extra round trip is gone.
  it('reads the supplier off the engine row', async () => {
    const { report } = build([periodRow({ supplier: 'NCC Alpha' })]);

    const result = await report.buildData(
      { ...baseDto, columns: ['sku', 'supplier'] },
      actor,
    );

    expect(result.rows).toEqual([{ sku: 'SKU-1', supplier: 'NCC Alpha' }]);
  });

  it('renders an item with no primary provider as a null supplier', async () => {
    const { report } = build([periodRow({ supplier: null })]);

    const result = await report.buildData(
      { ...baseDto, columns: ['sku', 'supplier'] },
      actor,
    );

    expect(result.rows[0].supplier).toBeNull();
  });

  it('pushes a supplier filter down instead of refusing it', async () => {
    const { report, stockPeriod } = build([periodRow({})]);

    await report.buildData(
      { ...baseDto, columnFilters: [{ col: 'supplier', contains: 'Bitis' }] },
      actor,
    );

    expect(stockPeriod.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        columnFilters: { supplier: { operator: '*', value: 'Bitis' } },
      }),
    );
  });
});
