import { BadRequestException } from '@nestjs/common';
import { ReportGroupBy } from '@erp/shared-interfaces';
import { RevenueByItemReport } from './revenue-by-item.report';

const ORG = 'org-1';
const actor = { userId: 'u1', organizationId: ORG, branchId: 'b1', roles: [] } as any;

const inv = (over: Record<string, any> = {}) => ({
  id: 'i1',
  issuedAt: new Date('2026-06-03T08:30:00Z'),
  code: 'HD000001',
  status: 'paid',
  branchId: 'b1',
  ...over,
});

const line = (over: Record<string, any> = {}) => ({
  invoiceId: 'i1',
  itemId: 'it1',
  itemCode: 'SKU001',
  itemName: 'Item One',
  unit: 'pcs',
  quantity: 2,
  unitPrice: 1000,
  lineDiscount: 100,
  lineTotal: 1900,
  ...over,
});

function makeReport(opts: {
  invoices?: any[];
  lines?: any[];
  items?: any[];
  categories?: any[];
  products?: any[];
  storages?: any[];
  locations?: any[];
  itemStorageLocations?: any[];
  stockBalances?: any[];
  hasConsolidated?: boolean;
}) {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    getMany: jest.fn(async () => opts.invoices ?? []),
  };
  const stockBalanceQb: any = {
    innerJoin: jest.fn(() => stockBalanceQb),
    where: jest.fn(() => stockBalanceQb),
    andWhere: jest.fn(() => stockBalanceQb),
    orderBy: jest.fn(() => stockBalanceQb),
    select: jest.fn(() => stockBalanceQb),
    addSelect: jest.fn(() => stockBalanceQb),
    getRawMany: jest.fn(async () => []),
  };
  const repo = (rows?: any[]) => ({ find: jest.fn(async () => rows ?? []) });
  return new RevenueByItemReport(
    { createQueryBuilder: jest.fn(() => qb) } as any,
    repo(opts.lines) as any,
    repo(opts.items) as any,
    repo(opts.categories) as any,
    repo(opts.products) as any,
    repo(opts.storages) as any,
    repo(opts.locations) as any,
    repo(opts.itemStorageLocations) as any,
    {
      ...repo(opts.stockBalances),
      createQueryBuilder: jest.fn(() => stockBalanceQb),
    } as any,
    { hasPermission: jest.fn(async () => opts.hasConsolidated ?? false) } as any,
  );
}

const baseDto = (over: Record<string, any> = {}) => ({
  reportType: 'revenue-by-item',
  columns: ['sku', 'quantity', 'revenue.total'],
  filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
  ...over,
});

const MISA_COLUMN_ORDER = [
  'sku',
  'itemName',
  'unit',
  'locationCode',
  'locationName',
  'quantity',
  'unitPrice',
  'revenue.goods',
  'revenue.discount',
  'revenue.promoPoints',
  'revenue.promoRate',
  'revenue.total',
  'itemCategory',
  'brand',
];

