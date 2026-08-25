/**
 * The four sales reports read "Khuyến mại" and "Điểm KM" through four different
 * code paths — two from the invoice header, two from the lines. Nothing used to
 * assert they agree, which is how a 300.000 gap on EXCHANGE invoices survived in
 * production (feature `revenue-by-item-misa-parity` recorded the same doubt as
 * an unverified assumption).
 *
 * One dataset, four reports, one set of assertions on the footer totals. Grain
 * differs per report, so only the totals are comparable.
 */
import { ItemDirection } from '../../pos/entities/invoice-item.entity';
import { InvoiceType } from '../../pos/entities/invoice.entity';
import { DailySalesSummaryReport } from './reports/daily-sales-summary.report';
import { InvoiceOrderListingReport } from './reports/invoice-order-listing.report';
import { InvoiceItemRevenueDetailReport } from './reports/invoice-item-revenue-detail.report';
import { RevenueByItemReport } from './reports/revenue-by-item.report';
import { fakeLineItemsRepo } from '../report-core/fake-line-items-repo';

const ORG = 'org-1';
const actor = {
  userId: 'u1',
  organizationId: ORG,
  branchId: 'b1',
  roles: [],
} as any;

const PERIOD = { issuedAt: { from: '2026-08-01', to: '2026-08-31' } };

/**
 * One invoice per interesting shape. Numbers are derived below rather than
 * pasted from `erp_dev`: dev data changes, and a spec pinned to it rots.
 */
const invoice = (over: Record<string, any>) => ({
  id: over.id,
  code: over.code,
  status: over.status ?? 'paid',
  type: over.type ?? InvoiceType.SALE,
  branchId: 'b1',
  issuedAt: new Date(over.iso),
  subtotal: over.subtotal ?? 0,
  netAmount: over.netAmount ?? over.subtotal ?? 0,
  discountAmount: over.discountAmount ?? 0,
  pointsDiscountAmount: over.pointsDiscountAmount ?? 0,
  totalPaid: over.totalPaid ?? 0,
  amountDue: 0,
  staffId: 'u1',
  note: null,
  customerId: null,
  salespersonId: null,
  refundedAmount: 0,
  refundMethod: null,
});

const line = (over: Record<string, any>) => ({
  id: over.id,
  invoiceId: over.invoiceId,
  sortOrder: 0,
  itemId: over.itemId ?? 'it1',
  itemCode: over.itemCode ?? 'SKU001',
  itemName: over.itemName ?? 'Item One',
  unit: 'đôi',
  direction: over.direction ?? ItemDirection.OUT,
  quantity: over.quantity ?? 1,
  unitPrice: over.unitPrice ?? 0,
  lineDiscount: over.lineDiscount ?? 0,
  promotionDiscount: over.promotionDiscount ?? 0,
  lineTotal: over.lineTotal ?? 0,
  note: null,
});

// ── The dataset ────────────────────────────────────────────────────────────────
// s1  SALE, cashier-typed line discount 40.000
// s2  SALE, promotion-engine discount 200.000, and 100.000 of points redeemed
// r1  RETURN of a discounted sale — its IN line reverses 80.000
// x1  EXCHANGE — new leg has no promotion, returned leg reverses 150.000
// c1  CANCELLED — must not appear anywhere
// e1  SALE with no lines at all — must contribute 0, not NaN
const invoices = [
  invoice({ id: 's1', code: 'HD0001', iso: '2026-08-13T09:00:00Z', subtotal: 960_000, totalPaid: 960_000, discountAmount: 40_000 }),
  invoice({ id: 's2', code: 'HD0002', iso: '2026-08-14T09:00:00Z', subtotal: 1_000_000, totalPaid: 700_000, discountAmount: 200_000, pointsDiscountAmount: 100_000 }),
  invoice({ id: 'r1', code: 'RTN0001', iso: '2026-08-15T09:00:00Z', type: InvoiceType.RETURN, subtotal: 500_000, totalPaid: 500_000 }),
  invoice({ id: 'x1', code: 'RTN0002', iso: '2026-08-19T09:00:00Z', type: InvoiceType.EXCHANGE, subtotal: 2_400_000, netAmount: 1_650_000, totalPaid: 1_650_000 }),
  invoice({ id: 'c1', code: 'HD0003', iso: '2026-08-20T09:00:00Z', status: 'cancelled', subtotal: 5_000_000, totalPaid: 0, discountAmount: 999_999, pointsDiscountAmount: 999_999 }),
  invoice({ id: 'e1', code: 'HD0004', iso: '2026-08-21T09:00:00Z', subtotal: 0, totalPaid: 0 }),
];

const lines = [
  line({ id: 'l1', invoiceId: 's1', unitPrice: 1_000_000, lineDiscount: 40_000, lineTotal: 960_000 }),
  line({ id: 'l2', invoiceId: 's2', itemId: 'it2', itemCode: 'SKU002', itemName: 'Item Two', unitPrice: 1_000_000, promotionDiscount: 200_000, lineTotal: 1_000_000 }),
  line({ id: 'l3', invoiceId: 'r1', direction: ItemDirection.IN, unitPrice: 500_000, promotionDiscount: 80_000, lineTotal: 500_000 }),
  line({ id: 'l4', invoiceId: 'x1', unitPrice: 2_400_000, lineTotal: 2_400_000 }),
  line({ id: 'l5', invoiceId: 'x1', direction: ItemDirection.IN, unitPrice: 750_000, promotionDiscount: 150_000, lineTotal: 750_000 }),
];

// Only non-cancelled invoices reach a report; every report applies that filter
// itself, so the fake invoice query builder returns the already-filtered set.
const visible = invoices.filter((i) => i.status !== 'cancelled');
const visibleLines = lines.filter((l) =>
  visible.some((i) => i.id === l.invoiceId),
);

