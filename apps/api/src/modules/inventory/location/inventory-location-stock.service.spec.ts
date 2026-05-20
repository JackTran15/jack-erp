import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { StockStateFilter, LocationType } from '@erp/shared-interfaces';
import { InventoryLocationStockService } from './inventory-location-stock.service';
import { StockByLocationQueryDto } from './dto/stock-by-location.query.dto';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { ProductStorageLocationService } from '../product/product-storage-location.service';
import { ItemBarcodeEntity } from './item-barcode.entity';
import { ItemEntity } from './item.entity';
import { ItemProviderEntity } from './item-provider.entity';
import { ItemStockThresholdEntity } from './item-stock-threshold.entity';
import { LocationEntity } from './location.entity';
import { DataSource } from 'typeorm';

const locationEntity = {
  id: 'loc-1',
  code: 'A-01',
  name: 'Aisle 1',
  type: LocationType.SHELF,
  isActive: true,
  branchId: 'branch-1',
  storage: {
    id: 'stor-1',
    name: 'Main WH',
    branchId: 'branch-1',
    branch: { id: 'branch-1', name: 'Main Branch' },
  },
};

function makeStockBalance(overrides: Record<string, unknown> = {}): any {
  const itemOverride = (overrides.item as Record<string, unknown>) ?? {};
  return {
    id: 'sb-1',
    itemId: 'item-1',
    locationId: 'loc-1',
    organizationId: 'org-1',
    quantity: '5',
    lastMovementAt: new Date('2026-03-01T10:00:00Z'),
    ...overrides,
    item: {
      id: 'item-1',
      code: 'SKU-001',
      name: 'Widget A',
      unit: 'PCS',
      categoryId: 'cat-1',
      category: { id: 'cat-1', name: 'Shoes' },
      productId: 'prod-1',
      variantLabel: '39 · Nâu',
      isPosVisible: true,
      isActive: true,
      sellingPrice: '100.50',
      purchasePrice: '60.00',
      ...itemOverride,
    },
  };
}

const actor = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

function makeQuery(
  overrides: Partial<StockByLocationQueryDto> = {},
): StockByLocationQueryDto {
  const dto = new StockByLocationQueryDto();
  dto.page = overrides.page ?? 1;
  dto.pageSize = overrides.pageSize ?? 50;
  dto.sortBy = overrides.sortBy ?? 'name';
  dto.sortOrder = overrides.sortOrder ?? 'asc';
  dto.search = overrides.search;
  dto.barcode = overrides.barcode;
  dto.categoryId = overrides.categoryId;
  dto.providerId = overrides.providerId;
  dto.isPosVisible = overrides.isPosVisible;
  dto.isActive = overrides.isActive;
  dto.stockState = overrides.stockState ?? StockStateFilter.ALL;
  return dto;
}