describe('RevenueByItemReport.buildColumns', () => {
  it('bands the revenue measures under Doanh thu', async () => {
    const report = makeReport({});
    const headers = await report.buildColumns(actor);
    const byCol = new Map(headers.map((h) => [h.col, h.group]));
    for (const col of [
      'revenue.goods',
      'revenue.discount',
      'revenue.promoPoints',
      'revenue.promoRate',
      'revenue.total',
    ]) {
      expect(byCol.get(col)).toEqual({ id: 'revenue', name: 'Doanh thu' });
    }
    for (const col of [
      'sku',
      'itemName',
      'unit',
      'locationCode',
      'locationName',
      'quantity',
      'unitPrice',
      'itemCategory',
      'brand',
    ]) {
      expect(byCol.get(col)).toBeNull();
    }
  });

  it('returns exactly the 14 MISA columns, in MISA order', async () => {
    const report = makeReport({});
    const headers = await report.buildColumns(actor);
    expect(headers.map((h) => h.col)).toEqual(MISA_COLUMN_ORDER);
  });

  it('overrides quantity/unitPrice/revenue.total labels for this report only', async () => {
    const report = makeReport({});
    const headers = await report.buildColumns(actor);
    const byCol = new Map(headers.map((h) => [h.col, h.name]));
    expect(byCol.get('quantity')).toBe('Số lượng bán');
    expect(byCol.get('unitPrice')).toBe('Đơn giá TB');
    expect(byCol.get('revenue.total')).toBe('Doanh thu');
  });

  it('carries a formula desc on the 7 measure columns, null on the 7 dimension columns', async () => {
    const report = makeReport({});
    const headers = await report.buildColumns(actor);
    const byCol = new Map(headers.map((h) => [h.col, h.desc]));
    expect(byCol.get('quantity')).toBe('(1)');
    expect(byCol.get('unitPrice')).toBe('(2)=(3)/(1)');
    expect(byCol.get('revenue.goods')).toBe('(3)');
    expect(byCol.get('revenue.discount')).toBe('(4)');
    expect(byCol.get('revenue.promoPoints')).toBe('(9)');
    expect(byCol.get('revenue.promoRate')).toBe('(5)=((4)+(9))/(3)');
    expect(byCol.get('revenue.total')).toBe('(6)=(3)-(4)-(9)');
    for (const col of ['sku', 'itemName', 'unit', 'locationCode', 'locationName', 'itemCategory', 'brand']) {
      expect(byCol.get(col)).toBeNull();
    }
  });

  it.each([
    ['parent grain', { statBy: ReportGroupBy.PARENT }],
    ['group grain', { statBy: ReportGroupBy.GROUP }],
    ['multi-store scope', { statBy: ReportGroupBy.ITEM, store: { scope: 'all' as const, storeIds: [] } }],
  ])('keeps locationCode/locationName in the catalog at %s (ADR-03)', async (_label, filters) => {
    const report = makeReport({ hasConsolidated: true });
    const headers = await report.buildColumns(actor, filters as any);
    expect(headers.map((h) => h.col)).toEqual(MISA_COLUMN_ORDER);
    expect(headers[3].col).toBe('locationCode');
    expect(headers[4].col).toBe('locationName');
  });
});

