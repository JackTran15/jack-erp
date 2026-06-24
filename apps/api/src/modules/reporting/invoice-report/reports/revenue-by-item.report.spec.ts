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
  hasConsolidated?: boolean;
}) {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    getMany: jest.fn(async () => opts.invoices ?? []),
  };
  const repo = (rows?: any[]) => ({ find: jest.fn(async () => rows ?? []) });
  return new RevenueByItemReport(
    { createQueryBuilder: jest.fn(() => qb) } as any,
    repo(opts.lines) as any,
    repo(opts.items) as any,
    repo(opts.categories) as any,
    repo(opts.products) as any,
    { hasPermission: jest.fn(async () => opts.hasConsolidated ?? false) } as any,
  );
}

const baseDto = (over: Record<string, any> = {}) => ({
  reportType: 'revenue-by-item',
  columns: ['sku', 'quantity', 'revenue.total'],
  filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
  ...over,
});

describe('RevenueByItemReport.buildColumns', () => {
  it('returns a flat catalog (no bands)', async () => {
    const report = makeReport({});
    const headers = await report.buildColumns(actor);
    expect(headers.every((h) => h.group === null)).toBe(true);
    expect(headers.map((h) => h.col)).toEqual(
      expect.arrayContaining(['sku', 'itemName', 'brand', 'quantity', 'revenue.total']),
    );
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
