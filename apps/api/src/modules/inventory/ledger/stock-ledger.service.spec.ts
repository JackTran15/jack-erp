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
      // setBalanceTracking() runs raw SQL through the repository's manager.
      manager: { query: jest.fn().mockResolvedValue([[], 0]) } as any,
    };

    // Bulk ledger insert: manager.createQueryBuilder().insert().into(...).values(rows).execute()
    // — identifiers are sized to whatever `values()` was called with, so the
    // batch defensive guard (identifiers.length === rows.length) never trips.
    let insertedRows: unknown[] = [];
    const insertBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockImplementation((rows: unknown[]) => {
        insertedRows = rows;
        return insertBuilder;
      }),
      execute: jest.fn().mockImplementation(() =>
        Promise.resolve({
          identifiers: insertedRows.map((_, i) => ({ id: `entry-${i + 1}` })),
        }),
      ),
    };

    const mockManager = {
      create: jest.fn().mockImplementation((_entity, data) => ({ id: 'entry-1', ...data })),
      save: jest.fn().mockImplementation((_entity, data) => Promise.resolve(data)),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(insertBuilder),
      // Shared for assertStoragesActive()'s inactive-storage check and
      // upsertBalancesBatch()'s bulk UPSERT — empty result means no inactive
      // storages and no negative-balance rows for the default happy path.
      query: jest.fn().mockResolvedValue([]),
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
      validateAndAssignBatch: jest.fn().mockResolvedValue(undefined),
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

    it('persists an explicit line_value on a zero-quantity adjustment', async () => {
      (dataSource._mockManager as any).findOne.mockResolvedValue(null);

      // A voucher revision that only changed a line's price: quantity does not
      // move, value does. The derived formula would flatten this to 0.
      const result = await service.recordMovement({
        ...baseParams,
        quantity: 0,
        unitCost: 120,
        lineValue: 200,
      });

      expect(result).toEqual(
        expect.objectContaining({ unitCost: 120, lineValue: 200 }),
      );
    });

    it('lets an explicit line_value win over the derived formula', async () => {
      (dataSource._mockManager as any).findOne.mockResolvedValue(null);

      const result = await service.recordMovement({
        ...baseParams,
        quantity: -3,
        unitCost: 100,
        lineValue: -160,
      });

      // Derived would be -3 × 100 = -300; the caller knows the real value change.
      expect(result).toEqual(
        expect.objectContaining({ unitCost: 100, lineValue: -160 }),
      );
    });
  });

  describe('getInstantAverageCost', () => {
    it('counts a value-only adjustment in the moving average', async () => {
      // Ledger holds 10 units bought at 100, plus a zero-quantity adjustment of
      // +200 written when the voucher's price was corrected to 120.
      ledgerRepo.query.mockResolvedValue([
        {
          quantity: '10',
          inventory_value: '1200',
          missing_value_count: 0,
          purchase_price: '100',
        },
      ]);

      const result = await service.getInstantAverageCost('item-1', 'org-1', 'branch-1');

      expect(result.unitCost).toBe(120);
      expect(result.source).toBe('LEDGER');
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

      // Shelf-assignment validation is batched into a single call for the
      // whole request instead of once per movement.
      expect(pslService.validateAndAssignBatch).toHaveBeenCalledWith(
        [
          { itemId: 'item-1', locationId: 'loc-A01' },
          { itemId: 'item-1', locationId: 'loc-B01' },
        ],
        actor,
      );

      // Balances are written via one bulk UPSERT (raw SQL) instead of a
      // manager.create()/save() per line — the two locations must appear as
      // two separate rows in the query params, each keeping its own quantity
      // (not merged into a single item-1 total).
      const balanceQueryCall = (dataSource._mockManager as any).query.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('stock_balances'),
      );
      expect(balanceQueryCall).toBeDefined();
      const params = balanceQueryCall![1] as unknown[];
      expect(params).toEqual(
        expect.arrayContaining(['loc-A01', 4, 'loc-B01', 6]),
      );
    });

    it('aggregates a duplicate item+location delta into one balance row but keeps separate ledger entries (AC-02)', async () => {
      (dataSource._mockManager as any).findOne.mockResolvedValue(null);

      // Real case from NhapkhauHangHoaNhapKho SHOWROOM.xls: SKU TX3150-D
      // appears on two separate lines, quantity 1 each, same item+location.
      const result = await service.recordBatchMovements([
        { ...baseParams, itemId: 'item-1', locationId: 'loc-1', quantity: 1 },
        { ...baseParams, itemId: 'item-1', locationId: 'loc-1', quantity: 1 },
      ]);

      // Ledger stays 1:1 with the input lines (immutable audit log).
      expect(result).toHaveLength(2);

      // Only one (item, location) row reaches the balance upsert, carrying
      // the summed delta (+2) — not two rows of +1 each.
      const balanceCall = (dataSource._mockManager as any).query.mock.calls.find(
        (call: unknown[]) => (call[0] as string).includes('stock_balances'),
      );
      const params = balanceCall![1] as unknown[];
      expect(params.filter((p) => p === 'item-1')).toHaveLength(1);
      expect(params).toEqual(expect.arrayContaining(['loc-1', 2]));
    });

    it('logs exactly one warning per batch when the bulk upsert returns a negative balance (AC-03)', async () => {
      (dataSource._mockManager as any).findOne.mockResolvedValue(null);
      (dataSource._mockManager as any).query.mockImplementation((sql: string) =>
        Promise.resolve(
          sql.includes('stock_balances')
            ? [{ item_id: 'item-1', location_id: 'loc-1', quantity: '-3' }]
            : [],
        ),
      );
      const warnSpy = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      await service.recordBatchMovements([
        { ...baseParams, itemId: 'item-1', locationId: 'loc-1', quantity: -3 },
      ]);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Negative balance detected'));
    });

    it('rejects the whole batch before any writes when a location is in an inactive storage (AC-04)', async () => {
      (dataSource._mockManager as any).query.mockImplementation((sql: string) =>
        Promise.resolve(sql.includes('is_active = false') ? [{ name: 'Kho Ngừng' }] : []),
      );

      await expect(service.recordBatchMovements([baseParams])).rejects.toThrow(
        /Không thể thao tác trên kho đã ngừng hoạt động/,
      );

      expect((dataSource._mockManager as any).createQueryBuilder).not.toHaveBeenCalled();
    });

    it('throws if the bulk ledger insert returns a mismatched identifier count (A-01 defensive guard)', async () => {
      (dataSource._mockManager as any).findOne.mockResolvedValue(null);
      const builder = (dataSource._mockManager as any).createQueryBuilder();
      builder.execute.mockResolvedValueOnce({ identifiers: [{ id: 'only-one' }] });

      await expect(
        service.recordBatchMovements([
          { ...baseParams, itemId: 'item-1' },
          { ...baseParams, itemId: 'item-2' },
        ]),
      ).rejects.toThrow(/returned \d+ identifier\(s\) for \d+ row\(s\)/);
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
        branchId: 'branch-1',
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
        'storage.branch_id = :branchId',
        { branchId: 'branch-1' },
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

      it('test 6: excludeShowroom filters out kho showroom (is_main_storage)', async () => {
        const qb = createQbSpy();
        balanceRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

        await service.getBalances({
          organizationId: 'org-1',
          excludeShowroom: true,
          page: 1,
          pageSize: 20,
        });

        expect(qb.andWhere).toHaveBeenCalledWith('storage.is_main_storage = false');
      });

      it('test 7: no showroom filter is applied when excludeShowroom is omitted', async () => {
        const qb = createQbSpy();
        balanceRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

        await service.getBalances({
          organizationId: 'org-1',
          page: 1,
          pageSize: 20,
        });

        const calls = qb.andWhere.mock.calls.map((args: unknown[]) => String(args[0]));
        expect(calls.some((sql: string) => sql.includes('is_main_storage'))).toBe(
          false,
        );
      });
    });

    describe('locationIsActive filter (ADR-02 / A-07)', () => {
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

      it('applies loc.is_active filter when locationIsActive is passed', async () => {
        const qb = createQbSpy();
        balanceRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

        await service.getBalances({
          organizationId: 'org-1',
          locationIsActive: true,
          page: 1,
          pageSize: 20,
        });

        expect(qb.andWhere).toHaveBeenCalledWith(
          'loc.is_active = :locationIsActive',
          { locationIsActive: true },
        );
      });

      it('applies loc.is_active = false filter when locationIsActive is false', async () => {
        const qb = createQbSpy();
        balanceRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

        await service.getBalances({
          organizationId: 'org-1',
          locationIsActive: false,
          page: 1,
          pageSize: 20,
        });

        expect(qb.andWhere).toHaveBeenCalledWith(
          'loc.is_active = :locationIsActive',
          { locationIsActive: false },
        );
      });

      it('does NOT filter loc.is_active when locationIsActive is omitted — behaviour unchanged for existing callers', async () => {
        const qb = createQbSpy();
        balanceRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

        await service.getBalances({
          organizationId: 'org-1',
          page: 1,
          pageSize: 20,
        });

        const calls = qb.andWhere.mock.calls.map((args: unknown[]) => String(args[0]));
        expect(calls.some((sql: string) => sql.includes('loc.is_active'))).toBe(false);
      });

      it('maps location.isActive into the returned row', async () => {
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
          locationCode: 'E03.01',
          locationName: 'E03.01',
          storageId: 'stor-1',
          storageName: 'Main WH',
          locationIsActive: false,
          minQty: null,
          maxQty: null,
        };
        const qb = createQbSpy();
        qb.getRawMany = jest.fn().mockResolvedValue([rawRow]);
        qb.getCount = jest.fn().mockResolvedValue(1);
        balanceRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);

        const result = await service.getBalances({
          organizationId: 'org-1',
          page: 1,
          pageSize: 20,
        });

        expect(result.data[0].location.isActive).toBe(false);
      });
    });
  });

  describe('getBalancesForPairs', () => {
    function mockRows(rows: Array<Record<string, unknown>>) {
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rows),
      };
      balanceRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      return qb;
    }

    it('resolves a location pair exactly and a storage pair as the sum of its locations', async () => {
      const qb = mockRows([
        { itemId: 'item-1', locationId: 'loc-A', storageId: 'stor-1', quantity: '3' },
        { itemId: 'item-1', locationId: 'loc-B', storageId: 'stor-1', quantity: '4' },
      ]);

      const result = await service.getBalancesForPairs(
        [
          { itemId: 'item-1', locationId: 'loc-A' },
          { itemId: 'item-1', storageId: 'stor-1' },
        ],
        'org-1',
        'branch-1',
      );

      expect(result).toEqual([
        { itemId: 'item-1', locationId: 'loc-A', storageId: null, quantity: 3 },
        { itemId: 'item-1', locationId: null, storageId: 'stor-1', quantity: 7 },
      ]);
      // One SQL round trip regardless of how many pairs were asked for.
      expect(qb.getRawMany).toHaveBeenCalledTimes(1);
      expect(balanceRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('returns 0 for a pair with no balance row instead of dropping it', async () => {
      mockRows([]);

      const result = await service.getBalancesForPairs(
        [{ itemId: 'item-1', locationId: 'loc-A' }],
        'org-1',
      );

      expect(result).toEqual([
        { itemId: 'item-1', locationId: 'loc-A', storageId: null, quantity: 0 },
      ]);
    });

    it('does not query at all for an empty pair list', async () => {
      balanceRepo.createQueryBuilder = jest.fn();

      await expect(service.getBalancesForPairs([], 'org-1')).resolves.toEqual([]);
      expect(balanceRepo.createQueryBuilder).not.toHaveBeenCalled();
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

  /**
   * `updated` is read off an `UPDATE … RETURNING`, which TypeORM hands back as
   * `[rows, rowCount]` — so the mocks below use that shape, not a bare row
   * array. Before this was fixed, `rows.length` reported 2 for every call: two
   * rows updated, none updated, five updated, all "2".
   *
   * The shape itself is proven against a live Postgres in
   * `test/e2e/typeorm-returning-shape.e2e-spec.ts`; these mocks only have
   * licence to assume it because that test measures it.
   */
  describe('setBalanceTracking — reports the real number of rows touched', () => {
    const entries = [
      { itemId: 'item-1', locationId: 'loc-1' },
      { itemId: 'item-2', locationId: 'loc-2' },
      { itemId: 'item-3', locationId: 'loc-3' },
    ];

    it('returns the driver rowCount when balances were re-flagged', async () => {
      (balanceRepo.manager as any).query.mockResolvedValue([
        [{ id: 'sb-1' }, { id: 'sb-2' }, { id: 'sb-3' }],
        3,
      ]);

      const result = await service.setBalanceTracking(entries, true, actor);

      expect(result).toEqual({ updated: 3 });
    });

    it('returns 0 when every pair was already in the requested state', async () => {
      // `sb.is_tracked <> $4` matches nothing — the case a raw `.length` calls 2.
      (balanceRepo.manager as any).query.mockResolvedValue([[], 0]);

      const result = await service.setBalanceTracking(entries, true, actor);

      expect(result).toEqual({ updated: 0 });
    });

    it('returns 0 for an empty selection without touching the database', async () => {
      (balanceRepo.manager as any).query.mockClear();

      const result = await service.setBalanceTracking([], true, actor);

      expect(result).toEqual({ updated: 0 });
      expect((balanceRepo.manager as any).query).not.toHaveBeenCalled();
    });
  });
});
