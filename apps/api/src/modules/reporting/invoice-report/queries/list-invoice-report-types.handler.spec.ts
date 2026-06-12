import { ListInvoiceReportTypesHandler } from './list-invoice-report-types.handler';

describe('ListInvoiceReportTypesHandler', () => {
  it('returns active report types from the catalogue as {key, name}', async () => {
    const find = jest.fn(async () => [
      { key: 'daily-sales-summary', name: 'Tổng hợp bán hàng theo ngày' },
    ]);
    const handler = new ListInvoiceReportTypesHandler({ find } as any);

    const result = await handler.execute();

    expect(find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { sortOrder: 'ASC', key: 'ASC' },
    });
    expect(result).toEqual({
      types: [
        { key: 'daily-sales-summary', name: 'Tổng hợp bán hàng theo ngày' },
      ],
    });
  });
});