describe('RevenueByItemReport.buildData', () => {
  it('400 when filters.issuedAt.from is missing', async () => {
    const report = makeReport({});
    await expect(
      report.buildData(baseDto({ filters: { issuedAt: {} } }) as any, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400 on an unknown column key', async () => {
    const report = makeReport({});
    await expect(
      report.buildData(baseDto({ columns: ['bogus'] }) as any, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aggregates one row per item with summed measures', async () => {
    const report = makeReport({
      invoices: [inv()],
      lines: [line(), line({ quantity: 3, lineDiscount: 0, lineTotal: 3000 })],
      items: [{ id: 'it1', categoryId: 'cat1', brand: 'Nike' }],
      categories: [{ id: 'cat1', name: 'Shoes' }],
    });
    const res = await report.buildData(baseDto() as any, actor);
    expect(res.total).toBe(1);
    const byCol = res.rows[0];
    expect(byCol).toMatchObject({ sku: 'SKU001', quantity: 5, 'revenue.total': 4900 });
    const totals = res.totals ?? {};
    expect(totals['quantity']).toBe(5);
  });

  it('groups by category when statBy=group', async () => {
    const report = makeReport({
      invoices: [inv()],
      lines: [line()],
      items: [{ id: 'it1', categoryId: 'cat1', brand: 'Nike' }],
      categories: [{ id: 'cat1', name: 'Shoes' }],
    });
    const res = await report.buildData(
      baseDto({
        columns: ['itemName', 'revenue.total'],
        filters: { issuedAt: { from: '2026-06-01' }, statBy: ReportGroupBy.GROUP },
      }) as any,
      actor,
    );
    expect(res.total).toBe(1);
    expect(res.rows[0].itemName).toBe('Shoes');
  });

  it('resolves locationCode/locationName from the item\'s warehouse (non-showroom) location', async () => {
    const report = makeReport({
      invoices: [inv()],
      lines: [line()],
      items: [{ id: 'it1', categoryId: 'cat1', brand: 'Nike' }],
      categories: [{ id: 'cat1', name: 'Shoes' }],
      storages: [{ id: 'wh1', branchId: 'b1', isMainStorage: false, isActive: true }],
      itemStorageLocations: [{ itemId: 'it1', storageId: 'wh1', locationId: 'loc1' }],
      locations: [{ id: 'loc1', code: 'A-01', name: 'Aisle A' }],
    });
    const res = await report.buildData(
      baseDto({ columns: ['sku', 'locationCode', 'locationName'] }) as any,
      actor,
    );
    expect(res.rows[0]).toMatchObject({ locationCode: 'A-01', locationName: 'Aisle A' });
  });

  it('leaves locationCode/locationName null when statBy is not item', async () => {
    const report = makeReport({
      invoices: [inv()],
      lines: [line()],
      items: [{ id: 'it1', categoryId: 'cat1', brand: 'Nike' }],
      categories: [{ id: 'cat1', name: 'Shoes' }],
      storages: [{ id: 'wh1', branchId: 'b1', isMainStorage: false, isActive: true }],
      itemStorageLocations: [{ itemId: 'it1', storageId: 'wh1', locationId: 'loc1' }],
      locations: [{ id: 'loc1', code: 'A-01', name: 'Aisle A' }],
    });
    const res = await report.buildData(
      baseDto({
        columns: ['itemName', 'locationCode', 'locationName'],
        filters: { issuedAt: { from: '2026-06-01' }, statBy: ReportGroupBy.GROUP },
      }) as any,
      actor,
    );
    expect(res.rows[0]).toMatchObject({ locationCode: null, locationName: null });
  });

  // ADR-03: the location columns stay in the catalog at every grain, but the
  // grain='parent' path must not start querying warehouse locations just
  // because the columns are in the request — dimensionOf('parent') already
  // nulls them, so loadItemLocations has no work to do at this grain.
  it('does not query item locations at parent grain even when locationCode/locationName are requested', async () => {
    const itemStorageLocationsFind = jest.fn(async () => []);
    const stockBalanceQb: any = {
      innerJoin: jest.fn(() => stockBalanceQb),
      where: jest.fn(() => stockBalanceQb),
      andWhere: jest.fn(() => stockBalanceQb),
      orderBy: jest.fn(() => stockBalanceQb),
      select: jest.fn(() => stockBalanceQb),
      addSelect: jest.fn(() => stockBalanceQb),
      getRawMany: jest.fn(async () => []),
    };
    const qb: any = {
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      getMany: jest.fn(async () => [inv()]),
    };
    const repo = (rows?: any[]) => ({ find: jest.fn(async () => rows ?? []) });
    const report = new RevenueByItemReport(
      { createQueryBuilder: jest.fn(() => qb) } as any,
      repo([line()]) as any,
      repo([{ id: 'it1', categoryId: 'cat1', brand: 'Nike' }]) as any,
      repo([{ id: 'cat1', name: 'Shoes' }]) as any,
      repo([]) as any,
      repo([{ id: 'wh1', branchId: 'b1', isMainStorage: false, isActive: true }]) as any,
      repo([]) as any,
      { find: itemStorageLocationsFind } as any,
      { ...repo([]), createQueryBuilder: jest.fn(() => stockBalanceQb) } as any,
      { hasPermission: jest.fn(async () => false) } as any,
    );

    await report.buildData(
      baseDto({
        columns: ['itemName', 'locationCode', 'locationName'],
        filters: { issuedAt: { from: '2026-06-01' }, statBy: ReportGroupBy.PARENT },
      }) as any,
      actor,
    );

    expect(itemStorageLocationsFind).not.toHaveBeenCalled();
    expect(stockBalanceQb.getRawMany).not.toHaveBeenCalled();
  });

  it('filters by brand pre-aggregate', async () => {
    const report = makeReport({
      invoices: [inv()],
      lines: [line()],
      items: [{ id: 'it1', categoryId: 'cat1', brand: 'Nike' }],
      categories: [{ id: 'cat1', name: 'Shoes' }],
    });
    const res = await report.buildData(
      baseDto({
        filters: { issuedAt: { from: '2026-06-01' }, brand: 'Adidas' },
      }) as any,
      actor,
    );
    expect(res.total).toBe(0);
    expect(res.totals).toBeNull();
  });
});
