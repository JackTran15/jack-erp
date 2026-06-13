import { StockPeriodService } from './stock-period.service';

describe('StockPeriodService pending transfers', () => {
  it('maps pending transfer quantities and values onto source and destination branch rows', async () => {
    const sourceRow = {
      item_id: 'item-1',
      sku: 'SKU-1',
      item_name: 'Hàng 1',
      unit: 'Cái',
      category_id: null,
      category_name: null,
      branch_id: 'branch-A',
      branch_code: null,
      branch_name: 'A',
      opening_qty: '10',
      opening_value: '1000',
      in_qty: '0',
      in_value: '0',
      out_qty: '4',
      out_value: '400',
      closing_qty: '6',
      closing_value: '600',
    };
    const destinationRow = {
      ...sourceRow,
      branch_id: 'branch-B',
      branch_name: 'B',
      opening_qty: '0',
      opening_value: '0',
      out_qty: '0',
      out_value: '0',
      closing_qty: '0',
      closing_value: '0',
    };
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([sourceRow, destinationRow])
        .mockResolvedValueOnce([{ total: 2 }])
        .mockResolvedValueOnce([
          {
            item_id: 'item-1',
            source_location_id: 'loc-A',
            source_branch_id: 'branch-A',
            destination_branch_id: 'branch-B',
            quantity: '4',
            value: '400',
          },
        ]),
    };
    const service = new StockPeriodService(dataSource as never);

    const result = await service.aggregate({
      organizationId: 'org-1',
      startDate: new Date('2026-06-01T00:00:00.000Z'),
      endDate: new Date('2026-07-01T00:00:00.000Z'),
      groupBy: 'item_branch',
      page: 1,
      pageSize: 20,
    });

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        transferOutQty: 4,
        transferOutValue: 400,
        incomingQty: 0,
      }),
    );
    expect(result.data[1]).toEqual(
      expect.objectContaining({
        transferOutQty: 0,
        incomingQty: 4,
        incomingValue: 400,
      }),
    );
  });
});
