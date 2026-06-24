import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReportColumnDataType } from '@erp/shared-interfaces';
import { InvoiceOrderListingReport } from './invoice-order-listing.report';

const ACC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG = 'org-1';
const actor = { userId: 'u1', organizationId: ORG, branchId: 'b1', roles: [] } as any;

const inv = (over: Record<string, any> = {}) => ({
  id: 'i1',
  issuedAt: new Date('2026-06-03T08:30:00Z'),
  code: 'HD000001',
  status: 'paid',
  subtotal: 20000000,
  discountAmount: 2000000,
  pointsDiscountAmount: 0,
  totalPaid: 18000000,
  amountDue: 18000000,
  note: 'note',
  customerId: 'c1',
  staffId: 'staff1',
  salespersonId: 'emp1',
  branchId: 'b1',
  ...over,
});

function makeReport(opts: {
  invoices?: any[];
  payments?: any[];
  promotions?: any[];
  accounts?: any[];
  customers?: any[];
  branches?: any[];
  employees?: any[];
  hasConsolidated?: boolean;
}) {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    getMany: jest.fn(async () => opts.invoices ?? []),
  };
  const invoicesRepo: any = { createQueryBuilder: jest.fn(() => qb) };
  const paymentsRepo: any = { find: jest.fn(async () => opts.payments ?? []) };
  const promotionsRepo: any = { find: jest.fn(async () => opts.promotions ?? []) };
  const accountsRepo: any = {
    find: jest.fn(async () => opts.accounts ?? [{ accountId: ACC }]),
  };
  const customersRepo: any = { find: jest.fn(async () => opts.customers ?? []) };
  const branchesRepo: any = { find: jest.fn(async () => opts.branches ?? []) };
  const employeesRepo: any = { find: jest.fn(async () => opts.employees ?? []) };
  const rbac: any = {
    hasPermission: jest.fn(async () => opts.hasConsolidated ?? false),
  };
  return new InvoiceOrderListingReport(
    invoicesRepo,
    paymentsRepo,
    promotionsRepo,
    accountsRepo,
    customersRepo,
    branchesRepo,
    employeesRepo,
    rbac,
  );
}

describe('InvoiceOrderListingReport.buildColumns', () => {
  it('returns the MISA fixed columns (bands) + one dynamic column per distinct account', async () => {
    const report = makeReport({
      accounts: [
        { accountId: ACC, label: 'Tiền mặt', paymentMethod: 'cash', sortOrder: 0 },
        { accountId: ACC, label: 'dup', paymentMethod: 'cash', sortOrder: 1 },
      ],
    });
    const headers = await report.buildColumns(actor);

    expect(headers.find((h) => h.col === 'date')).toMatchObject({ name: 'Ngày', group: null });
    expect(headers.find((h) => h.col === 'invoiceCode')).toMatchObject({ name: 'Số hóa đơn', group: null });
    expect(headers.find((h) => h.col === 'revenue.total')).toMatchObject({
      name: 'Tổng',
      group: { id: 'revenue', name: 'Doanh thu' },
    });
    expect(headers.find((h) => h.col === 'platform.fee')).toMatchObject({
      name: 'Phí trả sàn',
      group: { id: 'platform', name: 'Doanh thu sàn TMĐT' },
    });
    const dyn = headers.filter((h) => h.col === `payment.method.${ACC}`);
    expect(dyn).toHaveLength(1);
    expect(dyn[0]).toMatchObject({
      name: 'Tiền mặt',
      type: ReportColumnDataType.CURRENCY,
      group: { id: 'customerPayment', name: 'Khách hàng thanh toán' },
    });
  });

  it('keeps every band contiguous — dynamic customerPayment columns sit before the platform band, not after it', async () => {
    const report = makeReport({
      accounts: [{ accountId: ACC, label: 'Tiền mặt', paymentMethod: 'cash', sortOrder: 0 }],
    });
    const headers = await report.buildColumns(actor);

    // Each band must appear as a single uninterrupted run.
    const bands = headers.map((h) => h.group?.id ?? null);
    const seen = new Set<string | null>();
    let prev: string | null | undefined;
    for (const b of bands) {
      if (b !== prev) {
        expect(seen.has(b)).toBe(false); // a band already closed must never reopen
        seen.add(b);
        prev = b;
      }
    }

    // The dynamic account column belongs to customerPayment, so it must land
    // before the first platform column.
    const dynIdx = headers.findIndex((h) => h.col === `payment.method.${ACC}`);
    const firstPlatformIdx = headers.findIndex((h) => h.group?.id === 'platform');
    expect(dynIdx).toBeGreaterThanOrEqual(0);
    expect(firstPlatformIdx).toBeGreaterThan(dynIdx);
  });
});

