import {
  INVOICE_REPORT_COLUMN_DESCS,
  INVOICE_REPORT_COLUMN_LABELS_VI,
} from '@erp/shared-interfaces';
import {
  INVOICE_REPORT_SUMMARY_COLUMNS,
  isDynamicColumnKey,
  isKnownSummaryColumn,
  parseDynamicColumnKey,
} from './invoice-report.columns';
import { DailySalesSummaryReport } from './reports/daily-sales-summary.report';
import { InvoiceItemRevenueDetailReport } from './reports/invoice-item-revenue-detail.report';

const UUID = '11111111-1111-1111-1111-111111111111';
const actor = { userId: 'u1', organizationId: 'org-1', branchId: 'b1', roles: [] } as any;

describe('invoice-report.columns', () => {
  it('every fixed column has a VI label (registry ⟷ labels in sync)', () => {
    for (const c of INVOICE_REPORT_SUMMARY_COLUMNS) {
      expect(INVOICE_REPORT_COLUMN_LABELS_VI[c.key]).toBeDefined();
    }
  });

  it('isKnownSummaryColumn', () => {
    expect(isKnownSummaryColumn('revenue.goods')).toBe(true);
    expect(isKnownSummaryColumn('revenue.total')).toBe(true);
    expect(isKnownSummaryColumn('nope')).toBe(false);
  });

  it('isDynamicColumnKey / parseDynamicColumnKey', () => {
    expect(isDynamicColumnKey(`payment.method.${UUID}`)).toBe(true);
    expect(isDynamicColumnKey('payment.method.notuuid')).toBe(false);
    expect(parseDynamicColumnKey(`payment.method.${UUID}`)).toEqual({
      accountId: UUID,
    });
    expect(parseDynamicColumnKey('revenue.goods')).toBeNull();
  });

  // Guards ADR-01 (revenue-by-item-misa-parity): quantity/unitPrice/revenue.total
  // got a per-report label override for revenue-by-item, but the shared map the
  // other three invoice reports read must keep its original values. If this
  // breaks, someone edited INVOICE_REPORT_COLUMN_LABELS_VI directly instead of
  // adding to the override map in the same file.
  it('keeps the shared labels the other three invoice reports rely on', () => {
    expect(INVOICE_REPORT_COLUMN_LABELS_VI.quantity).toBe('Số lượng');
    expect(INVOICE_REPORT_COLUMN_LABELS_VI.unitPrice).toBe('Đơn giá');
    expect(INVOICE_REPORT_COLUMN_LABELS_VI['revenue.total']).toBe('Tổng');
  });

  it('keeps the daily-sales-summary formula for revenue.total', () => {
    expect(INVOICE_REPORT_COLUMN_DESCS['revenue.total']).toBe('(1)=(3)-(5)-(14)');
  });

  it('daily-sales-summary.buildColumns still resolves revenue.total to the shared label + formula', async () => {
    const report = new DailySalesSummaryReport(
      { createQueryBuilder: jest.fn() } as any,
      { createQueryBuilder: jest.fn() } as any,
      { find: jest.fn() } as any,
      { find: jest.fn() } as any,
      { find: jest.fn(async () => []) } as any,
      { hasPermission: jest.fn(async () => false) } as any,
    );
    const headers = await report.buildColumns(actor);
    const revenueTotal = headers.find((h) => h.col === 'revenue.total');
    expect(revenueTotal?.name).toBe('Tổng');
    expect(revenueTotal?.desc).toBe('(1)=(3)-(5)-(14)');
  });

  it('invoice-item-revenue-detail.buildColumns still resolves quantity/unitPrice to the shared labels', async () => {
    const stubs = Array.from({ length: 13 }, () => ({}) as any);
    const report = new InvoiceItemRevenueDetailReport(
      ...(stubs as unknown as ConstructorParameters<typeof InvoiceItemRevenueDetailReport>),
    );
    const headers = await report.buildColumns(actor);
    const byCol = new Map(headers.map((h) => [h.col, h.name]));
    expect(byCol.get('quantity')).toBe('Số lượng');
    expect(byCol.get('unitPrice')).toBe('Đơn giá');
  });
});
