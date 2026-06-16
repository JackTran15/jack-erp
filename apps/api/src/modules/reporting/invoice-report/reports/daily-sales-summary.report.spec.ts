import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReportColumnDataType } from '@erp/shared-interfaces';
import { DailySalesSummaryReport } from './daily-sales-summary.report';

const ACC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG = 'org-1';
const actor = { userId: 'u1', organizationId: ORG, branchId: 'b1', roles: [] } as any;

const inv = (id: string, iso: string, subtotal: number, totalPaid: number) => ({
  id,
  issuedAt: new Date(iso),
  subtotal,
  discountAmount: 0,
  pointsDiscountAmount: 0,
  totalPaid,
});

function makeReport(opts: {
  invoices?: any[];
  payments?: any[];
  promotions?: any[];
  accounts?: any[];
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
  const rbac: any = {
    hasPermission: jest.fn(async () => opts.hasConsolidated ?? false),
  };
  return new DailySalesSummaryReport(
    invoicesRepo,
    paymentsRepo,
    promotionsRepo,
    accountsRepo,
    rbac,
  );
}

describe('DailySalesSummaryReport.buildColumns', () => {
  it('returns fixed columns (VI labels + bands) + one dynamic column per distinct account', async () => {
    const report = makeReport({
      accounts: [
        { accountId: ACC, label: 'Tiền mặt', paymentMethod: 'cash', sortOrder: 0 },
        { accountId: ACC, label: 'dup', paymentMethod: 'cash', sortOrder: 1 },
      ],
    });
    const headers = await report.buildColumns(actor);

    expect(headers.find((h) => h.col === 'date')).toMatchObject({
      name: 'Ngày',
      group: null,
    });
    expect(headers.find((h) => h.col === 'revenue.total')).toMatchObject({
      name: 'Tổng',
      group: { id: 'revenue', name: 'Doanh thu' },
    });
    const dyn = headers.filter((h) => h.col === `payment.method.${ACC}`);
    expect(dyn).toHaveLength(1);
    expect(dyn[0]).toMatchObject({
      name: 'Tiền mặt',
      type: ReportColumnDataType.CURRENCY,
      group: { id: 'customerPayment', name: 'Khách hàng thanh toán' },
    });
  });
});

describe('DailySalesSummaryReport.buildData', () => {
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
      report.buildData(
        { columns: ['date'], filters: { issuedAt: {} } } as any,
        actor,
      ),
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

  it('aggregates by day, pivots payments, returns data-only envelope', async () => {
    const report = makeReport({
      invoices: [
        inv('i1', '2026-06-03T10:00:00Z', 20000000, 15600000),
        inv('i3', '2026-06-04T10:00:00Z', 5000000, 5000000),
      ],
      payments: [
        { invoiceId: 'i1', paymentMethod: 'cash', amount: 15600000, accountId: ACC },
        { invoiceId: 'i3', paymentMethod: 'card', amount: 5000000, accountId: ACC },
      ],
    });
    const result = await report.buildData(
      {
        columns: ['date', 'revenue.goods', 'revenue.total', `payment.method.${ACC}`],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
      } as any,
      actor,
    );

    expect(result).not.toHaveProperty('headers');
    expect(result.total).toBe(2);
    expect(result.dataRaw).toHaveLength(2);
    const row0 = result.dataRaw[0];
    expect(row0[0]).toMatchObject({ col: 'date', value: '2026-06-03' });
    expect(row0[1]).toMatchObject({ col: 'revenue.goods', value: 20000000 });
    expect(row0[2]).toMatchObject({ col: 'revenue.total', value: 20000000 });
    expect(row0[3]).toMatchObject({ col: `payment.method.${ACC}`, value: 15600000 });
    expect(result.totals![1]).toMatchObject({ col: 'revenue.goods', value: 25000000 });
  });

  it('applies per-column filter post-aggregate and recomputes totals', async () => {
    const report = makeReport({
      invoices: [
        inv('i1', '2026-06-03T10:00:00Z', 20000000, 15600000),
        inv('i3', '2026-06-04T10:00:00Z', 5000000, 5000000),
      ],
    });
    const result = await report.buildData(
      {
        columns: ['date', 'revenue.goods'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
        columnFilters: [{ col: 'revenue.goods', lte: 6000000 }],
      } as any,
      actor,
    );
    expect(result.total).toBe(1);
    expect(result.dataRaw[0][0]).toMatchObject({ col: 'date', value: '2026-06-04' });
    expect(result.totals![1]).toMatchObject({ col: 'revenue.goods', value: 5000000 });
  });
});
