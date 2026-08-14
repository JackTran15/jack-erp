import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DomainEvent, DomainEventType, StockMovementType } from '@erp/shared-interfaces';
import { StockReturnConsumer } from './stock-return.consumer';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { StockLedgerEntryEntity } from '../ledger/stock-ledger-entry.entity';
import { ItemCostSnapshotService } from '../location/item-cost-snapshot.service';
import { InvoiceCancelledPayload } from '../../pos/publishers/invoice-cancelled.publisher';
import { resolveBranchItemLocations } from '../../pos/services/resolve-branch-item-locations';

jest.mock('../../pos/services/resolve-branch-item-locations');

const resolveLocationsMock = resolveBranchItemLocations as jest.MockedFunction<
  typeof resolveBranchItemLocations
>;

const buildEvent = (
  overrides: Partial<InvoiceCancelledPayload> = {},
): DomainEvent<InvoiceCancelledPayload> => ({
  eventId: 'evt-1',
  eventType: DomainEventType.INVOICE_CANCELLED,
  timestamp: '2026-05-11T00:00:00Z',
  organizationId: 'org-1',
  branchId: 'branch-1',
  correlationId: 'inv-1',
  payload: {
    invoiceId: 'inv-1',
    documentNumber: 'INV-001',
    reason: 'mistake',
    branchId: 'branch-1',
    items: [
      { itemId: 'item-A', locationId: 'loc-1', quantity: 2 },
      { itemId: 'item-B', locationId: 'loc-1', quantity: 1 },
    ],
    organizationId: 'org-1',
    actorId: 'user-1',
    ...overrides,
  },
});

