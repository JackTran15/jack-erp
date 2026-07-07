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

function build(rows: StockPeriodRow[], providers: unknown[] = []) {
  const stockPeriod = {
    aggregate: jest.fn().mockResolvedValue({ data: rows, total: rows.length }),
  };
  const branches = { find: jest.fn().mockResolvedValue([]) };
  const locations = { find: jest.fn().mockResolvedValue([]) };
  const itemProviders = { find: jest.fn().mockResolvedValue(providers) };
  const report = new StockSummaryReport(
    stockPeriod as never,
    branches as never,
    locations as never,
    itemProviders as never,
  );
  return { report, stockPeriod, branches, locations, itemProviders };
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
    const { report } = build(
      [periodRow({})],
      [{ itemId: 'item-1', provider: { name: 'NCC Alpha' } }],
    );
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

  it('computes totals over ALL filtered rows, not the page', async () => {
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

  it('applies in-memory unit/brand filters and per-column filters', async () => {
    const rows = [
      periodRow({ itemId: 'i1', sku: 'S1', unit: 'Cái', inQty: 10 }),
      periodRow({ itemId: 'i2', sku: 'S2', unit: 'Đôi', inQty: 20 }),
      periodRow({ itemId: 'i3', sku: 'S3', unit: 'Đôi', inQty: 30 }),
    ];
    const { report } = build(rows);
    const result = await report.buildData(
      {
        ...baseDto,
        filters: { ...baseDto.filters, unit: 'Đôi' },
        columnFilters: [{ col: 'inQty', gte: 25 }],
      },
      actor,
    );
    expect(result.total).toBe(1);
    expect(result.rows[0].sku).toBe('S3');
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

  it('skips supplier enrichment for grouped grains', async () => {
    const { report, itemProviders } = build([periodRow({})]);
    await report.buildData(
      {
        ...baseDto,
        filters: { period: { from: '2026-07-01', to: '2026-07-31' }, statBy: 'group' },
      },
      actor,
    );
    expect(itemProviders.find).not.toHaveBeenCalled();
  });
});
