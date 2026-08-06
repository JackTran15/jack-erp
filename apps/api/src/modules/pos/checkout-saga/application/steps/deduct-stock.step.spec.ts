import { DeductStockStep } from './deduct-stock.step';
import { CheckoutContext } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    invoice: { id: 'inv-1', branchId: 'b1' } as any,
    items: [
      { itemId: 'item-1', locationId: 'loc-1', quantity: 2 } as any,
      { itemId: 'item-2', locationId: 'loc-2', quantity: 1 } as any,
    ],
    ...overrides,
  };
}

describe('DeductStockStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    const step = new DeductStockStep({} as any, {} as any);
    await expect(step.execute(ctx())).rejects.toThrow(
      'deduct-stock ran outside a transaction',
    );
  });

  it('throws a plain Error when invoice/items are missing', async () => {
    const step = new DeductStockStep({} as any, {} as any);
    await expect(
      step.execute(ctx({ manager: {} as any, items: undefined })),
    ).rejects.toThrow('deduct-stock ran before its prerequisite steps populated the context');
  });

  it('is a no-op on a replayed run', async () => {
    const stockLedgerService = { recordBatchMovements: jest.fn() };
    const itemCostSnapshotService = { snapshotOne: jest.fn() };
    await new DeductStockStep(stockLedgerService as any, itemCostSnapshotService as any).execute(
      ctx({ replayed: true, manager: {} as any }),
    );
    expect(stockLedgerService.recordBatchMovements).not.toHaveBeenCalled();
    expect(itemCostSnapshotService.snapshotOne).not.toHaveBeenCalled();
  });

  it('snapshots cost once per distinct itemId, then writes one batch call with the manager', async () => {
    const stockLedgerService = { recordBatchMovements: jest.fn().mockResolvedValue([]) };
    const itemCostSnapshotService = {
      snapshotOne: jest.fn().mockImplementation((_org: string, itemId: string) =>
        Promise.resolve(itemId === 'item-1' ? 1000 : 2000),
      ),
    };
    const c = ctx({
      manager: { __fake: 'manager' } as any,
      // Repeats item-1 on a second line — must snapshot it only once.
      items: [
        { itemId: 'item-1', locationId: 'loc-1', quantity: 2 } as any,
        { itemId: 'item-1', locationId: 'loc-1', quantity: 3 } as any,
        { itemId: 'item-2', locationId: 'loc-2', quantity: 1 } as any,
      ],
    });

    await new DeductStockStep(stockLedgerService as any, itemCostSnapshotService as any).execute(c);

    expect(itemCostSnapshotService.snapshotOne).toHaveBeenCalledTimes(2);
    expect(itemCostSnapshotService.snapshotOne).toHaveBeenCalledWith('o1', 'item-1');
    expect(itemCostSnapshotService.snapshotOne).toHaveBeenCalledWith('o1', 'item-2');

    expect(stockLedgerService.recordBatchMovements).toHaveBeenCalledTimes(1);
    const [movements, manager] = stockLedgerService.recordBatchMovements.mock.calls[0];
    expect(manager).toBe(c.manager);
    expect(movements).toEqual([
      expect.objectContaining({
        itemId: 'item-1',
        locationId: 'loc-1',
        branchId: 'b1',
        organizationId: 'o1',
        movementType: 'SALE_ISSUE',
        quantity: -2,
        referenceType: 'INVOICE',
        referenceId: 'inv-1',
        unitCost: 1000,
        skipInactiveStorageGuard: true,
      }),
      expect.objectContaining({ itemId: 'item-1', quantity: -3, unitCost: 1000 }),
      expect.objectContaining({ itemId: 'item-2', quantity: -1, unitCost: 2000 }),
    ]);
  });

  it('deducts a gift line (T-04-04) exactly like an ordinary line, with a non-zero cost', async () => {
    const stockLedgerService = { recordBatchMovements: jest.fn().mockResolvedValue([]) };
    const itemCostSnapshotService = {
      snapshotOne: jest.fn().mockResolvedValue(9000), // gift item has a real cost
    };
    const c = ctx({
      manager: { __fake: 'manager' } as any,
      // 3 ordinary lines + 1 gift line, as persist-invoice (T-04-04) would
      // have left ctx.items by the time this step runs.
      items: [
        { itemId: 'item-1', locationId: 'loc-1', quantity: 2 } as any,
        { itemId: 'item-2', locationId: 'loc-2', quantity: 1 } as any,
        { itemId: 'item-3', locationId: 'loc-3', quantity: 5 } as any,
        {
          itemId: 'gift-item-1',
          locationId: 'loc-gift',
          quantity: 1,
          isGift: true,
          promotionProgramId: 'prog-1',
        } as any,
      ],
    });

    await new DeductStockStep(stockLedgerService as any, itemCostSnapshotService as any).execute(c);

    const [movements] = stockLedgerService.recordBatchMovements.mock.calls[0];
    expect(movements).toHaveLength(4); // 3 ordinary + 1 gift, no duplicate
    expect(movements).toContainEqual(
      expect.objectContaining({
        itemId: 'gift-item-1',
        locationId: 'loc-gift',
        movementType: 'SALE_ISSUE',
        quantity: -1,
        unitCost: 9000, // not 0 — a gift still has a cost, it just has no revenue
      }),
    );
  });

  it('propagates a recordBatchMovements failure unchanged, rolling back the checkout', async () => {
    const boom = new Error('insufficient stock at location');
    const stockLedgerService = { recordBatchMovements: jest.fn().mockRejectedValue(boom) };
    const itemCostSnapshotService = { snapshotOne: jest.fn().mockResolvedValue(0) };
    await expect(
      new DeductStockStep(stockLedgerService as any, itemCostSnapshotService as any).execute(
        ctx({ manager: {} as any }),
      ),
    ).rejects.toBe(boom);
  });
});