describe('InventoryLocationStockService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let service: InventoryLocationStockService;
  let stockBalanceRepo: any;
  let locationRepo: any;
  let thresholdRepo: any;
  let barcodeRepo: any;
  let itemProviderRepo: any;
  let itemRepo: any;
  let pslService: any;
  /** EntityManager mock used by assignBatch / addItemToLocation tests. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let managerFindOne: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let managerInsert: any;
  let dataSourceMock: any;

  function setup(opts: {
    location?: typeof locationEntity | null;
    rows?: any[];
    total?: number;
    thresholds?: Array<{
      itemId: string;
      minQty: number | null;
      maxQty: number | null;
    }>;
    barcodes?: Array<{ itemId: string; code: string }>;
    providers?: Array<{
      itemId: string;
      providerId: string;
      isPrimary: boolean;
      provider: { name: string };
    }>;
  }): void {
    const locResult =
      opts.location === null ? null : opts.location ?? locationEntity;
    const rows = opts.rows ?? [];
    const total = opts.total ?? rows.length;

    locationRepo.findOne.mockResolvedValue(locResult);
    stockBalanceRepo.findAndCount.mockResolvedValue([rows, total]);
    stockBalanceRepo.find.mockResolvedValue(rows);
    thresholdRepo.find.mockResolvedValue(opts.thresholds ?? []);
    barcodeRepo.find.mockResolvedValue(opts.barcodes ?? []);
    itemProviderRepo.find.mockResolvedValue(opts.providers ?? []);
  }

  beforeEach(async () => {
    stockBalanceRepo = {
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    locationRepo = { findOne: jest.fn().mockResolvedValue(null) };
    thresholdRepo = { find: jest.fn().mockResolvedValue([]) };
    barcodeRepo = { find: jest.fn().mockResolvedValue([]) };
    itemProviderRepo = { find: jest.fn().mockResolvedValue([]) };
    itemRepo = { findOne: jest.fn().mockResolvedValue(null) };
    pslService = {
      validateAndAssignByLocation: jest.fn().mockResolvedValue(undefined),
    };

    managerFindOne = jest.fn();
    managerInsert = jest.fn().mockResolvedValue(undefined);
    const manager = { findOne: managerFindOne, insert: managerInsert };
    dataSourceMock = {
      transaction: jest
        .fn()
        .mockImplementation((cb: (m: typeof manager) => Promise<unknown>) =>
          cb(manager),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryLocationStockService,
        {
          provide: getRepositoryToken(StockBalanceEntity),
          useValue: stockBalanceRepo,
        },
        { provide: getRepositoryToken(LocationEntity), useValue: locationRepo },
        {
          provide: getRepositoryToken(ItemStockThresholdEntity),
          useValue: thresholdRepo,
        },
        {
          provide: getRepositoryToken(ItemBarcodeEntity),
          useValue: barcodeRepo,
        },
        {
          provide: getRepositoryToken(ItemProviderEntity),
          useValue: itemProviderRepo,
        },
        {
          provide: getRepositoryToken(ItemEntity),
          useValue: itemRepo,
        },
        {
          provide: ProductStorageLocationService,
          useValue: pslService,
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();
    service = module.get(InventoryLocationStockService);
  });

  describe('resolveLocation', () => {
    it('throws NotFoundException when location not found in org', async () => {
      setup({ location: null });
      await expect(
        service.getStockByLocation('loc-missing', makeQuery(), actor),
      ).rejects.toThrow(NotFoundException);
      expect(locationRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'loc-missing', organizationId: 'org-1' },
        relations: { storage: { branch: true } },
      });
    });

    it('throws ForbiddenException when location.branch ≠ actor.branch', async () => {
      setup({
        location: {
          ...locationEntity,
          branchId: 'branch-OTHER',
          storage: { ...locationEntity.storage, branchId: 'branch-OTHER' },
        },
      });
      await expect(
        service.getStockByLocation('loc-1', makeQuery(), actor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns meta.location populated from join', async () => {
      setup({ rows: [] });
      const result = await service.getStockByLocation(
        'loc-1',
        makeQuery(),
        actor,
      );
      expect(result.meta.location).toEqual({
        id: 'loc-1',
        code: 'A-01',
        name: 'Aisle 1',
        type: LocationType.SHELF,
        isActive: true,
        storage: { id: 'stor-1', name: 'Main WH' },
        branch: { id: 'branch-1', name: 'Main Branch' },
      });
    });
  });

  describe('toItem mapping', () => {
    it('computes belowMin=true when quantity < threshold.minQty', async () => {
      setup({
        rows: [makeStockBalance({ quantity: '5' })],
        thresholds: [{ itemId: 'item-1', minQty: 10, maxQty: 100 }],
      });
      const result = await service.getStockByLocation(
        'loc-1',
        makeQuery(),
        actor,
      );
      expect(result.data[0].belowMin).toBe(true);
      expect(result.data[0].minQty).toBe(10);
      expect(result.data[0].quantity).toBe(5);
    });

    it('returns minQty=null/belowMin=false when no threshold row exists', async () => {
      setup({
        rows: [makeStockBalance({ quantity: '-3' })],
        thresholds: [],
      });
      const result = await service.getStockByLocation(
        'loc-1',
        makeQuery(),
        actor,
      );
      expect(result.data[0].belowMin).toBe(false);
      expect(result.data[0].minQty).toBeNull();
      expect(result.data[0].quantity).toBe(-3);
    });

    it('returns empty arrays when no barcodes/providers fetched', async () => {
      setup({ rows: [makeStockBalance()] });
      const result = await service.getStockByLocation(
        'loc-1',
        makeQuery(),
        actor,
      );
      expect(result.data[0].barcodes).toEqual([]);
      expect(result.data[0].providers).toEqual([]);
    });

    it('merges barcodes (ASC by code) and providers (primary-first, then name) by itemId', async () => {
      setup({
        rows: [makeStockBalance()],
        // Mock returns reverse order — service stays robust because barcodeRepo
        // is loaded ASC (here we mimic that via the test data already sorted).
        barcodes: [
          { itemId: 'item-1', code: '8934567890123' },
          { itemId: 'item-1', code: '8934567890124' },
        ],
        providers: [
          {
            itemId: 'item-1',
            providerId: 'p2',
            isPrimary: false,
            provider: { name: 'Bravo' },
          },
          {
            itemId: 'item-1',
            providerId: 'p1',
            isPrimary: true,
            provider: { name: 'Acme' },
          },
        ],
      });
      const result = await service.getStockByLocation(
        'loc-1',
        makeQuery(),
        actor,
      );
      expect(result.data[0].barcodes).toEqual([
        '8934567890123',
        '8934567890124',
      ]);
      expect(result.data[0].providers).toEqual([
        { providerId: 'p1', providerName: 'Acme', isPrimary: true },
        { providerId: 'p2', providerName: 'Bravo', isPrimary: false },
      ]);
    });

    it('serializes lastMovementAt as ISO string', async () => {
      setup({ rows: [makeStockBalance()] });
      const result = await service.getStockByLocation(
        'loc-1',
        makeQuery(),
        actor,
      );
      expect(result.data[0].lastMovementAt).toBe('2026-03-01T10:00:00.000Z');
    });

    it('serializes lastMovementAt as null when missing', async () => {
      setup({ rows: [makeStockBalance({ lastMovementAt: null })] });
      const result = await service.getStockByLocation(
        'loc-1',
        makeQuery(),
        actor,
      );
      expect(result.data[0].lastMovementAt).toBeNull();
    });
  });

  describe('filter mapping → findAndCount where', () => {
    function whereArg(): any {
      return stockBalanceRepo.findAndCount.mock.calls[0][0].where;
    }

    it('search → OR over item.code & item.name with same ILike pattern', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ search: 'nike' }),
        actor,
      );
      const w = whereArg();
      expect(Array.isArray(w)).toBe(true);
      expect(w).toHaveLength(2);
      expect(w[0].item.code).toBeInstanceOf(FindOperator);
      expect(w[0].item.code.type).toBe('ilike');
      expect(w[0].item.code.value).toBe('%nike%');
      expect(w[1].item.name).toBeInstanceOf(FindOperator);
      expect(w[1].item.name.value).toBe('%nike%');
    });

    it('search → escapes %, _, \\ to avoid wildcard injection', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ search: '10%_off' }),
        actor,
      );
      const w = whereArg();
      expect(w[0].item.code.value).toBe('%10\\%\\_off%');
    });

    it('barcode → item.barcodes.code equality', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ barcode: '8934567890123' }),
        actor,
      );
      const w = whereArg();
      expect(w.item.barcodes).toEqual({ code: '8934567890123' });
    });

    it('categoryId → item.categoryId equality', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ categoryId: 'cat-99' }),
        actor,
      );
      const w = whereArg();
      expect(w.item.categoryId).toBe('cat-99');
    });

    it('providerId → item.providers.providerId equality', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ providerId: 'prov-7' }),
        actor,
      );
      const w = whereArg();
      expect(w.item.providers).toEqual({ providerId: 'prov-7' });
    });

    it('isPosVisible=false → item.isPosVisible equality', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ isPosVisible: false }),
        actor,
      );
      const w = whereArg();
      expect(w.item.isPosVisible).toBe(false);
    });

    it('isActive=true → item.isActive equality', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ isActive: true }),
        actor,
      );
      const w = whereArg();
      expect(w.item.isActive).toBe(true);
    });

    it('always scopes by organizationId + locationId', async () => {
      setup({ rows: [] });
      await service.getStockByLocation('loc-1', makeQuery(), actor);
      const w = whereArg();
      expect(w.organizationId).toBe('org-1');
      expect(w.locationId).toBe('loc-1');
    });

    it('main findAndCount only loads many-to-one relations (item.category)', async () => {
      setup({ rows: [] });
      await service.getStockByLocation('loc-1', makeQuery(), actor);
      const opts = stockBalanceRepo.findAndCount.mock.calls[0][0];
      expect(opts.relations).toEqual({ item: { category: true } });
    });
  });

  describe('stockState filter', () => {
    function whereArg(): any {
      return stockBalanceRepo.findAndCount.mock.calls[0][0].where;
    }

    it('ALL → quantity unconstrained', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ stockState: StockStateFilter.ALL }),
        actor,
      );
      expect(whereArg().quantity).toBeUndefined();
    });

    it('POSITIVE → MoreThan(0)', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ stockState: StockStateFilter.POSITIVE }),
        actor,
      );
      const q = whereArg().quantity;
      expect(q).toBeInstanceOf(FindOperator);
      expect(q.type).toBe('moreThan');
      expect(q.value).toBe(0);
    });

    it('ZERO → Equal(0)', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ stockState: StockStateFilter.ZERO }),
        actor,
      );
      const q = whereArg().quantity;
      expect(q).toBeInstanceOf(FindOperator);
      expect(q.type).toBe('equal');
      expect(q.value).toBe(0);
    });

    it('NEGATIVE → LessThan(0)', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ stockState: StockStateFilter.NEGATIVE }),
        actor,
      );
      const q = whereArg().quantity;
      expect(q).toBeInstanceOf(FindOperator);
      expect(q.type).toBe('lessThan');
      expect(q.value).toBe(0);
    });

    it('BELOW_MIN → goes through find() path and filters by threshold.minQty', async () => {
      const sbBelow = makeStockBalance({
        itemId: 'item-1',
        quantity: '3',
      });
      const sbOK = makeStockBalance({
        id: 'sb-2',
        itemId: 'item-2',
        quantity: '20',
        item: { id: 'item-2', code: 'SKU-002' },
      });
      const sbNoThreshold = makeStockBalance({
        id: 'sb-3',
        itemId: 'item-3',
        quantity: '0',
        item: { id: 'item-3', code: 'SKU-003' },
      });

      setup({
        rows: [sbBelow, sbOK, sbNoThreshold],
        thresholds: [
          { itemId: 'item-1', minQty: 10, maxQty: 100 },
          { itemId: 'item-2', minQty: 5, maxQty: 50 },
        ],
      });

      const result = await service.getStockByLocation(
        'loc-1',
        makeQuery({ stockState: StockStateFilter.BELOW_MIN }),
        actor,
      );

      expect(stockBalanceRepo.find).toHaveBeenCalled();
      expect(stockBalanceRepo.findAndCount).not.toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].itemId).toBe('item-1');
      expect(result.meta.total).toBe(1);
    });
  });

  describe('pagination & sort', () => {
    it('applies skip/take from page & pageSize', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ page: 3, pageSize: 25 }),
        actor,
      );
      const opts = stockBalanceRepo.findAndCount.mock.calls[0][0];
      expect(opts.take).toBe(25);
      expect(opts.skip).toBe(50);
    });

    it('sortBy=quantity desc → order { quantity: DESC, item: { code: ASC } }', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ sortBy: 'quantity', sortOrder: 'desc' }),
        actor,
      );
      const opts = stockBalanceRepo.findAndCount.mock.calls[0][0];
      expect(opts.order).toEqual({
        quantity: 'DESC',
        item: { code: 'ASC' },
      });
    });

    it('sortBy=name asc → order { item: { name: ASC, code: ASC } }', async () => {
      setup({ rows: [] });
      await service.getStockByLocation(
        'loc-1',
        makeQuery({ sortBy: 'name', sortOrder: 'asc' }),
        actor,
      );
      const opts = stockBalanceRepo.findAndCount.mock.calls[0][0];
      expect(opts.order).toEqual({ item: { name: 'ASC', code: 'ASC' } });
    });

    it('returns meta.total from findAndCount', async () => {
      setup({
        rows: [makeStockBalance()],
        total: 123,
      });
      const result = await service.getStockByLocation(
        'loc-1',
        makeQuery({ page: 1, pageSize: 10 }),
        actor,
      );
      expect(result.meta.total).toBe(123);
      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(10);
    });

    it('paginates BELOW_MIN results in JS', async () => {
      const rows = Array.from({ length: 5 }, (_, i) => {
        const id = `item-${i + 1}`;
        return makeStockBalance({
          id: `sb-${i + 1}`,
          itemId: id,
          quantity: '1',
          item: { id, code: `SKU-${i + 1}` },
        });
      });
      const thresholds = rows.map((r) => ({
        itemId: r.itemId,
        minQty: 10,
        maxQty: null,
      }));
      setup({ rows, thresholds });

      const result = await service.getStockByLocation(
        'loc-1',
        makeQuery({
          stockState: StockStateFilter.BELOW_MIN,
          page: 2,
          pageSize: 2,
        }),
        actor,
      );
      expect(result.meta.total).toBe(5);
      expect(result.data).toHaveLength(2);
      expect(result.data.map((d) => d.itemId)).toEqual(['item-3', 'item-4']);
    });
  });

  describe('relation loading (one-to-many) is split off the paginated query', () => {
    it('loads barcodes via barcodeRepo.find with In(itemIds) scoped by org', async () => {
      setup({
        rows: [makeStockBalance({ itemId: 'item-1' })],
      });
      await service.getStockByLocation('loc-1', makeQuery(), actor);
      expect(barcodeRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
          }),
          order: { code: 'ASC' },
        }),
      );
      const w = barcodeRepo.find.mock.calls[0][0].where;
      expect(w.itemId).toBeInstanceOf(FindOperator);
      expect(w.itemId.type).toBe('in');
      expect(w.itemId.value).toEqual(['item-1']);
    });

    it('loads providers via itemProviderRepo.find with relations.provider', async () => {
      setup({ rows: [makeStockBalance({ itemId: 'item-1' })] });
      await service.getStockByLocation('loc-1', makeQuery(), actor);
      const call = itemProviderRepo.find.mock.calls[0][0];
      expect(call.relations).toEqual({ provider: true });
      expect(call.where.itemId.type).toBe('in');
      expect(call.where.itemId.value).toEqual(['item-1']);
    });

    it('loads thresholds scoped to current location only', async () => {
      setup({ rows: [makeStockBalance({ itemId: 'item-1' })] });
      await service.getStockByLocation('loc-1', makeQuery(), actor);
      const call = thresholdRepo.find.mock.calls[0][0];
      expect(call.where.locationId).toBe('loc-1');
      expect(call.where.organizationId).toBe('org-1');
      expect(call.where.itemId.value).toEqual(['item-1']);
    });

    it('skips loading when itemIds is empty', async () => {
      setup({ rows: [], total: 0 });
      await service.getStockByLocation('loc-1', makeQuery(), actor);
      expect(barcodeRepo.find).not.toHaveBeenCalled();
      expect(itemProviderRepo.find).not.toHaveBeenCalled();
      expect(thresholdRepo.find).not.toHaveBeenCalled();
    });
  });
});
