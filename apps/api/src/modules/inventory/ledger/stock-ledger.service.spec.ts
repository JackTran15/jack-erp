import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StockLedgerService, RecordMovementParams } from './stock-ledger.service';
import { StockLedgerEntryEntity } from './stock-ledger-entry.entity';
import { StockBalanceEntity } from './stock-balance.entity';
import { EventPublisher } from '../../events/event-publisher.service';
import { ItemStorageLocationService } from '../product/item-storage-location.service';
import { StockMovementType } from '@erp/shared-interfaces';

describe('StockLedgerService', () => {
  let service: StockLedgerService;
  let ledgerRepo: Record<string, jest.Mock>;
  let balanceRepo: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;
  let eventPublisher: Record<string, jest.Mock>;
  let pslService: Record<string, jest.Mock>;

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
      query: jest.fn(),
    };

    balanceRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn(),
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

    pslService = {
      validateAndAssignByLocation: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockLedgerService,
        { provide: getRepositoryToken(StockLedgerEntryEntity), useValue: ledgerRepo },
        { provide: getRepositoryToken(StockBalanceEntity), useValue: balanceRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: EventPublisher, useValue: eventPublisher },
        { provide: ItemStorageLocationService, useValue: pslService },
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

    it('persists unit_cost and a signed line_value when unitCost is supplied (IN)', async () => {
      (dataSource._mockManager as any).findOne.mockResolvedValue(null);

      const result = await service.recordMovement({
        ...baseParams,
        quantity: 10,
        unitCost: 12.5,
      });

      // line_value = quantity * unitCost = 10 * 12.5 = 125 (positive: stock in)
      expect(result).toEqual(
        expect.objectContaining({ unitCost: 12.5, lineValue: 125 }),
      );
      expect((dataSource._mockManager as any).create).toHaveBeenCalledWith(
        StockLedgerEntryEntity,
        expect.objectContaining({ unitCost: 12.5, lineValue: 125 }),
      );
    });

    it('persists a negative line_value for OUT movements', async () => {
      (dataSource._mockManager as any).findOne.mockResolvedValue(null);

      const result = await service.recordMovement({
        ...baseParams,
        movementType: StockMovementType.GOODS_ISSUE,
        quantity: -4,
        unitCost: 7,
      });

      // line_value = -4 * 7 = -28 (negative: stock out)
      expect(result).toEqual(
        expect.objectContaining({ unitCost: 7, lineValue: -28 }),
      );
    });

    it('leaves unit_cost and line_value null when caller omits unitCost', async () => {
      (dataSource._mockManager as any).findOne.mockResolvedValue(null);

      const result = await service.recordMovement(baseParams);

      expect(result.unitCost).toBeUndefined();
      expect(result.lineValue).toBeUndefined();
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

    it('should preserve separate balances when the same item is posted to multiple locations', async () => {
      (dataSource._mockManager as any).findOne.mockResolvedValue(null);

      await service.recordBatchMovements([
        { ...baseParams, locationId: 'loc-A01', quantity: 4 },
        { ...baseParams, locationId: 'loc-B01', quantity: 6 },
      ]);

      expect(pslService.validateAndAssignByLocation).toHaveBeenNthCalledWith(
        1,
        'item-1',
        'loc-A01',
        actor,
      );
      expect(pslService.validateAndAssignByLocation).toHaveBeenNthCalledWith(
        2,
        'item-1',
        'loc-B01',
        actor,
      );
      expect((dataSource._mockManager as any).create).toHaveBeenCalledWith(
        StockBalanceEntity,
        expect.objectContaining({
          itemId: 'item-1',
          locationId: 'loc-A01',
          quantity: 4,
        }),
      );
      expect((dataSource._mockManager as any).create).toHaveBeenCalledWith(
        StockBalanceEntity,
        expect.objectContaining({
          itemId: 'item-1',
          locationId: 'loc-B01',
          quantity: 6,
        }),
      );
    });

    it('should return empty array for empty movements', async () => {
      const result = await service.recordBatchMovements([]);
      expect(result).toEqual([]);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('getInstantAverageCost', () => {
    it('calculates the branch-wide instantaneous weighted average from signed ledger values', async () => {
      ledgerRepo.query.mockResolvedValue([
        {
          quantity: '10',
          inventory_value: '2150000',
          missing_value_count: '0',
          purchase_price: '250000',
        },
      ]);

      await expect(
        service.getInstantAverageCost('item-1', 'org-1', 'branch-1'),
      ).resolves.toEqual({
        itemId: 'item-1',
        branchId: 'branch-1',
        quantity: 10,
        inventoryValue: 2150000,
        unitCost: 215000,
        source: 'LEDGER',
      });
    });

    it('falls back to the current purchase price when historical ledger values are incomplete', async () => {
      ledgerRepo.query.mockResolvedValue([
        {
          quantity: '10',
          inventory_value: '1400000',
          missing_value_count: '1',
          purchase_price: '250000',
        },
      ]);

      await expect(
        service.getInstantAverageCost('item-1', 'org-1', 'branch-1'),
      ).resolves.toEqual({
        itemId: 'item-1',
        branchId: 'branch-1',
        quantity: 10,
        inventoryValue: 1400000,
        unitCost: 250000,
        source: 'PURCHASE_PRICE_FALLBACK',
      });
    });
  });

  describe('getBalances', () => {
    it('should return filtered paginated results', async () => {
      const rawRow = {
        id: 'b1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        itemId: 'item-1',
        locationId: 'loc-1',
        quantity: '50',
        lastMovementAt: null,
        itemCode: 'SKU-001',
        itemName: 'Widget',
        itemUnit: 'PCS',
        itemIsActive: true,
        itemIsPosVisible: true,
        categoryName: null,
        locationCode: 'A-01',
        locationName: 'Aisle 1',
        storageId: 'stor-1',
        storageName: 'Main WH',
        minQty: null,
        maxQty: null,
      };

      const mockQb = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([rawRow]),
        getCount: jest.fn().mockResolvedValue(1),
      };
      balanceRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      const result = await service.getBalances({
        organizationId: 'org-1',
        itemId: 'item-1',
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].itemId).toBe('item-1');
      expect(result.data[0].quantity).toBe(50);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(balanceRepo.createQueryBuilder).toHaveBeenCalledWith('sb');
      expect(mockQb.where).toHaveBeenCalledWith(
        'sb.organization_id = :organizationId',
        { organizationId: 'org-1' },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'sb.item_id = :itemId',
        { itemId: 'item-1' },
      );
    });

    describe('per-column filters', () => {
      function createQbSpy() {
        const qb: any = {
          innerJoin: jest.fn().mockReturnThis(),
          leftJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          offset: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          getRawMany: jest.fn().mockResolvedValue([]),
          getCount: jest.fn().mockResolvedValue(0),
        };
        return qb;
      }

      it('test 1: locationCode equals filter applies exact match SQL', async () => {
        const qb = createQbSpy();
        balanceRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

        await service.getBalances({
          organizationId: 'org-1',
          locationCode: '999.01',
          locationCodeMode: 'equals',
          page: 1,
          pageSize: 20,
        });

        expect(qb.andWhere).toHaveBeenCalledWith(
          expect.stringContaining('loc.code = :locationCode'),
          expect.objectContaining({ locationCode: '999.01' }),
        );
      });

      it('test 2: itemName contains filter applies ILIKE with wildcards (default mode)', async () => {
        const qb = createQbSpy();
        balanceRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

        await service.getBalances({
          organizationId: 'org-1',
          itemName: 'AK078',
          itemNameMode: 'contains',
          page: 1,
          pageSize: 20,
        });

        expect(qb.andWhere).toHaveBeenCalledWith(
          expect.stringContaining('item.name ILIKE :itemName'),
          expect.objectContaining({ itemName: '%AK078%' }),
        );
      });

      it('test 3: quantity lte filter applies <= SQL', async () => {
        const qb = createQbSpy();
        balanceRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

        await service.getBalances({
          organizationId: 'org-1',
          quantity: 0,
          quantityOp: 'lte',
          page: 1,
          pageSize: 20,
        });

        expect(qb.andWhere).toHaveBeenCalledWith(
          expect.stringContaining('sb.quantity <= :quantity'),
          expect.objectContaining({ quantity: 0 }),
        );
      });

      it('test 4: itemName notContains filter applies NOT ILIKE with wildcards', async () => {
        const qb = createQbSpy();
        balanceRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

        await service.getBalances({
          organizationId: 'org-1',
          itemName: 'AK078',
          itemNameMode: 'notContains',
          page: 1,
          pageSize: 20,
        });

        expect(qb.andWhere).toHaveBeenCalledWith(
          expect.stringContaining('item.name NOT ILIKE :itemName'),
          expect.objectContaining({ itemName: '%AK078%' }),
        );
      });

      it('test 5: cross-org scoping is still applied when per-column filters are present', async () => {
        const qb = createQbSpy();
        balanceRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

        await service.getBalances({
          organizationId: 'org-1',
          itemName: 'Widget',
          itemNameMode: 'contains',
          page: 1,
          pageSize: 20,
        });

        expect(qb.where).toHaveBeenCalledWith(
          'sb.organization_id = :organizationId',
          { organizationId: 'org-1' },
        );
      });
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