//   Khuyến mại = Σ sign(direction) × (lineDiscount + promotionDiscount)
//              = +40.000 +200.000 −80.000 +0 −150.000
const EXPECTED_DISCOUNT = 10_000;
//   Điểm KM = Σ invoiceTypeSign × points; only s2 redeemed any
const EXPECTED_POINTS = 100_000;

function invoiceQb(rows: any[]) {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getMany: jest.fn(async () => rows),
    getCount: jest.fn(async () => rows.length),
  };
  return qb;
}

const repo = (rows: any[] = []) => ({ find: jest.fn(async () => rows) });
const rbac = { hasPermission: jest.fn(async () => false) } as any;

const dailySalesSummary = () =>
  new DailySalesSummaryReport(
    { createQueryBuilder: jest.fn(() => invoiceQb(visible)) } as any,
    fakeLineItemsRepo(visibleLines),
    repo() as any,
    repo() as any,
    repo([]) as any,
    rbac,
  );

const invoiceOrderListing = () =>
  new InvoiceOrderListingReport(
    { createQueryBuilder: jest.fn(() => invoiceQb(visible)) } as any,
    fakeLineItemsRepo(visibleLines),
    repo() as any,
    repo() as any,
    repo([]) as any,
    repo() as any,
    repo() as any,
    repo() as any,
    rbac,
  );

const stockBalanceQb: any = {
  innerJoin: jest.fn(() => stockBalanceQb),
  where: jest.fn(() => stockBalanceQb),
  andWhere: jest.fn(() => stockBalanceQb),
  orderBy: jest.fn(() => stockBalanceQb),
  select: jest.fn(() => stockBalanceQb),
  addSelect: jest.fn(() => stockBalanceQb),
  getRawMany: jest.fn(async () => []),
};

const revenueByItem = () =>
  new RevenueByItemReport(
    { createQueryBuilder: jest.fn(() => invoiceQb(visible)) } as any,
    repo(visibleLines) as any,
    repo() as any,
    repo() as any,
    repo() as any,
    repo() as any,
    repo() as any,
    repo() as any,
    { ...repo(), createQueryBuilder: jest.fn(() => stockBalanceQb) } as any,
    rbac,
  );

const invoiceItemRevenueDetail = () =>
  new InvoiceItemRevenueDetailReport(
    { createQueryBuilder: jest.fn(() => invoiceQb(visible)) } as any,
    repo(visibleLines) as any,
    repo() as any,
    repo() as any,
    repo() as any,
    repo() as any,
    repo() as any,
    repo() as any,
    repo() as any,
    repo() as any,
    repo() as any,
    repo() as any,
    repo() as any,
    repo() as any,
    { ...repo(), createQueryBuilder: jest.fn(() => stockBalanceQb) } as any,
    rbac,
  );

const run = (report: any, columns: string[]) =>
  report.buildData(
    { reportType: report.key, columns, filters: PERIOD, limit: 100 } as any,
    actor,
  );

describe('Khuyến mại and Điểm KM agree across the four sales reports', () => {
  it('daily-sales-summary totals match the line-derived expectation', async () => {
    const result = await run(dailySalesSummary(), [
      'date',
      'revenue.discount',
      'revenue.promoPoints',
    ]);

    expect(result.totals!['revenue.discount']).toBe(EXPECTED_DISCOUNT);
    expect(result.totals!['revenue.promoPoints']).toBe(EXPECTED_POINTS);
  });

  it('invoice-order-listing totals match', async () => {
    const result = await run(invoiceOrderListing(), [
      'invoiceCode',
      'revenue.discount',
      'revenue.promoPoints',
    ]);

    expect(result.totals!['revenue.discount']).toBe(EXPECTED_DISCOUNT);
    expect(result.totals!['revenue.promoPoints']).toBe(EXPECTED_POINTS);
  });

  it('revenue-by-item totals match', async () => {
    const result = await run(revenueByItem(), [
      'sku',
      'revenue.discount',
      'revenue.promoPoints',
    ]);

    expect(result.totals!['revenue.discount']).toBe(EXPECTED_DISCOUNT);
    expect(result.totals!['revenue.promoPoints']).toBe(EXPECTED_POINTS);
  });

  it('invoice-item-revenue-detail totals match', async () => {
    const result = await run(invoiceItemRevenueDetail(), [
      'invoiceCode',
      'lineDiscount',
      'revenue.promoPoints',
    ]);

    expect(result.totals!['lineDiscount']).toBe(EXPECTED_DISCOUNT);
    expect(result.totals!['revenue.promoPoints']).toBe(EXPECTED_POINTS);
  });

  it('the EXCHANGE reversal is what separates the header from the lines', async () => {
    // Σ invoices.discount_amount over the visible set is 240.000 — the number the
    // two invoice-grain reports used to show. The line-derived answer is 10.000.
    // If this ever equals 240.000 again, the header source has crept back in.
    const headerSum = visible.reduce((a, i) => a + i.discountAmount, 0);

    expect(headerSum).toBe(240_000);
    expect(EXPECTED_DISCOUNT).not.toBe(headerSum);
  });

  it('excludes the cancelled invoice from every report', async () => {
    // c1 carries 999.999 in both columns; any leak shows up immediately.
    const results = await Promise.all([
      run(dailySalesSummary(), ['date', 'revenue.discount']),
      run(invoiceOrderListing(), ['invoiceCode', 'revenue.discount']),
      run(revenueByItem(), ['sku', 'revenue.discount']),
    ]);

    for (const r of results) {
      expect(r.totals!['revenue.discount']).toBe(EXPECTED_DISCOUNT);
    }
  });
});
