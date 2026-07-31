import { REVENUE_BY_ITEM_ALL_TIME_FROM, ReportGroupBy } from '@erp/shared-interfaces';
import {
  GetInvoiceReportDocumentHandler,
  invoiceFilterSummary,
} from './get-invoice-report-document.handler';
import { GetInvoiceReportDocumentQuery } from './get-invoice-report-document.query';

// Guards ADR-04 (revenue-by-item-misa-parity, superseded but the label fix
// stands): GROUP_BY_LABELS_VI was inverted against resolveGrain — PARENT
// groups by the parent product ("Mẫu mã"), ITEM keeps one row per
// SKU/variant ("Hàng hóa"). Every revenue-by-item export's parameter line was
// naming the wrong grain regardless of which value the user picked.
describe('invoiceFilterSummary — statBy grain label', () => {
  it('labels PARENT as "Mẫu mã"', () => {
    const lines = invoiceFilterSummary({
      issuedAt: {},
      statBy: ReportGroupBy.PARENT,
    } as any);
    expect(lines.join('; ')).toContain('Nhóm theo: Mẫu mã');
  });

  it('labels ITEM as "Hàng hóa"', () => {
    const lines = invoiceFilterSummary({
      issuedAt: {},
      statBy: ReportGroupBy.ITEM,
    } as any);
    expect(lines.join('; ')).toContain('Nhóm theo: Hàng hóa');
  });

  it('labels GROUP as "Nhóm hàng hóa"', () => {
    const lines = invoiceFilterSummary({
      issuedAt: {},
      statBy: ReportGroupBy.GROUP,
    } as any);
    expect(lines.join('; ')).toContain('Nhóm theo: Nhóm hàng hóa');
  });
});

const actor = { userId: 'u1', organizationId: 'org-1', branchId: 'b1', roles: [] } as any;

function makeHandler() {
  const revenueByItemParams = { build: jest.fn(async () => ['MISA-STYLE LINE']) };
  const exportService = {
    prepareExport: jest.fn(async (_registry: unknown, _dto: unknown, _actor: unknown, context: any) => ({
      header: { title: context.title, branch: null, subtitleLines: context.subtitleLines },
      columns: [],
      fetcher: { drain: jest.fn(async () => null) },
      onComplete: jest.fn(),
    })),
  };
  const handler = new GetInvoiceReportDocumentHandler(
    {} as any,
    exportService as any,
    revenueByItemParams as any,
  );
  return { handler, exportService, revenueByItemParams };
}

// Guards ADR-02: only revenue-by-item goes through RevenueByItemParamsBuilder;
// the other three invoice reports must keep flowing through the pure
// invoiceFilterSummary and never call the builder.
describe('GetInvoiceReportDocumentHandler.execute — builder dispatch by reportType', () => {
  it('uses RevenueByItemParamsBuilder for revenue-by-item', async () => {
    const { handler, exportService, revenueByItemParams } = makeHandler();
    const dto = { reportType: 'revenue-by-item', filters: { issuedAt: {} } } as any;

    const prepared = await handler.execute(new GetInvoiceReportDocumentQuery(dto, actor));

    expect(revenueByItemParams.build).toHaveBeenCalledWith(dto.filters, actor);
    expect(prepared.header.subtitleLines).toEqual(['MISA-STYLE LINE']);
  });

  it.each(['daily-sales-summary', 'invoice-order-listing', 'invoice-item-revenue-detail'])(
    'does not call RevenueByItemParamsBuilder for %s',
    async (reportType) => {
      const { handler, revenueByItemParams } = makeHandler();
      const dto = { reportType, filters: { issuedAt: {} } } as any;

      const prepared = await handler.execute(new GetInvoiceReportDocumentQuery(dto, actor));

      expect(revenueByItemParams.build).not.toHaveBeenCalled();
      // No filters beyond issuedAt were set, so invoiceFilterSummary adds nothing.
      expect(prepared.header.subtitleLines).toEqual([]);
    },
  );

  it('still names an active filter for the other three reports (AC-16 regression guard)', async () => {
    const { handler, revenueByItemParams } = makeHandler();
    const dto = {
      reportType: 'daily-sales-summary',
      filters: { issuedAt: {}, statDateType: 'invoice_date' },
    } as any;

    const prepared = await handler.execute(new GetInvoiceReportDocumentQuery(dto, actor));

    expect(revenueByItemParams.build).not.toHaveBeenCalled();
    expect(prepared.header.subtitleLines).toEqual(['Thống kê theo: Ngày hóa đơn']);
  });
});

// pos-web's "Toàn bộ" preset substitutes REVENUE_BY_ITEM_ALL_TIME_FROM as
// `issuedAt.from` because revenue-by-item's query-safety guard 400s on an
// unbounded request — the document must not leak that implementation detail
// as a literal "Từ ngày: 01/01/2000" line.
describe('GetInvoiceReportDocumentHandler.execute — revenue-by-item all-time sentinel', () => {
  it('suppresses the date line when issuedAt.from is the sentinel and to is unset', async () => {
    const { handler } = makeHandler();
    const dto = {
      reportType: 'revenue-by-item',
      filters: { issuedAt: { from: REVENUE_BY_ITEM_ALL_TIME_FROM } },
    } as any;

    const prepared = await handler.execute(new GetInvoiceReportDocumentQuery(dto, actor));

    expect(prepared.header.subtitleLines).toEqual(['MISA-STYLE LINE']);
  });

  it('keeps the date line for a real from date', async () => {
    const { handler } = makeHandler();
    const dto = {
      reportType: 'revenue-by-item',
      filters: { issuedAt: { from: '2026-01-01' } },
    } as any;

    const prepared = await handler.execute(new GetInvoiceReportDocumentQuery(dto, actor));

    expect(prepared.header.subtitleLines).toEqual([
      'Từ ngày: 01/01/2026 Đến ngày: —',
      'MISA-STYLE LINE',
    ]);
  });

  it('keeps the date line when the sentinel from is paired with a real to (not the "Toàn bộ" shape)', async () => {
    const { handler } = makeHandler();
    const dto = {
      reportType: 'revenue-by-item',
      filters: { issuedAt: { from: REVENUE_BY_ITEM_ALL_TIME_FROM, to: '2026-01-31' } },
    } as any;

    const prepared = await handler.execute(new GetInvoiceReportDocumentQuery(dto, actor));

    expect(prepared.header.subtitleLines[0]).toMatch(/^Từ ngày: 01\/01\/2000 Đến ngày:/);
  });

  it('does not suppress the sentinel-shaped date for other report types (revenue-by-item only)', async () => {
    const { handler } = makeHandler();
    const dto = {
      reportType: 'daily-sales-summary',
      filters: { issuedAt: { from: REVENUE_BY_ITEM_ALL_TIME_FROM } },
    } as any;

    const prepared = await handler.execute(new GetInvoiceReportDocumentQuery(dto, actor));

    expect(prepared.header.subtitleLines[0]).toMatch(/^Từ ngày: 01\/01\/2000 Đến ngày:/);
  });
});