describe('InvoiceOrderListingReport.buildData', () => {
  it('rejects unknown column keys with 400', async () => {
    const report = makeReport({});
    await expect(
      report.buildData(
        { columns: ['bogus'], filters: { issuedAt: { from: '2026-06-01' } } } as any,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a dynamic key whose account is not in the org with 400', async () => {
    const report = makeReport({ accounts: [{ accountId: ACC }] });
    await expect(
      report.buildData(
        {
          columns: ['payment.method.bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'],
          filters: { issuedAt: { from: '2026-06-01' } },
        } as any,
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires filters.issuedAt.from (400)', async () => {
    const report = makeReport({});
    await expect(
      report.buildData({ columns: ['date'], filters: { issuedAt: {} } } as any, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('403 when requesting another branch without consolidated', async () => {
    const report = makeReport({ hasConsolidated: false });
    await expect(
      report.buildData(
        {
          columns: ['date'],
          filters: { issuedAt: { from: '2026-06-01' } },
          branchId: 'other-branch',
        } as any,
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns one row per invoice with inline relations, payment pivot, computed + placeholder cells', async () => {
    const report = makeReport({
      invoices: [
        inv(),
        inv({ id: 'i2', code: 'HD000002', issuedAt: new Date('2026-06-04T09:00:00Z'), subtotal: 5000000, discountAmount: 0, totalPaid: 5000000, amountDue: 5000000, customerId: 'c2', salespersonId: undefined }),
      ],
      payments: [
        { invoiceId: 'i1', paymentMethod: 'cash', amount: 18000000, accountId: ACC },
        { invoiceId: 'i2', paymentMethod: 'bank_transfer', amount: 5000000, accountId: ACC },
      ],
      customers: [
        { id: 'c1', name: 'Khách A', phone: '0900000001' },
        { id: 'c2', name: 'Khách B', phone: '0900000002' },
      ],
      branches: [{ id: 'b1', name: 'Chi nhánh 1' }],
      employees: [{ id: 'emp1', userId: 'staff1', code: 'NV000002' }],
    });

    const result = await report.buildData(
      {
        columns: ['date', 'time', 'invoiceCode', 'status', 'revenue.total', 'payment.cash', `payment.method.${ACC}`, 'platform.fee', 'customer', 'cashier', 'storeCode', 'payment.bankAccount'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
      } as any,
      actor,
    );

    expect(result).not.toHaveProperty('headers');
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);

    const row0 = result.rows[0];
    expect(row0).toMatchObject({
      date: '2026-06-03',
      time: '08:30',
      invoiceCode: 'HD000001',
      status: 'paid',
      'revenue.total': 18000000, // 20m - 2m
      'payment.cash': 18000000,
      [`payment.method.${ACC}`]: 18000000,
      'platform.fee': 0, // placeholder
      customer: 'Khách A',
      cashier: 'NV000002',
      storeCode: 'Chi nhánh 1',
      'payment.bankAccount': null, // placeholder
    });

    // totals: money columns summed, strings/dates null
    const totals = result.totals!;
    expect(totals['revenue.total']).toBe(23000000);
    expect(totals['payment.cash']).toBe(18000000);
    expect(totals['date']).toBeNull();
    expect(totals['customer']).toBeNull();
  });

  it('applies per-column filter post-build and recomputes totals', async () => {
    const report = makeReport({
      invoices: [
        inv(),
        inv({ id: 'i2', code: 'HD000002', issuedAt: new Date('2026-06-04T09:00:00Z'), subtotal: 5000000, discountAmount: 0 }),
      ],
    });
    const result = await report.buildData(
      {
        columns: ['invoiceCode', 'revenue.goods'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
        columnFilters: [{ col: 'revenue.goods', lte: 6000000 }],
      } as any,
      actor,
    );
    expect(result.total).toBe(1);
    expect(result.rows[0].invoiceCode).toBe('HD000002');
    expect(result.totals!['revenue.goods']).toBe(5000000);
  });
});
