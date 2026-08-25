import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InvoiceItemRevenueDetailReport } from './invoice-item-revenue-detail.report';
import { ItemDirection } from '../../../pos/entities/invoice-item.entity';

const ORG = 'org-1';
const actor = { userId: 'u1', organizationId: ORG, branchId: 'b1', roles: [] } as any;

const inv = (over: Record<string, any> = {}) => ({
  id: 'i1',
  issuedAt: new Date('2026-06-03T08:30:00Z'),
  code: 'HD000001',
  status: 'paid',
  note: 'inv note',
  customerId: 'c1',
  staffId: 'staff1',
  salespersonId: 'emp1',
  branchId: 'b1',
  ...over,
});

const line = (over: Record<string, any> = {}) => ({
  invoiceId: 'i1',
  sortOrder: 0,
  itemId: 'it1',
  itemCode: 'SKU001',
  itemName: 'Giày',
  unit: 'đôi',
  quantity: 2,
  unitPrice: 1200000,
  lineDiscount: 200000,
  lineTotal: 2200000,
  note: 'line note',
  locationId: 'loc1',
  ...over,
});

/** Every `where` the line repository was queried with, per test. */
const lineFindWhere: any[] = [];
beforeEach(() => {
  lineFindWhere.length = 0;
});

function makeReport(opts: {
  invoices?: any[];
  lines?: any[];
  customers?: any[];
  customerGroups?: any[];
  branches?: any[];
  employees?: any[];
  users?: any[];
  items?: any[];
  categories?: any[];
  locations?: any[];
  itemProviders?: any[];
  providers?: any[];
  storages?: any[];
  itemStorageLocations?: any[];
  stockBalances?: any[];
  /** Rows the highest-stock fallback query returns. */
  stockBalanceRaw?: any[];
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
    getRawMany: jest.fn(async () => opts.stockBalanceRaw ?? []),
  };
  const repo = (rows?: any[]) => ({ find: jest.fn(async () => rows ?? []) });
  // The line repo records its `where` and honours an `itemCode` in it, so a spec
  // can tell a real SQL narrowing apart from a post-load array filter.
  const lineRepo = {
    find: jest.fn(async (findOpts: any) => {
      lineFindWhere.push(findOpts?.where ?? {});
      const rows = opts.lines ?? [];
      const wanted = findOpts?.where?.itemCode;
      return wanted ? rows.filter((l: any) => l.itemCode === wanted) : rows;
    }),
  };
  return new InvoiceItemRevenueDetailReport(
    { createQueryBuilder: jest.fn(() => qb) } as any,
    lineRepo as any,
    repo(opts.customers) as any,
    repo(opts.customerGroups) as any,
    repo(opts.branches) as any,
    repo(opts.employees) as any,
    repo(opts.users) as any,
    repo(opts.items) as any,
    repo(opts.categories) as any,
    repo(opts.locations) as any,
    repo(opts.itemProviders) as any,
    repo(opts.providers) as any,
    repo(opts.storages) as any,
    repo(opts.itemStorageLocations) as any,
    {
      ...repo(opts.stockBalances),
      createQueryBuilder: jest.fn(() => stockBalanceQb),
    } as any,
    { hasPermission: jest.fn(async () => opts.hasConsolidated ?? false) } as any,
  );
}

describe('InvoiceItemRevenueDetailReport.buildColumns', () => {
  it('bands the revenue measures under Doanh thu, no dynamic columns', async () => {
    const headers = await makeReport({}).buildColumns(actor);
    expect(headers.find((h) => h.col === 'date')).toMatchObject({ name: 'Ngày', group: null });
    expect(headers.find((h) => h.col === 'sku')).toMatchObject({ name: 'Mã SKU', group: null });
    const byCol = new Map(headers.map((h) => [h.col, h.group]));
    for (const col of ['lineAmount', 'lineDiscount', 'revenue.promoPoints', 'lineRevenue']) {
      expect(byCol.get(col)).toEqual({ id: 'revenue', name: 'Doanh thu' });
    }
    expect(headers.find((h) => h.col === 'lineRevenue')).toMatchObject({ name: 'Doanh thu' });
    expect(headers.find((h) => h.col === 'supplier')).toMatchObject({ name: 'Nhà cung cấp', group: null });
    expect(
      headers
        .filter((h) => !['lineAmount', 'lineDiscount', 'revenue.promoPoints', 'lineRevenue'].includes(h.col))
        .every((h) => h.group === null),
    ).toBe(true);
  });
});

