import { StockSummaryService } from './stock-summary.service';

function createQueryBuilder(rows: unknown[] = []) {
  return {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    getQueryAndParameters: jest.fn().mockReturnValue(['SELECT 1', []]),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
}

describe('StockSummaryService', () => {
  it('calculates period values from startDate/endDate while preserving movement filters', async () => {
    const row = {
      item_id: '11111111-1111-4111-8111-111111111111',
      item_code: 'SKU-1',
      item_name: 'Hàng hóa 1',
      item_unit: 'Cái',
      item_brand: null,
      item_is_active: true,
      category_name: null,
      storage_id: '22222222-2222-4222-8222-222222222222',
      storage_name: 'Kho 1',
      branch_id: '33333333-3333-4333-8333-333333333333',
      quantity: '9',
      last_movement_at: null,
    };
    const qb = createQueryBuilder([row]);
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ total: 1, total_quantity: '9' }])
        .mockResolvedValueOnce([
          {
            item_id: row.item_id,
            storage_id: row.storage_id,
            opening_qty: '5',
            opening_value: '50',
            in_qty: '6',
            in_value: '60',
            out_qty: '2',
            out_value: '20',
          },
        ]),
    };
    const service = new StockSummaryService({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      manager,
    } as never);

    const result = await service.getSummary({
      organizationId: '44444444-4444-4444-8444-444444444444',
      branchId: '33333333-3333-4333-8333-333333333333',
      movementFrom: '2026-05-01',
      movementTo: '2026-05-31',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });

    expect(qb.andWhere).toHaveBeenCalledWith(
      'sb.branch_id = :branchId',
      { branchId: '33333333-3333-4333-8333-333333333333' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'sb.last_movement_at >= :movementFrom',
      { movementFrom: '2026-05-01' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'sb.last_movement_at < :movementToPlus1',
      { movementToPlus1: '2026-06-01' },
    );
    expect(manager.query).toHaveBeenLastCalledWith(
      expect.stringContaining('sle.posted_at < $1'),
      expect.arrayContaining([
        '2026-06-01',
        '2026-07-01',
        '44444444-4444-4444-8444-444444444444',
      ]),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        openingQty: 5,
        inQty: 6,
        outQty: 2,
        closingQty: 9,
        closingValue: 90,
      }),
    );
  });

  it('returns organization-scoped ledger details for one item and storage', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            reference_type: 'GOODS_RECEIPT',
            reference_id: '55555555-5555-4555-8555-555555555555',
            posted_at: new Date('2026-06-10T00:00:00.000Z'),
            quantity: '3',
            unit_cost: '12.5',
            line_value: '37.5',
            notes: 'Nhập hàng',
          },
        ])
        .mockResolvedValueOnce([{ total: 1 }]),
    };
    const service = new StockSummaryService({ manager } as never);

    const result = await service.getDetails({
      organizationId: '44444444-4444-4444-8444-444444444444',
      branchId: '33333333-3333-4333-8333-333333333333',
      itemId: '11111111-1111-4111-8111-111111111111',
      storageId: '22222222-2222-4222-8222-222222222222',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      page: 1,
      pageSize: 20,
    });

    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('sle.organization_id = $1'),
      [
        '44444444-4444-4444-8444-444444444444',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
        '2026-06-01',
        '2026-07-01',
        20,
        0,
      ],
    );
    expect(result).toEqual({
      data: [
        {
          referenceType: 'GOODS_RECEIPT',
          referenceId: '55555555-5555-4555-8555-555555555555',
          postedAt: '2026-06-10T00:00:00.000Z',
          quantity: 3,
          unitCost: 12.5,
          lineValue: 37.5,
          notes: 'Nhập hàng',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });
});
