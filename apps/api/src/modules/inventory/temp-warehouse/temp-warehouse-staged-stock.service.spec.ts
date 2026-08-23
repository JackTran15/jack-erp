import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import {
  TempWarehouseDirection,
  TempWarehouseLineStatus,
  TempWarehouseSessionStatus,
} from '@erp/shared-interfaces';
import { TempWarehouseStagedStockService } from './temp-warehouse-staged-stock.service';

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  itemId: 'I1',
  quantity: '3',
  sourceIsMainStorage: false,
  destinationIsMainStorage: true,
  ...over,
});

describe('TempWarehouseStagedStockService.getBranchDelta', () => {
  let service: TempWarehouseStagedStockService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TempWarehouseStagedStockService,
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();
    service = module.get(TempWarehouseStagedStockService);
  });

  it('returns an empty map when the branch has no open staged lines', async () => {
    query.mockResolvedValue([]);

    const delta = await service.getBranchDelta('branch-1', 'org-1');

    expect(delta.size).toBe(0);
  });

  it('reads the whole branch with a single query', async () => {
    query.mockResolvedValue([]);

    await service.getBranchDelta('branch-1', 'org-1');

    expect(query).toHaveBeenCalledTimes(1);
  });

  // The WHERE clause is what keeps closed sessions, superseded lines and other
  // branches out of the sum, so it is asserted directly: dropping any of these
  // filters silently inflates every threshold in the POS.
  it('restricts to the branch, to ACTIVE sessions and to ACTIVE lines', async () => {
    query.mockResolvedValue([]);

    await service.getBranchDelta('branch-1', 'org-1');

    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual([
      'org-1',
      'branch-1',
      TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
      TempWarehouseSessionStatus.ACTIVE,
      TempWarehouseLineStatus.ACTIVE,
    ]);
    expect(sql).toContain('s.branch_id = $2');
    expect(sql).toContain('s.status = $4');
    expect(sql).toContain('s.deleted_at IS NULL');
    expect(sql).toContain('l.status = $5');
  });

  it('adds a line staged into a main storage', async () => {
    query.mockResolvedValue([
      row({ sourceIsMainStorage: false, destinationIsMainStorage: true }),
    ]);

    const delta = await service.getBranchDelta('branch-1', 'org-1');

    expect(delta.get('I1')).toBe(3);
  });

  it('subtracts a line staged out of a main storage', async () => {
    query.mockResolvedValue([
      row({
        quantity: '1',
        sourceIsMainStorage: true,
        destinationIsMainStorage: false,
      }),
    ]);

    const delta = await service.getBranchDelta('branch-1', 'org-1');

    expect(delta.get('I1')).toBe(-1);
  });

  it('nets both directions of the same item', async () => {
    query.mockResolvedValue([
      row({ quantity: '3', sourceIsMainStorage: false, destinationIsMainStorage: true }),
      row({ quantity: '1', sourceIsMainStorage: true, destinationIsMainStorage: false }),
    ]);

    const delta = await service.getBranchDelta('branch-1', 'org-1');

    expect(delta.get('I1')).toBe(2);
  });

  it('sums several staged lines of the same item', async () => {
    query.mockResolvedValue([
      row({ quantity: '3' }),
      row({ quantity: '2' }),
    ]);

    const delta = await service.getBranchDelta('branch-1', 'org-1');

    expect(delta.get('I1')).toBe(5);
  });

  it('keeps items apart', async () => {
    query.mockResolvedValue([
      row({ itemId: 'I1', quantity: '3' }),
      row({ itemId: 'I2', quantity: '4' }),
    ]);

    const delta = await service.getBranchDelta('branch-1', 'org-1');

    expect(delta.get('I1')).toBe(3);
    expect(delta.get('I2')).toBe(4);
  });

  // A session may be pinned to arbitrary storages, so a line can move stock
  // from one main storage to another. stock_balances already counts it on the
  // showroom side; adjusting would count it twice.
  it('ignores a line that stays inside the main storages', async () => {
    query.mockResolvedValue([
      row({ sourceIsMainStorage: true, destinationIsMainStorage: true }),
    ]);

    const delta = await service.getBranchDelta('branch-1', 'org-1');

    expect(delta.size).toBe(0);
  });

  it('ignores a line that never touches a main storage', async () => {
    query.mockResolvedValue([
      row({ sourceIsMainStorage: false, destinationIsMainStorage: false }),
    ]);

    const delta = await service.getBranchDelta('branch-1', 'org-1');

    expect(delta.size).toBe(0);
  });

  it('ignores a zero-quantity line', async () => {
    query.mockResolvedValue([row({ quantity: '0' })]);

    const delta = await service.getBranchDelta('branch-1', 'org-1');

    expect(delta.size).toBe(0);
  });

  // A shelf that was deleted (or belongs to another branch) leaves both flags
  // false, which reads as "no effect on this branch's showroom" rather than as
  // a crash.
  it('treats an unresolvable location as no effect', async () => {
    query.mockResolvedValue([
      row({ sourceIsMainStorage: false, destinationIsMainStorage: false, quantity: '9' }),
    ]);

    const delta = await service.getBranchDelta('branch-1', 'org-1');

    expect(delta.size).toBe(0);
  });
});