describe('InvoiceItemRevenueDetailReport.buildData', () => {
  it('rejects unknown column keys with 400', async () => {
    await expect(
      makeReport({}).buildData(
        { columns: ['bogus'], filters: { issuedAt: { from: '2026-06-01' } } } as any,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires filters.issuedAt.from (400)', async () => {
    await expect(
      makeReport({}).buildData(
        { columns: ['date'], filters: { issuedAt: {} } } as any,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('403 when requesting another branch without consolidated', async () => {
    await expect(
      makeReport({ hasConsolidated: false }).buildData(
        {
          columns: ['date'],
          filters: { issuedAt: { from: '2026-06-01' } },
          branchId: 'other-branch',
        } as any,
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns one row per line item with inline relations, computed + placeholder cells', async () => {
    const report = makeReport({
      invoices: [inv()],
      lines: [line(), line({ sortOrder: 1, itemId: 'it2', itemCode: 'SKU002', itemName: 'Dép', quantity: 1, unitPrice: 500000, lineDiscount: 0, lineTotal: 500000, note: null, locationId: null })],
      customers: [{ id: 'c1', code: 'KH001', name: 'Khách A', phone: '0900', groupId: 'g1' }],
      customerGroups: [{ id: 'g1', name: 'VIP' }],
      branches: [{ id: 'b1', name: 'CN1' }],
      employees: [
        { id: 'epC', userId: 'staff1', code: 'NV-CASH' },
        { id: 'emp1', userId: 'uSales', code: 'NV-SALE' },
      ],
      users: [
        { id: 'staff1', firstName: 'Ngân', lastName: 'Trần' },
        { id: 'uSales', firstName: 'Hàng', lastName: 'Lê' },
      ],
      items: [
        { id: 'it1', categoryId: 'cat1' },
        { id: 'it2', categoryId: null },
      ],
      categories: [{ id: 'cat1', name: 'Giày dép' }],
      locations: [{ id: 'loc1', code: 'A-01', name: 'Kệ A1', isActive: true }],
      storages: [{ id: 'wh1', branchId: 'b1', isMainStorage: false, isActive: true }],
      itemStorageLocations: [{ itemId: 'it1', storageId: 'wh1', locationId: 'loc1' }],
      itemProviders: [{ itemId: 'it1', providerId: 'p1', isPrimary: true }],
      providers: [{ id: 'p1', name: 'NCC ABC' }],
    });

    const columns = [
      'date', 'time', 'invoiceCode', 'sku', 'itemName', 'itemCategory', 'quantity',
      'unitPrice', 'lineAmount', 'lineRevenue', 'revenue.promoPoints', 'reference',
      'locationCode', 'customer', 'customerCode', 'customerGroup', 'cashier',
      'cashierCode', 'salesperson', 'salespersonCode', 'storeCode', 'storeName',
      'supplier', 'invoiceNote', 'itemNote',
    ];
    const result = await report.buildData(
      { columns, filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } } } as any,
      actor,
    );

    expect(result).not.toHaveProperty('headers');
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);

    const row0 = result.rows[0];
    expect(row0).toMatchObject({
      date: '2026-06-03',
      time: '15:30', // business time — the fixture is 08:30 UTC

      invoiceCode: 'HD000001',
      sku: 'SKU001',
      itemName: 'Giày',
      itemCategory: 'Giày dép',
      quantity: 2,
      unitPrice: 1200000,
      lineAmount: 2400000, // 2 * 1.2m
      lineRevenue: 2200000,
      'revenue.promoPoints': 0, // placeholder
      reference: null, // placeholder
      locationCode: 'A-01',
      customer: 'Khách A',
      customerCode: 'KH001',
      customerGroup: 'VIP',
      cashier: 'Trần Ngân',
      cashierCode: 'NV-CASH',
      salesperson: 'Lê Hàng',
      salespersonCode: 'NV-SALE',
      storeCode: 'CN1',
      storeName: 'CN1',
      supplier: 'NCC ABC',
      invoiceNote: 'inv note',
      itemNote: 'line note',
    });

    const row1 = result.rows[1];
    expect(row1).toMatchObject({
      sku: 'SKU002',
      itemCategory: null, // it2 has no category
      lineAmount: 500000,
      locationCode: null,
      supplier: null,
      itemNote: null,
    });

    // totals: quantity + money columns summed; unit price + strings null
    const totals = result.totals!;
    expect(totals['quantity']).toBe(3);
    expect(totals['lineAmount']).toBe(2900000);
    expect(totals['lineRevenue']).toBe(2700000);
    expect(totals['unitPrice']).toBeNull();
    expect(totals['date']).toBeNull();
    expect(totals['sku']).toBeNull();
  });

  // The location columns describe where the goods are NOW, in the warehouse of
  // the branch that sold them — not invoice_items.location_id, which POS always
  // sets to the showroom's "Mặc định" shelf.
  it('reports the item\'s current warehouse shelf, not the showroom shelf it sold from', async () => {
    const report = makeReport({
      invoices: [inv()],
      // The line still carries the showroom shelf POS deducted from.
      lines: [line({ locationId: 'showroom-default' })],
      items: [{ id: 'it1', categoryId: null }],
      storages: [{ id: 'wh1', branchId: 'b1', isMainStorage: false, isActive: true }],
      itemStorageLocations: [{ itemId: 'it1', storageId: 'wh1', locationId: 'loc1' }],
      locations: [{ id: 'loc1', code: 'A-01', name: 'Kệ A1', isActive: true }],
    });
    const result = await report.buildData(
      {
        columns: ['sku', 'locationCode', 'locationName'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
      } as any,
      actor,
    );
    expect(result.rows[0]).toMatchObject({
      locationCode: 'A-01',
      locationName: 'Kệ A1',
    });
  });

  it('leaves the location empty when the branch has no warehouse shelf for the item', async () => {
    const report = makeReport({
      invoices: [inv()],
      lines: [line()],
      items: [{ id: 'it1', categoryId: null }],
      // Showroom only — no warehouse storage in this branch.
      storages: [{ id: 'sr1', branchId: 'b1', isMainStorage: true, isActive: true }],
    });
    const result = await report.buildData(
      {
        columns: ['sku', 'locationCode', 'locationName'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
      } as any,
      actor,
    );
    expect(result.rows[0]).toMatchObject({ locationCode: null, locationName: null });
  });

  it('applies a per-column filter post-build and recomputes totals', async () => {
    const report = makeReport({
      invoices: [inv()],
      lines: [
        line(),
        line({ sortOrder: 1, itemId: 'it2', itemCode: 'SKU002', quantity: 1, lineTotal: 500000 }),
      ],
    });
    const result = await report.buildData(
      {
        columns: ['sku', 'quantity', 'lineRevenue'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
        columnFilters: [{ col: 'quantity', gte: 2 }],
      } as any,
      actor,
    );
    expect(result.total).toBe(1);
    expect(result.rows[0].sku).toBe('SKU001');
    expect(result.totals!['lineRevenue']).toBe(2200000);
  });
});

describe('InvoiceItemRevenueDetailReport — filters.sku', () => {
  const line = (over: Record<string, any> = {}) => ({
    id: over.id ?? 'l1',
    invoiceId: 'i1',
    sortOrder: 0,
    itemId: over.itemId ?? 'it1',
    itemCode: over.itemCode ?? 'SKU001',
    itemName: over.itemName ?? 'Item One',
    unit: 'đôi',
    direction: ItemDirection.OUT,
    quantity: 1,
    unitPrice: over.unitPrice ?? 1_000_000,
    lineDiscount: 0,
    promotionDiscount: 0,
    lineTotal: over.lineTotal ?? 1_000_000,
    note: null,
  });

  const twoSkus = {
    invoices: [inv()],
    lines: [
      line({ id: 'l1', itemCode: 'SKU001', itemId: 'it1' }),
      line({ id: 'l2', itemCode: 'SKU002', itemId: 'it2', itemName: 'Item Two' }),
    ],
  };

  const dto = (over: Record<string, any> = {}) =>
    ({
      columns: ['invoiceCode', 'sku', 'lineAmount'],
      filters: {
        issuedAt: { from: '2026-06-01', to: '2026-06-30' },
        ...over,
      },
    }) as any;

  it('reaches the line query WHERE, not a filter applied after loading', async () => {
    const report = makeReport(twoSkus);

    await report.buildData(dto({ sku: 'SKU001' }), actor);

    expect(lineFindWhere.some((w) => w.itemCode === 'SKU001')).toBe(true);
  });

  it('narrows both the rows and the footer to that SKU', async () => {
    const report = makeReport(twoSkus);

    const result = await report.buildData(dto({ sku: 'SKU001' }), actor);

    expect(result.rows.map((r) => r.sku)).toEqual(['SKU001']);
    expect(result.totals!['lineAmount']).toBe(1_000_000);
  });

  it('composes with categoryId — intersection, not union', async () => {
    const report = makeReport({
      ...twoSkus,
      items: [
        { id: 'it1', categoryId: 'cat-1' },
        { id: 'it2', categoryId: 'cat-2' },
      ],
    });

    const result = await report.buildData(
      dto({ sku: 'SKU001', categoryId: 'cat-2' }),
      actor,
    );

    // SKU001 is in cat-1, so intersecting with cat-2 leaves nothing.
    expect(result.rows).toHaveLength(0);
  });

  it('leaves behaviour identical when no sku is sent', async () => {
    const report = makeReport(twoSkus);

    const result = await report.buildData(dto(), actor);

    expect(result.rows.map((r) => r.sku)).toEqual(['SKU001', 'SKU002']);
    expect(lineFindWhere.every((w) => w.itemCode === undefined)).toBe(true);
  });
});