describe('StockReturnConsumer', () => {
  let consumer: StockReturnConsumer;
  let ledgerRepo: { findOne: jest.Mock; find: jest.Mock; manager: never };
  let itemCostSnapshotService: { snapshotCosts: jest.Mock };
  let stockLedgerService: { recordBatchMovements: jest.Mock };

  beforeEach(async () => {
    ledgerRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      manager: {} as never,
    };
    resolveLocationsMock.mockReset();
    resolveLocationsMock.mockResolvedValue(
      new Map<string, string>([
        ['item-A', 'showroom-shelf-A'],
        ['item-B', 'showroom-default'],
      ]),
    );
    itemCostSnapshotService = {
      snapshotCosts: jest.fn().mockResolvedValue(
        new Map<string, number>([
          ['item-A', 10],
          ['item-B', 5.5],
        ]),
      ),
    };
    stockLedgerService = { recordBatchMovements: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockReturnConsumer,
        { provide: getRepositoryToken(StockLedgerEntryEntity), useValue: ledgerRepo },
        { provide: StockLedgerService, useValue: stockLedgerService },
        { provide: ItemCostSnapshotService, useValue: itemCostSnapshotService },
      ],
    }).compile();

    consumer = module.get(StockReturnConsumer);
  });

  it('records RETURN_IN movements for each item on first run', async () => {
    await consumer.handle(buildEvent());

    expect(stockLedgerService.recordBatchMovements).toHaveBeenCalledTimes(1);
    const movements = stockLedgerService.recordBatchMovements.mock.calls[0][0];
    expect(movements).toHaveLength(2);
    expect(movements[0]).toEqual(
      expect.objectContaining({
        itemId: 'item-A',
        movementType: StockMovementType.RETURN_IN,
        quantity: 2,
        referenceType: 'INVOICE_CANCEL',
        referenceId: 'inv-1',
        // unit_cost snapshot from items.purchase_price (10.00). Service then
        // derives line_value = quantity * unitCost = 2 * 10 = 20 (signed +).
        unitCost: 10,
        // Showroom shelf, not the loc-1 the line was picked from.
        locationId: 'showroom-shelf-A',
      }),
    );
    expect(movements[1]).toEqual(
      expect.objectContaining({ itemId: 'item-B', unitCost: 5.5 }),
    );
  });

  it('skips per-item when a ledger entry already exists (idempotency)', async () => {
    ledgerRepo.findOne.mockImplementation(({ where }: any) =>
      where.itemId === 'item-A' ? { id: 'existing' } : null,
    );

    await consumer.handle(buildEvent());

    const movements = stockLedgerService.recordBatchMovements.mock.calls[0][0];
    expect(movements).toHaveLength(1);
    expect(movements[0].itemId).toBe('item-B');
  });

  it('does not call recordBatchMovements when every item is already processed', async () => {
    ledgerRepo.findOne.mockResolvedValue({ id: 'existing' });

    await consumer.handle(buildEvent());

    expect(stockLedgerService.recordBatchMovements).not.toHaveBeenCalled();
  });

  it('skips when branchId is missing in payload', async () => {
    await consumer.handle(buildEvent({ branchId: undefined }));
    expect(stockLedgerService.recordBatchMovements).not.toHaveBeenCalled();
  });

  it('routes returns to the showroom, ignoring the location the line was sold from', async () => {
    await consumer.handle(buildEvent());

    expect(resolveLocationsMock).toHaveBeenCalledWith(
      expect.anything(),
      ['item-A', 'item-B'],
      expect.objectContaining({ organizationId: 'org-1', branchId: 'branch-1' }),
      { showroomOnly: true },
    );
    const movements = stockLedgerService.recordBatchMovements.mock.calls[0][0];
    expect(movements.map((m: { locationId: string }) => m.locationId)).toEqual([
      'showroom-shelf-A',
      'showroom-default',
    ]);
  });

  it('falls back to the showroom default location for a warehouse-only item', async () => {
    // resolveBranchItemLocations already applies that fallback; what matters
    // here is that the consumer uses its answer rather than item.locationId.
    resolveLocationsMock.mockResolvedValue(
      new Map<string, string>([
        ['item-A', 'showroom-default'],
        ['item-B', 'showroom-default'],
      ]),
    );

    await consumer.handle(buildEvent());

    const movements = stockLedgerService.recordBatchMovements.mock.calls[0][0];
    expect(movements.every((m: { locationId: string }) => m.locationId === 'showroom-default')).toBe(true);
  });

  it('skips an item with no showroom location instead of crediting the warehouse', async () => {
    resolveLocationsMock.mockResolvedValue(
      new Map<string, string>([['item-B', 'showroom-default']]),
    );

    await consumer.handle(buildEvent());

    const movements = stockLedgerService.recordBatchMovements.mock.calls[0][0];
    expect(movements).toHaveLength(1);
    expect(movements[0].itemId).toBe('item-B');
  });

  it('records nothing when no item resolves to a showroom location', async () => {
    resolveLocationsMock.mockResolvedValue(new Map<string, string>());

    await consumer.handle(buildEvent());

    expect(stockLedgerService.recordBatchMovements).not.toHaveBeenCalled();
  });

  it('propagates errors so Kafka retries', async () => {
    stockLedgerService.recordBatchMovements.mockRejectedValue(new Error('balance lock'));
    await expect(consumer.handle(buildEvent())).rejects.toThrow('balance lock');
  });

  describe('cancelled return/exchange (directional lines)', () => {
    // The exchange from the bug report: customer handed back item-A and took
    // item-B. Cancelling hands item-A back to them and takes item-B back.
    const exchangeEvent = () =>
      buildEvent({
        items: [
          { itemId: 'item-A', locationId: 'loc-1', quantity: 2, direction: 'IN' },
          { itemId: 'item-B', locationId: 'loc-1', quantity: 1, direction: 'OUT' },
        ],
      });

    it('sends a returned (IN) line back out of stock and brings an OUT line back in', async () => {
      await consumer.handle(exchangeEvent());

      const movements = stockLedgerService.recordBatchMovements.mock.calls[0][0];
      expect(movements).toHaveLength(2);
      expect(movements[0]).toEqual(
        expect.objectContaining({
          itemId: 'item-A',
          movementType: StockMovementType.SALE_ISSUE,
          quantity: -2,
          // Deducted from where the return-in put it, not the showroom.
          locationId: 'loc-1',
        }),
      );
      expect(movements[1]).toEqual(
        expect.objectContaining({
          itemId: 'item-B',
          movementType: StockMovementType.RETURN_IN,
          quantity: 1,
          locationId: 'showroom-default',
        }),
      );
    });

    it('only resolves showroom locations for the inbound lines', async () => {
      await consumer.handle(exchangeEvent());

      expect(resolveLocationsMock).toHaveBeenCalledWith(
        expect.anything(),
        ['item-B'],
        expect.anything(),
        { showroomOnly: true },
      );
    });

    it('keeps both legs of an item that was returned and re-sold on the same document', async () => {
      // Same item on both sides: the replay guard has to tell the two apart by
      // movement type, or the second leg is silently dropped.
      await consumer.handle(
        buildEvent({
          items: [
            { itemId: 'item-A', locationId: 'loc-1', quantity: 1, direction: 'IN' },
            { itemId: 'item-A', locationId: 'loc-1', quantity: 3, direction: 'OUT' },
          ],
        }),
      );

      const movements = stockLedgerService.recordBatchMovements.mock.calls[0][0];
      expect(movements).toHaveLength(2);
      expect(movements.map((m: { quantity: number }) => m.quantity)).toEqual([-1, 3]);
      expect(ledgerRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            movementType: StockMovementType.SALE_ISSUE,
          }),
        }),
      );
    });

    it('reverses each leg at the cost its forward movement was booked at', async () => {
      // purchase_price has moved since the exchange was posted; reversing at
      // today's price would leave a residue in inventory value on a document
      // whose quantity is fully undone.
      ledgerRepo.find.mockResolvedValue([
        { referenceType: 'RETURN_INVOICE', itemId: 'item-A', unitCost: '7.25' },
        { referenceType: 'INVOICE', itemId: 'item-B', unitCost: '3.10' },
      ]);

      await consumer.handle(exchangeEvent());

      const movements = stockLedgerService.recordBatchMovements.mock.calls[0][0];
      expect(movements[0]).toEqual(
        expect.objectContaining({ itemId: 'item-A', unitCost: 7.25, quantity: -2 }),
      );
      expect(movements[1]).toEqual(
        expect.objectContaining({ itemId: 'item-B', unitCost: 3.1, quantity: 1 }),
      );
    });

    it('tells the two legs of one item apart by which movement filed them', async () => {
      // Same item returned and re-sold: the IN leg must take the return-in cost
      // and the OUT leg the deduction cost, not whichever row came back first.
      ledgerRepo.find.mockResolvedValue([
        { referenceType: 'RETURN_INVOICE', itemId: 'item-A', unitCost: '7.25' },
        { referenceType: 'INVOICE', itemId: 'item-A', unitCost: '9.99' },
      ]);

      await consumer.handle(
        buildEvent({
          items: [
            { itemId: 'item-A', locationId: 'loc-1', quantity: 1, direction: 'IN' },
            { itemId: 'item-A', locationId: 'loc-1', quantity: 3, direction: 'OUT' },
          ],
        }),
      );

      const movements = stockLedgerService.recordBatchMovements.mock.calls[0][0];
      expect(movements[0].unitCost).toBe(7.25);
      expect(movements[1].unitCost).toBe(9.99);
    });

    it('falls back to the current purchase price when the forward entry is missing', async () => {
      ledgerRepo.find.mockResolvedValue([]);

      await consumer.handle(exchangeEvent());

      const movements = stockLedgerService.recordBatchMovements.mock.calls[0][0];
      expect(movements[0].unitCost).toBe(10);
      expect(movements[1].unitCost).toBe(5.5);
    });

    it('does not skip a returned line just because it has no showroom location', async () => {
      resolveLocationsMock.mockResolvedValue(new Map<string, string>());

      await consumer.handle(exchangeEvent());

      const movements = stockLedgerService.recordBatchMovements.mock.calls[0][0];
      expect(movements).toHaveLength(1);
      expect(movements[0].itemId).toBe('item-A');
    });
  });
});
