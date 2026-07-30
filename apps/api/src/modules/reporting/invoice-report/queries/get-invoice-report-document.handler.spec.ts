import { ReportGroupBy } from '@erp/shared-interfaces';
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
