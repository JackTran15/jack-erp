import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReportColumnDataType } from '@erp/shared-interfaces';
import { InvoiceType, RefundMethod } from '../../../pos/entities/invoice.entity';
import { PaymentAccountMethod } from '../../../accounting/payment-accounts/enums';
import { DailySalesSummaryReport } from './daily-sales-summary.report';

const ACC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG = 'org-1';
const actor = { userId: 'u1', organizationId: ORG, branchId: 'b1', roles: [] } as any;

const inv = (
  id: string,
  iso: string,
  subtotal: number,
  totalPaid: number,
  over: Record<string, any> = {},
) => ({
  id,
  issuedAt: new Date(iso),
  type: InvoiceType.SALE,
  subtotal,
  discountAmount: 0,
  pointsDiscountAmount: 0,
  totalPaid,
  netAmount: 0,
  refundedAmount: 0,
  refundMethod: null,
  ...over,
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
    expect(result.rows).toHaveLength(2);
    const row0 = result.rows[0];
    expect(row0.date).toBe('2026-06-03');
    expect(row0['revenue.goods']).toBe(20000000);
    expect(row0['revenue.total']).toBe(20000000);
    expect(row0[`payment.method.${ACC}`]).toBe(15600000);
    expect(result.totals!['revenue.goods']).toBe(25000000);
  });

  it('nets a RETURN against a SALE on the same day (goods, revenue, totalPaid, cash)', async () => {
    const report = makeReport({
      invoices: [
        inv('i1', '2026-06-03T10:00:00Z', 100000, 100000),
        inv('i2', '2026-06-03T11:00:00Z', 50000, 50000, { type: InvoiceType.RETURN }),
      ],
      payments: [
        { invoiceId: 'i1', paymentMethod: 'cash', amount: 100000, accountId: ACC },
        { invoiceId: 'i2', paymentMethod: 'cash', amount: 50000, accountId: ACC },
      ],
    });
    const result = await report.buildData(
      {
        columns: ['date', 'revenue.goods', 'revenue.total', 'actualRevenue', 'revenue.cash'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
      } as any,
      actor,
    );
    expect(result.rows).toHaveLength(1);
    const r = result.rows[0];
    expect(r['revenue.goods']).toBe(50000); // 100k − 50k, not 150k
    expect(r['revenue.total']).toBe(50000);
    expect(r['actualRevenue']).toBe(50000); // totalPaid 100k − 50k
    expect(r['revenue.cash']).toBe(50000); // cash 100k − 50k
  });

  it('nets an EXCHANGE via its net (new − returned); cash refund gap left for TKT-RPT-03', async () => {
    // SALE 1.5m (cash) + EXCHANGE returning it for a 750k item (net −750k).
    const report = makeReport({
      invoices: [
        inv('i1', '2026-06-05T09:00:00Z', 1500000, 1500000),
        inv('i2', '2026-06-05T10:00:00Z', 750000, 0, {
          type: InvoiceType.EXCHANGE,
          netAmount: -750000,
          refundedAmount: 750000,
        }),
      ],
      payments: [
        { invoiceId: 'i1', paymentMethod: 'cash', amount: 1500000, accountId: ACC },
      ],
    });
    const result = await report.buildData(
      {
        columns: ['date', 'revenue.goods', 'revenue.total', 'actualRevenue', 'revenue.cash'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
      } as any,
      actor,
    );
    const r = result.rows[0];
    expect(r['revenue.goods']).toBe(750000); // 1.5m + (750k − 1.5m)
    expect(r['revenue.total']).toBe(750000);
    // Cash refund is not an invoice_payments row, so cash/Thực thu still show the
    // gross 1.5m after RPT-02 — TKT-RPT-03 nets the cash refund out.
    expect(r['actualRevenue']).toBe(1500000);
    expect(r['revenue.cash']).toBe(1500000);
  });

  describe('cash-refund netting (TKT-RPT-03)', () => {
    const cashAccount = { accountId: ACC, paymentMethod: PaymentAccountMethod.CASH };

    it('nets an EXCHANGE cash refund out of both cash columns and Thực thu', async () => {
      const report = makeReport({
        accounts: [cashAccount],
        invoices: [
          inv('i1', '2026-06-05T09:00:00Z', 1500000, 1500000),
          inv('i2', '2026-06-05T10:00:00Z', 750000, 0, {
            type: InvoiceType.EXCHANGE,
            netAmount: -750000,
            refundedAmount: 750000,
            refundMethod: RefundMethod.CASH,
          }),
        ],
        payments: [
          { invoiceId: 'i1', paymentMethod: 'cash', amount: 1500000, accountId: ACC },
        ],
      });
      const result = await report.buildData(
        {
          columns: ['date', 'revenue.goods', 'revenue.cash', 'actualRevenue', `payment.method.${ACC}`],
          filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
        } as any,
        actor,
      );
      const r = result.rows[0];
      expect(r['revenue.goods']).toBe(750000);
      expect(r['revenue.cash']).toBe(750000); // 1.5m − 750k refund
      expect(r['actualRevenue']).toBe(750000); // Thực thu nets
      expect(r[`payment.method.${ACC}`]).toBe(750000); // dynamic cash account nets too
    });

    it('nets a pure RETURN cash refund out of cash and Thực thu', async () => {
      const report = makeReport({
        accounts: [cashAccount],
        invoices: [
          inv('i1', '2026-06-06T09:00:00Z', 500000, 500000),
          inv('i2', '2026-06-06T10:00:00Z', 500000, 0, {
            type: InvoiceType.RETURN,
            refundedAmount: 500000,
            refundMethod: RefundMethod.CASH,
          }),
        ],
        payments: [
          { invoiceId: 'i1', paymentMethod: 'cash', amount: 500000, accountId: ACC },
        ],
      });
      const result = await report.buildData(
        {
          columns: ['date', 'revenue.cash', 'actualRevenue'],
          filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
        } as any,
        actor,
      );
      const r = result.rows[0];
      expect(r['revenue.cash']).toBe(0); // 500k − 500k
      expect(r['actualRevenue']).toBe(0);
    });

    it('leaves cash + Thực thu untouched for a STORE_CREDIT refund (no cash left the till)', async () => {
      const report = makeReport({
        accounts: [cashAccount],
        invoices: [
          inv('i1', '2026-06-07T09:00:00Z', 500000, 500000),
          inv('i2', '2026-06-07T10:00:00Z', 500000, 0, {
            type: InvoiceType.RETURN,
            refundedAmount: 500000,
            refundMethod: RefundMethod.STORE_CREDIT,
          }),
        ],
        payments: [
          { invoiceId: 'i1', paymentMethod: 'cash', amount: 500000, accountId: ACC },
        ],
      });
      const result = await report.buildData(
        {
          columns: ['date', 'revenue.cash', 'actualRevenue'],
          filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
        } as any,
        actor,
      );
      const r = result.rows[0];
      expect(r['revenue.cash']).toBe(500000);
      expect(r['actualRevenue']).toBe(500000);
    });

    it('leaves cash + Thực thu untouched for an OFFSET refund', async () => {
      const report = makeReport({
        accounts: [cashAccount],
        invoices: [
          inv('i1', '2026-06-08T09:00:00Z', 500000, 500000),
          inv('i2', '2026-06-08T10:00:00Z', 500000, 0, {
            type: InvoiceType.RETURN,
            refundedAmount: 500000,
            refundMethod: RefundMethod.OFFSET,
          }),
        ],
        payments: [
          { invoiceId: 'i1', paymentMethod: 'cash', amount: 500000, accountId: ACC },
        ],
      });
      const result = await report.buildData(
        {
          columns: ['date', 'revenue.cash', 'actualRevenue'],
          filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
        } as any,
        actor,
      );
      const r = result.rows[0];
      expect(r['revenue.cash']).toBe(500000);
      expect(r['actualRevenue']).toBe(500000);
    });

    it('nets revenue.cash via the method key even when no active cash account exists', async () => {
      const report = makeReport({
        accounts: [], // no cash payment account → cashAccountId unresolved
        invoices: [
          inv('i1', '2026-06-09T09:00:00Z', 500000, 500000),
          inv('i2', '2026-06-09T10:00:00Z', 500000, 0, {
            type: InvoiceType.RETURN,
            refundedAmount: 500000,
            refundMethod: RefundMethod.CASH,
          }),
        ],
        payments: [
          { invoiceId: 'i1', paymentMethod: 'cash', amount: 500000, accountId: ACC },
        ],
      });
      const result = await report.buildData(
        {
          columns: ['date', 'revenue.cash', 'actualRevenue'],
          filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
        } as any,
        actor,
      );
      const r = result.rows[0];
      expect(r['revenue.cash']).toBe(0); // still nets via the 'cash' method key
      expect(r['actualRevenue']).toBe(0);
    });
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
    expect(result.rows[0].date).toBe('2026-06-04');
    expect(result.totals!['revenue.goods']).toBe(5000000);
  });
});
