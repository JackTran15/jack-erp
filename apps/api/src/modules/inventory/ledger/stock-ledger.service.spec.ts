import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StockLedgerService, RecordMovementParams } from './stock-ledger.service';
import { StockLedgerEntryEntity } from './stock-ledger-entry.entity';
import { StockBalanceEntity } from './stock-balance.entity';
import { EventPublisher } from '../../events/event-publisher.service';
import { ProductStorageLocationService } from '../product/product-storage-location.service';
import { StockMovementType } from '@erp/shared-interfaces';

describe('StockLedgerService', () => {
  let service: StockLedgerService;
  let ledgerRepo: Record<string, jest.Mock>;
  let balanceRepo: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;
  let eventPublisher: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const baseParams: RecordMovementParams = {
    itemId: 'item-1',
    locationId: 'loc-1',
    branchId: 'branch-1',
    organizationId: 'org-1',
    movementType: StockMovementType.PURCHASE_RECEIPT,
    quantity: 10,
    referenceType: 'PURCHASE',
    referenceId: 'po-1',
    actorContext: actor,
  };

  beforeEach(async () => {
    ledgerRepo = {
      createQueryBuilder: jest.fn(),
    };

    balanceRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    };

    const mockManager = {
      create: jest.fn().mockImplementation((_entity, data) => ({ id: 'entry-1', ...data })),
      save: jest.fn().mockImplementation((_entity, data) => Promise.resolve(data)),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
      _mockManager: mockManager as any,
    };

    eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
      publishBatch: jest.fn().mockResolvedValue(undefined),
    };

    const pslService = {
      validateAndAssignByLocation: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockLedgerService,
        { provide: getRepositoryToken(StockLedgerEntryEntity), useValue: ledgerRepo },
        { provide: getRepositoryToken(StockBalanceEntity), useValue: balanceRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: EventPublisher, useValue: eventPublisher },
        { provide: ProductStorageLocationService, useValue: pslService },
      ],
    }).compile();

    service = module.get(StockLedgerService);
  });

  describe('recordMovement', () => {
    it('should create a ledger entry and update existing balance', async () => {
      const existingBalance = { id: 'bal-1', quantity: 20 };
      (dataSource._mockManager as any).findOne.mockResolvedValue(existingBalance);

      const result = await service.recordMovement(baseParams);

      expect(result).toBeDefined();
      expect(result.itemId).toBe('item-1');
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(eventPublisher.publish).toHaveBeenCalled();
      expect((dataSource._mockManager as any).update).toHaveBeenCalledWith(
        StockBalanceEntity,
        { id: 'bal-1' },
        expect.objectContaining({ quantity: 30 }),
      );
    });

    it('should upsert balance for new item/location (no existing balance)', async () => {
      (dataSource._mockManager as any).findOne.mockResolvedValue(null);

      const result = await service.recordMovement(baseParams);

      expect(result).toBeDefined();
      expect((dataSource._mockManager as any).create).toHaveBeenCalledWith(
        StockBalanceEntity,
        expect.objectContaining({
          itemId: 'item-1',
          locationId: 'loc-1',
          quantity: 10,
        }),
      );
      expect((dataSource._mockManager as any).save).toHaveBeenCalledWith(
        StockBalanceEntity,
        expect.objectContaining({ itemId: 'item-1' }),
      );
    });
  });

  describe('recordBatchMovements', () => {
    it('should create all entries atomically and publish batch events', async () => {
      (dataSource._mockManager as any).findOne.mockResolvedValue(null);

      const movements: RecordMovementParams[] = [
        { ...baseParams, itemId: 'item-1' },
        { ...baseParams, itemId: 'item-2' },
      ];

      const result = await service.recordBatchMovements(movements);

      expect(result).toHaveLength(2);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(eventPublisher.publishBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ key: 'item-1' }),
          expect.objectContaining({ key: 'item-2' }),
        ]),
      );
    });

    it('should return empty array for empty movements', async () => {
      const result = await service.recordBatchMovements([]);
      expect(result).toEqual([]);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('getBalances', () => {
    it('should return filtered paginated results', async () => {
      const balances = [{ id: 'b1', itemId: 'item-1', quantity: 50 }];
      balanceRepo.findAndCount.mockResolvedValue([balances, 1]);

      const result = await service.getBalances({
        organizationId: 'org-1',
        itemId: 'item-1',
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toEqual(balances);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(balanceRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            itemId: 'item-1',
          }),
        }),
      );
    });
  });

  describe('reconstructBalance', () => {
    it('should sum all ledger entries for the given item/location', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '75' }),
      };
      ledgerRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.reconstructBalance('item-1', 'loc-1', 'org-1');

      expect(result).toBe(75);
      expect(mockQb.select).toHaveBeenCalledWith('COALESCE(SUM(entry.quantity), 0)', 'total');
      expect(mockQb.andWhere).toHaveBeenCalledWith('entry.itemId = :itemId', { itemId: 'item-1' });
      expect(mockQb.andWhere).toHaveBeenCalledWith('entry.locationId = :locationId', { locationId: 'loc-1' });
    });
  });
});
