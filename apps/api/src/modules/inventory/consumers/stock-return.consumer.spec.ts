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
  let ledgerRepo: { findOne: jest.Mock; manager: never };
  let itemCostSnapshotService: { snapshotCosts: jest.Mock };
  let stockLedgerService: { recordBatchMovements: jest.Mock };

  beforeEach(async () => {
    ledgerRepo = {
      findOne: jest.fn().mockResolvedValue(null),
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
});
