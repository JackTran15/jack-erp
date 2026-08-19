import { ReportGroupBy } from '@erp/shared-interfaces';
import { ProfitByItemReport } from './profit-by-item.report';

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
  lineDiscount: 0,
  lineTotal: 2000,
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
  /** Rows the highest-stock fallback query returns. */
  stockBalanceRaw?: any[];
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
    getRawMany: jest.fn(async () => opts.stockBalanceRaw ?? []),
  };
  const repo = (rows?: any[]) => ({ find: jest.fn(async () => rows ?? []) });
  return new ProfitByItemReport(
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
    { hasPermission: jest.fn(async () => false) } as any,
  );
}

const dto = (over: Record<string, any> = {}) => ({
  reportType: 'profit-by-item',
  columns: ['skuCode', 'location'],
  filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
  ...over,
});

const warehouseFixtures = {
  invoices: [inv()],
  lines: [line()],
  items: [{ id: 'it1', categoryId: 'cat1' }],
  categories: [{ id: 'cat1', name: 'Shoes' }],
  storages: [{ id: 'wh1', branchId: 'b1', isMainStorage: false, isActive: true }],
};

// "Vị trí" here goes through the same resolver as "Doanh thu theo mặt hàng" and
// "Chi tiết doanh thu theo hóa đơn và mặt hàng", so all three agree on the shelf
// they report for a given item.
describe('ProfitByItemReport — Vị trí', () => {
  it('resolves the preferred shelf in the acting branch warehouse', async () => {
    const report = makeReport({
      ...warehouseFixtures,
      itemStorageLocations: [{ itemId: 'it1', storageId: 'wh1', locationId: 'loc1' }],
      locations: [{ id: 'loc1', code: 'A-01', name: 'Aisle A', isActive: true }],
    });
    const res = await report.buildData(dto() as any, actor);
    expect(res.rows[0]).toMatchObject({ location: 'A-01' });
  });

  it('falls back to the highest-stock shelf when the preferred one is "Ngừng theo dõi"', async () => {
    const report = makeReport({
      ...warehouseFixtures,
      itemStorageLocations: [{ itemId: 'it1', storageId: 'wh1', locationId: 'loc1' }],
      locations: [
        { id: 'loc1', code: 'A-01', name: 'Aisle A', isActive: true },
        { id: 'loc2', code: 'B-02', name: 'Aisle B', isActive: true },
      ],
      stockBalances: [{ itemId: 'it1', locationId: 'loc1', isTracked: false }],
      stockBalanceRaw: [{ itemId: 'it1', locationId: 'loc2' }],
    });
    const res = await report.buildData(dto() as any, actor);
    expect(res.rows[0]).toMatchObject({ location: 'B-02' });
  });

  it('leaves the location empty when the branch has no warehouse', async () => {
    const report = makeReport({
      ...warehouseFixtures,
      storages: [{ id: 'sr1', branchId: 'b1', isMainStorage: true, isActive: true }],
    });
    const res = await report.buildData(dto() as any, actor);
    expect(res.rows[0]).toMatchObject({ location: null });
  });

  it('does not query warehouse locations at parent grain', async () => {
    const itemStorageLocationsFind = jest.fn(async () => []);
    const report = makeReport(warehouseFixtures);
    (report as any).itemStorageLocations = { find: itemStorageLocationsFind };
    await report.buildData(
      dto({
        columns: ['itemName', 'location'],
        filters: { issuedAt: { from: '2026-06-01' }, statBy: ReportGroupBy.PARENT },
      }) as any,
      actor,
    );
    expect(itemStorageLocationsFind).not.toHaveBeenCalled();
  });
});
