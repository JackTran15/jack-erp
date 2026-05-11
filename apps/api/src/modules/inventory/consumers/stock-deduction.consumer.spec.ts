import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DomainEvent, DomainEventType, StockMovementType } from '@erp/shared-interfaces';
import { StockDeductionConsumer } from './stock-deduction.consumer';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { StockLedgerEntryEntity } from '../ledger/stock-ledger-entry.entity';
import { StockDeductionPayload } from '../publishers/stock-deduction.publisher';

const buildEvent = (
  overrides: Partial<StockDeductionPayload> = {},
): DomainEvent<StockDeductionPayload> => ({
  eventId: 'evt-1',
  eventType: DomainEventType.STOCK_DEDUCTION_REQUESTED,
  timestamp: '2026-05-11T00:00:00Z',
  organizationId: 'org-1',
  branchId: 'branch-1',
  correlationId: 'inv-1',
  payload: {
    invoiceId: 'inv-1',
    itemId: 'item-A',
    locationId: 'loc-1',
    quantity: 2,
    branchId: 'branch-1',
    organizationId: 'org-1',
    actorId: 'user-1',
    ...overrides,
  },
});

describe('StockDeductionConsumer', () => {
  let consumer: StockDeductionConsumer;
  let ledgerRepo: { findOne: jest.Mock };
  let stockLedgerService: { recordBatchMovements: jest.Mock };

  beforeEach(async () => {
    ledgerRepo = { findOne: jest.fn() };
    stockLedgerService = { recordBatchMovements: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockDeductionConsumer,
        { provide: getRepositoryToken(StockLedgerEntryEntity), useValue: ledgerRepo },
        { provide: StockLedgerService, useValue: stockLedgerService },
      ],
    }).compile();

    consumer = module.get(StockDeductionConsumer);
  });

  it('records SALE_ISSUE movement with negative quantity on first delivery', async () => {
    ledgerRepo.findOne.mockResolvedValue(null);

    await consumer.handle(buildEvent());

    expect(stockLedgerService.recordBatchMovements).toHaveBeenCalledWith([
      expect.objectContaining({
        itemId: 'item-A',
        locationId: 'loc-1',
        movementType: StockMovementType.SALE_ISSUE,
        quantity: -2,
        referenceType: 'INVOICE',
        referenceId: 'inv-1',
      }),
    ]);
  });

  it('skips when a ledger entry for the same invoice+item already exists (idempotency)', async () => {
    ledgerRepo.findOne.mockResolvedValue({ id: 'existing' });

    await consumer.handle(buildEvent());

    expect(stockLedgerService.recordBatchMovements).not.toHaveBeenCalled();
  });

  it('passes actor context derived from payload', async () => {
    ledgerRepo.findOne.mockResolvedValue(null);

    await consumer.handle(buildEvent({ actorId: 'user-2' }));

    const args = stockLedgerService.recordBatchMovements.mock.calls[0][0][0];
    expect(args.actorContext).toEqual({
      userId: 'user-2',
      organizationId: 'org-1',
      branchId: 'branch-1',
      roles: [],
    });
  });

  it('throws when stock ledger throws (so Kafka retries)', async () => {
    ledgerRepo.findOne.mockResolvedValue(null);
    stockLedgerService.recordBatchMovements.mockRejectedValue(new Error('boom'));

    await expect(consumer.handle(buildEvent())).rejects.toThrow('boom');
  });
});
