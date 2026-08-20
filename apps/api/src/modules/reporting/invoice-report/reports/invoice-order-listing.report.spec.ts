import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReportColumnDataType } from '@erp/shared-interfaces';
import { InvoiceType } from '../../../pos/entities/invoice.entity';
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
      time: '15:30', // business time — the fixture is 08:30 UTC

      invoiceCode: 'HD000001',
      status: 'Hoàn thành', // VI label, not the raw enum
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

  it('nets a RETURN invoice — negative row money and a netted footer', async () => {
    const report = makeReport({
      invoices: [
        inv(), // SALE: subtotal 20m, discount 2m, totalPaid 18m
        inv({
          id: 'i2',
          code: 'HD000002',
          issuedAt: new Date('2026-06-04T09:00:00Z'),
          type: InvoiceType.RETURN,
          subtotal: 5000000,
          discountAmount: 0,
          totalPaid: 5000000,
          amountDue: 5000000,
          customerId: 'c2',
          salespersonId: undefined,
        }),
      ],
      payments: [
        { invoiceId: 'i1', paymentMethod: 'cash', amount: 18000000, accountId: ACC },
        { invoiceId: 'i2', paymentMethod: 'cash', amount: 5000000, accountId: ACC },
      ],
    });
    const result = await report.buildData(
      {
        columns: ['invoiceCode', 'revenue.goods', 'revenue.total', 'payment.cash'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
      } as any,
      actor,
    );

    const returnRow = result.rows.find((r) => r.invoiceCode === 'HD000002')!;
    expect(returnRow['revenue.goods']).toBe(-5000000);
    expect(returnRow['revenue.total']).toBe(-5000000);
    expect(returnRow['payment.cash']).toBe(-5000000);
    // Footer nets the return out: goods 20m − 5m, revenue 18m − 5m, cash 18m − 5m.
    expect(result.totals!['revenue.goods']).toBe(15000000);
    expect(result.totals!['revenue.total']).toBe(13000000);
    expect(result.totals!['payment.cash']).toBe(13000000);
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

  // The "Trạng thái" select offers Vietnamese labels but submits the enum
  // behind them, so the cell is translated for display while the filter keeps
  // comparing on the raw value.
  it('filters status on the enum while showing the Vietnamese label', async () => {
    const report = makeReport({
      invoices: [
        inv(),
        inv({ id: 'i2', code: 'HD000002', status: 'cancelled' }),
      ],
    });
    const result = await report.buildData(
      {
        columns: ['invoiceCode', 'status'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
        columnFilters: [{ col: 'status', equals: 'paid' }],
      } as any,
      actor,
    );
    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({
      invoiceCode: 'HD000001',
      status: 'Hoàn thành',
    });
  });
});

/**
 * A query builder that actually behaves like the keyset query: it reads the
 * partition bounds and the cursor out of the bound parameters and applies them,
 * so these tests exercise cursor advancement rather than asserting on SQL text.
 * The generated SQL itself is covered by the e2e against a real database.
 */
function makeKeysetReport(invoices: any[]) {
  const seen: { ids: string[]; takes: number[] } = { ids: [], takes: [] };
  const invoicesRepo: any = {
    createQueryBuilder: () => {
      const params: Record<string, any> = {};
      let take = Number.POSITIVE_INFINITY;
      const qb: any = {
        where: () => qb,
        andWhere: (_sql: string, p?: Record<string, any>) => {
          Object.assign(params, p ?? {});
          return qb;
        },
        orderBy: () => qb,
        addOrderBy: () => qb,
        addSelect: () => qb,
        take: (n: number) => {
          take = n;
          seen.takes.push(n);
          return qb;
        },
        getMany: async () => invoices,
        getRawAndEntities: async () => {
          let rows = [...invoices].sort((a, b) => {
            const t = a.issuedAt.getTime() - b.issuedAt.getTime();
            return t !== 0 ? t : a.id.localeCompare(b.id);
          });
          if (params.partFrom) {
            rows = rows.filter((r) => r.issuedAt >= params.partFrom);
          }
          if (params.partTo) rows = rows.filter((r) => r.issuedAt < params.partTo);
          if (params.cursorAt) {
            const at = new Date(params.cursorAt).getTime();
            rows = rows.filter(
              (r) =>
                r.issuedAt.getTime() > at ||
                (r.issuedAt.getTime() === at && r.id > params.cursorId),
            );
          }
          rows = rows.slice(0, take);
          return {
            entities: rows,
            raw: rows.map((r) => ({ cursor_at: r.issuedAt.toISOString() })),
          };
        },
      };
      return qb;
    },
  };
  const repo = (rows: any[] = []) => ({
    find: jest.fn(async (opts: any) => {
      const where = opts?.where ?? {};
      if (where.invoiceId?._value) seen.ids.push(...where.invoiceId._value);
      return rows;
    }),
  });
  const report = new InvoiceOrderListingReport(
    invoicesRepo,
    repo() as any,
    repo() as any,
    { find: jest.fn(async () => [{ accountId: ACC }]) } as any,
    repo() as any,
    repo() as any,
    repo() as any,
    { hasPermission: jest.fn(async () => false) } as any,
  );
  return { report, seen };
}

const exportDto = (over: Record<string, any> = {}) =>
  ({
    reportType: 'invoice-order-listing',
    columns: ['invoiceCode', 'revenue.goods'],
    filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
    ...over,
  }) as any;

const wholeMonth = {
  from: new Date('2026-06-01T00:00:00Z'),
  to: new Date('2026-07-01T00:00:00Z'),
};

describe('InvoiceOrderListingReport.exportSource', () => {
  it('widens the picked days into the instants they span locally', () => {
    const { report } = makeKeysetReport([]);
    // June opens at 17:00 UTC on 31 May and closes a millisecond before 17:00
    // UTC on 30 June — the whole of the last day, not just its first instant.
    expect(report.exportSource.range(exportDto())).toEqual({
      from: '2026-05-31T17:00:00.000Z',
      to: '2026-06-30T16:59:59.999Z',
    });
    expect(report.exportSource.range(exportDto({ filters: {} }))).toBeNull();
  });

  it('sums money columns and leaves the discount rate alone', () => {
    const { report } = makeKeysetReport([]);
    const summable = report.exportSource.summable([
      'invoiceCode',
      'revenue.goods',
      'promoRate',
    ]);
    // promoRate is a percentage: adding percentages together means nothing.
    expect(summable).toEqual(['revenue.goods']);
  });

  it('exports the file oldest-first, the same way the table reads', () => {
    const { report } = makeKeysetReport([]);
    expect(report.exportSource.order).toBe('asc');
  });

  it('walks pages by cursor without repeating or losing a row', async () => {
    // Three invoices share a timestamp: `id` is the only thing that can move
    // the cursor past them. This is where OFFSET paging goes wrong.
    const sameInstant = new Date('2026-06-10T10:00:00Z');
    const invoices = [
      inv({ id: 'a', code: 'HD1', issuedAt: sameInstant }),
      inv({ id: 'b', code: 'HD2', issuedAt: sameInstant }),
      inv({ id: 'c', code: 'HD3', issuedAt: sameInstant }),
      inv({ id: 'd', code: 'HD4', issuedAt: new Date('2026-06-11T10:00:00Z') }),
      inv({ id: 'e', code: 'HD5', issuedAt: new Date('2026-06-12T10:00:00Z') }),
    ];
    const { report } = makeKeysetReport(invoices);

    const collected: string[] = [];
    let cursor: any = null;
    let hasMore = true;
    let guard = 0;
    while (hasMore && guard++ < 10) {
      const page = await report.exportSource.page(exportDto(), actor, {
        partition: wholeMonth,
        cursor,
        size: 2,
      });
      collected.push(...page.rows.map((r) => r.invoiceCode as string));
      cursor = page.nextCursor;
      hasMore = page.hasMore && cursor !== null;
    }

    expect(collected).toEqual(['HD1', 'HD2', 'HD3', 'HD4', 'HD5']);
  });

  it('yields the same rows as buildData for the same filters', async () => {
    const invoices = [
      inv({ id: 'a', code: 'HD1', issuedAt: new Date('2026-06-02T10:00:00Z') }),
      inv({ id: 'b', code: 'HD2', issuedAt: new Date('2026-06-05T10:00:00Z') }),
      inv({ id: 'c', code: 'HD3', issuedAt: new Date('2026-06-09T10:00:00Z') }),
    ];
    const { report } = makeKeysetReport(invoices);

    const viaBuildData = await report.buildData(
      exportDto({ limit: 100 }),
      actor,
    );
    const viaKeyset: any[] = [];
    let cursor: any = null;
    let hasMore = true;
    let guard = 0;
    while (hasMore && guard++ < 10) {
      const page = await report.exportSource.page(exportDto(), actor, {
        partition: wholeMonth,
        cursor,
        size: 2,
      });
      viaKeyset.push(...page.rows);
      cursor = page.nextCursor;
      hasMore = page.hasMore && cursor !== null;
    }

    expect(viaKeyset).toEqual(viaBuildData.rows);
  });

  it('keeps a window to its own rows', async () => {
    const invoices = [
      inv({ id: 'a', code: 'IN', issuedAt: new Date('2026-06-05T10:00:00Z') }),
      inv({ id: 'b', code: 'OUT', issuedAt: new Date('2026-06-20T10:00:00Z') }),
    ];
    const { report } = makeKeysetReport(invoices);

    const page = await report.exportSource.page(exportDto(), actor, {
      partition: {
        from: new Date('2026-06-01T00:00:00Z'),
        to: new Date('2026-06-10T00:00:00Z'),
      },
      cursor: null,
      size: 50,
    });

    expect(page.rows.map((r) => r.invoiceCode)).toEqual(['IN']);
  });

  it('loads auxiliary data for one page, not the whole period', async () => {
    const invoices = Array.from({ length: 6 }, (_, i) =>
      inv({
        id: `id-${i}`,
        code: `HD${i}`,
        issuedAt: new Date(`2026-06-0${i + 1}T10:00:00Z`),
      }),
    );
    const { report, seen } = makeKeysetReport(invoices);

    await report.exportSource.page(
      exportDto({ columns: ['invoiceCode', 'payment.cash'] }),
      actor,
      { partition: wholeMonth, cursor: null, size: 2 },
    );

    // The whole point of keyset here: `In(...)` shrinks from every invoice in
    // the period to the two on this page.
    expect(seen.ids).toEqual(['id-0', 'id-1']);
    expect(seen.takes).toEqual([2]);
  });

  it('reports hasMore from what the database returned, not what survived filtering', async () => {
    const invoices = [
      inv({ id: 'a', code: 'HD1', issuedAt: new Date('2026-06-02T10:00:00Z'), subtotal: 1 }),
      inv({ id: 'b', code: 'HD2', issuedAt: new Date('2026-06-03T10:00:00Z'), subtotal: 1 }),
    ];
    const { report } = makeKeysetReport(invoices);

    const page = await report.exportSource.page(
      exportDto({ columnFilters: [{ col: 'revenue.goods', gte: 999999 }] }),
      actor,
      { partition: wholeMonth, cursor: null, size: 2 },
    );

    // Every row was filtered out, but a full page came back from the database,
    // so paging must continue — otherwise the export stops at the first page
    // where the user's column filter happens to match nothing.
    expect(page.rows).toHaveLength(0);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).not.toBeNull();
  });
});
