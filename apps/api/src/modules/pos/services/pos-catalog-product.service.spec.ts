import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemEntity } from '../../inventory/location/item.entity';
import { ProductEntity } from '../../inventory/product/product.entity';
import { StockBalanceEntity } from '../../inventory/ledger/stock-balance.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { ShowroomEntity } from '../../inventory/location/showroom.entity';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { ProductAttributeDefinitionEntity } from '../../inventory/product/product-attribute-definition.entity';
import { ItemAttributeValueEntity } from '../../inventory/product/item-attribute-value.entity';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { CacheService } from '../../redis/cache.service';
import { TempWarehouseStagedStockService } from '../../inventory/temp-warehouse/temp-warehouse-staged-stock.service';
import { PosCatalogProductService } from './pos-catalog-product.service';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['cashier'],
};

type RepoMock = {
  find: jest.Mock;
  findOne: jest.Mock;
  createQueryBuilder: jest.Mock;
};
const repoMock = (): RepoMock => ({
  find: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
});

/** Chainable query-builder stub whose getMany() resolves to the given rows. */
const queryBuilderMock = (rows: unknown[]) => {
  const qb: Record<string, jest.Mock> = {};
  for (const method of ['leftJoin', 'select', 'where', 'andWhere']) {
    qb[method] = jest.fn(() => qb);
  }
  qb.getMany = jest.fn().mockResolvedValue(rows);
  return qb;
};

// Product "Áo" with two variants; standalone item "Bút".
const product = { id: 'P1', name: 'Áo', description: 'Áo thun cotton', isActive: true };
const variantS = {
  id: 'I1',
  code: 'AO-S',
  name: 'Áo (S)',
  unit: 'cái',
  sellingPrice: 100,
  productId: 'P1',
  product,
  variantLabel: 'S',
  categoryId: 'C1',
  category: { id: 'C1', name: 'Áo' },
  isActive: true,
  isPosVisible: true,
};
const variantM = {
  id: 'I2',
  code: 'AO-M',
  name: 'Áo (M)',
  unit: 'cái',
  sellingPrice: '150', // decimal columns come back as strings from TypeORM
  productId: 'P1',
  product,
  variantLabel: 'M',
  categoryId: 'C1',
  category: { id: 'C1', name: 'Áo' },
  isActive: true,
  isPosVisible: true,
};
const standalone = {
  id: 'I3',
  code: 'BUT-01',
  name: 'Bút',
  unit: 'cây',
  sellingPrice: 50,
  productId: null,
  product: null,
  variantLabel: null,
  categoryId: null,
  category: null,
  isActive: true,
  isPosVisible: true,
};

const balances = [
  { itemId: 'I1', locationId: 'L1', quantity: 5 },
  { itemId: 'I1', locationId: 'L2', quantity: 3 },
  { itemId: 'I2', locationId: 'L1', quantity: 2 },
  { itemId: 'I3', locationId: 'L1', quantity: 10 },
];
const locations = [
  { id: 'L1', name: 'Kệ A', storageId: 'S1' },
  { id: 'L2', name: 'Kệ B', storageId: 'S1' },
];

describe('PosCatalogProductService', () => {
  let service: PosCatalogProductService;
  let itemRepo: RepoMock;
  let productRepo: RepoMock;
  let balanceRepo: RepoMock;
  let locationRepo: RepoMock;
  let showroomRepo: RepoMock;
  let storageRepo: RepoMock;
  let branchRepo: RepoMock;
  let attrDefRepo: RepoMock;
  let itemAttrValueRepo: RepoMock;
  let categoryRepo: RepoMock;
  let cacheService: { getOrSet: jest.Mock; invalidate: jest.Mock };
  let getBranchDelta: jest.Mock;

  beforeEach(async () => {
    // Default: nothing staged, so the pre-existing expectations keep meaning
    // "booked showroom stock".
    getBranchDelta = jest.fn().mockResolvedValue(new Map<string, number>());
    itemRepo = repoMock();
    productRepo = repoMock();
    balanceRepo = repoMock();
    locationRepo = repoMock();
    showroomRepo = repoMock();
    storageRepo = repoMock();
    // Most cases care about neither classification; an empty storage set keeps
    // showroom totals at 0 without touching what they do assert.
    storageRepo.find.mockResolvedValue([]);
    branchRepo = repoMock();
    // Default: no active branches, so the cross-branch bucket stays 0 unless a
    // case explicitly opts in.
    branchRepo.find.mockResolvedValue([]);
    attrDefRepo = repoMock();
    itemAttrValueRepo = repoMock();
    categoryRepo = repoMock();
    // Pass-through cache: always rebuild via the fetch fn so buildOrgCards runs.
    cacheService = {
      getOrSet: jest.fn((_ns, _key, fetchFn) => fetchFn()),
      invalidate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosCatalogProductService,
        { provide: getRepositoryToken(ItemEntity), useValue: itemRepo },
        { provide: getRepositoryToken(ProductEntity), useValue: productRepo },
        { provide: getRepositoryToken(StockBalanceEntity), useValue: balanceRepo },
        { provide: getRepositoryToken(LocationEntity), useValue: locationRepo },
        { provide: getRepositoryToken(ShowroomEntity), useValue: showroomRepo },
        { provide: getRepositoryToken(StorageEntity), useValue: storageRepo },
        { provide: getRepositoryToken(BranchEntity), useValue: branchRepo },
        { provide: getRepositoryToken(ProductAttributeDefinitionEntity), useValue: attrDefRepo },
        { provide: getRepositoryToken(ItemAttributeValueEntity), useValue: itemAttrValueRepo },
        { provide: getRepositoryToken(ItemCategoryEntity), useValue: categoryRepo },
        { provide: CacheService, useValue: cacheService },
        {
          provide: TempWarehouseStagedStockService,
          useValue: { getBranchDelta },
        },
      ],
    }).compile();

    service = module.get(PosCatalogProductService);
  });

  describe('listProducts', () => {
    beforeEach(() => {
      // buildOrgCards loads the whole org via the query builder (no category filter).
      itemRepo.createQueryBuilder.mockReturnValue(
        queryBuilderMock([variantS, variantM, standalone]),
      );
      balanceRepo.find.mockResolvedValue(balances);
      locationRepo.find.mockResolvedValue(locations);
    });

    it('groups variants under a product card and exposes a standalone item as its own card', async () => {
      const res = await service.listProducts('branch-1', actor, { page: 1, pageSize: 20 } as any);

      expect(res.total).toBe(2);
      // Sorted by name (vi): "Áo" before "Bút".
      const [productCard, itemCard] = res.data;

      expect(productCard).toMatchObject({
        kind: 'PRODUCT',
        id: 'P1',
        name: 'Áo',
        minPrice: 100,
        maxPrice: 150,
        variantCount: 2,
        quantityOnHand: 10, // 5 + 3 (I1) + 2 (I2)
        categoryId: 'C1',
        imageUrl: null,
      });

      expect(itemCard).toMatchObject({
        kind: 'ITEM',
        id: 'I3',
        name: 'Bút',
        minPrice: 50,
        maxPrice: 50,
        variantCount: 1,
        quantityOnHand: 10,
      });
    });

    it('serves the cached skeleton but merges live branch stock', async () => {
      // First call warms the cache; the pass-through mock still rebuilds, but the
      // stock query is always run live regardless of the cached skeleton.
      await service.listProducts('branch-1', actor, { page: 1, pageSize: 20 } as any);
      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 99 }]);

      const res = await service.listProducts('branch-1', actor, { page: 1, pageSize: 20 } as any);
      expect(cacheService.getOrSet).toHaveBeenCalled();
      expect(res.data.find((c) => c.id === 'P1')?.quantityOnHand).toBe(99);
    });

    it('paginates the grouped cards in memory', async () => {
      const res = await service.listProducts('branch-1', actor, { page: 1, pageSize: 1 } as any);
      expect(res.total).toBe(2);
      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe('P1');
    });

    it('filters by search across product name and variant codes', async () => {
      const res = await service.listProducts('branch-1', actor, {
        page: 1,
        pageSize: 20,
        search: 'but-01',
      } as any);
      expect(res.total).toBe(1);
      expect(res.data[0].id).toBe('I3');
    });

    it('filters by category (exact leaf) in memory over the cached skeleton', async () => {
      categoryRepo.find.mockResolvedValue([{ id: 'C1', parentGroupId: null }]);

      const res = await service.listProducts('branch-1', actor, {
        page: 1,
        pageSize: 20,
        categoryId: 'C1',
      } as any);

      // Standalone "Bút" (no category) is excluded; only the C1 product remains.
      expect(res.total).toBe(1);
      expect(res.data[0].id).toBe('P1');
    });

    it('includes descendant categories when a parent group is selected', async () => {
      // Parent C0 → child C1 (the variants live under C1).
      categoryRepo.find.mockResolvedValue([
        { id: 'C0', parentGroupId: null },
        { id: 'C1', parentGroupId: 'C0' },
      ]);

      const res = await service.listProducts('branch-1', actor, {
        page: 1,
        pageSize: 20,
        categoryId: 'C0',
      } as any);

      expect(res.total).toBe(1);
      expect(res.data[0].id).toBe('P1');
    });
  });

  describe('getProductDetail', () => {
    it('returns a product with its variants, attributes, and branch stock', async () => {
      productRepo.findOne.mockResolvedValue(product);
      itemRepo.find.mockResolvedValue([variantS, variantM]);
      attrDefRepo.find.mockResolvedValue([
        {
          name: 'Size',
          sortOrder: 0,
          options: [
            { valueLabel: 'S', sortOrder: 0 },
            { valueLabel: 'M', sortOrder: 1 },
          ],
        },
      ]);
      itemAttrValueRepo.find.mockResolvedValue([
        { itemId: 'I1', attributeDefinition: { name: 'Size', sortOrder: 0 }, option: { valueLabel: 'S' } },
        { itemId: 'I2', attributeDefinition: { name: 'Size', sortOrder: 0 }, option: { valueLabel: 'M' } },
      ]);
      balanceRepo.find.mockResolvedValue(balances.filter((b) => b.itemId !== 'I3'));
      locationRepo.find.mockResolvedValue(locations);

      const res = await service.getProductDetail('branch-1', 'P1', undefined, actor);

      expect(res.kind).toBe('PRODUCT');
      expect(res.minPrice).toBe(100);
      expect(res.maxPrice).toBe(150);
      expect(res.attributes).toEqual([{ name: 'Size', options: ['S', 'M'] }]);
      expect(res.variants).toHaveLength(2);

      const v1 = res.variants.find((v) => v.itemId === 'I1')!;
      expect(v1.attributes).toEqual([{ name: 'Size', value: 'S' }]);
      expect(v1.quantityOnHand).toBe(8);
      expect(v1.locations).toEqual([
        { locationId: 'L1', name: 'Kệ A', quantity: 5 },
        { locationId: 'L2', name: 'Kệ B', quantity: 3 },
      ]);
    });

    it('returns a standalone item as a single-variant detail when no product matches', async () => {
      productRepo.findOne.mockResolvedValue(null);
      itemRepo.findOne.mockResolvedValue(standalone);
      balanceRepo.find.mockResolvedValue(balances.filter((b) => b.itemId === 'I3'));
      locationRepo.find.mockResolvedValue(locations);

      const res = await service.getProductDetail('branch-1', 'I3', undefined, actor);

      expect(res.kind).toBe('ITEM');
      expect(res.attributes).toEqual([]);
      expect(res.variants).toHaveLength(1);
      expect(res.variants[0]).toMatchObject({ itemId: 'I3', quantityOnHand: 10 });
    });

    it('throws NotFound when neither a product nor an item resolves', async () => {
      productRepo.findOne.mockResolvedValue(null);
      itemRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getProductDetail('branch-1', 'missing', undefined, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // Field reproduced from branch MT46: BX140 sits 8 at a warehouse shelf and 4
  // at the showroom's default shelf. POS deducts from the branch's main
  // (showroom) storages only, so the variant dialog has to warn against 4.
  describe('sellable stock basis', () => {
    const bxLocations = [
      { id: 'L-WH', name: '999', storageId: 'S-WH' },
      { id: 'L-SR', name: 'Mặc định', storageId: 'S-MAIN' },
    ];
    const bxBalances = [
      { itemId: 'I3', locationId: 'L-WH', quantity: 8 },
      { itemId: 'I3', locationId: 'L-SR', quantity: 4 },
    ];

    beforeEach(() => {
      productRepo.findOne.mockResolvedValue(null);
      itemRepo.findOne.mockResolvedValue(standalone);
      balanceRepo.find.mockResolvedValue(bxBalances);
      locationRepo.find.mockResolvedValue(bxLocations);
      storageRepo.find.mockResolvedValue([
        { id: 'S-MAIN', isMainStorage: true },
        { id: 'S-WH', isMainStorage: false },
      ]);
    });

    it('keeps quantityOnHand as the branch-wide total', async () => {
      const res = await service.getProductDetail('branch-1', 'I3', undefined, actor);

      expect(res.variants[0].quantityOnHand).toBe(12);
    });

    it('exposes sellableQuantity from main-storage locations only', async () => {
      const res = await service.getProductDetail('branch-1', 'I3', undefined, actor);

      expect(res.variants[0].sellableQuantity).toBe(4);
    });

    // The variant dialog is the third way an item reaches the cart and it runs
    // through a different endpoint, so it has to fold in the staged lines too —
    // otherwise the same SKU shows one number in the dialog and another in the
    // search bar.
    it('adds stock staged into the showroom to sellableQuantity', async () => {
      getBranchDelta.mockResolvedValue(new Map([['I3', 3]]));

      const res = await service.getProductDetail('branch-1', 'I3', undefined, actor);

      expect(res.variants[0].sellableQuantity).toBe(7);
      expect(res.variants[0].quantityOnHand).toBe(12);
    });

    it('subtracts stock staged out of the showroom', async () => {
      getBranchDelta.mockResolvedValue(new Map([['I3', -1]]));

      const res = await service.getProductDetail('branch-1', 'I3', undefined, actor);

      expect(res.variants[0].sellableQuantity).toBe(3);
    });

    it('floors sellableQuantity at 0 when more is staged out than is on hand', async () => {
      getBranchDelta.mockResolvedValue(new Map([['I3', -9]]));

      const res = await service.getProductDetail('branch-1', 'I3', undefined, actor);

      expect(res.variants[0].sellableQuantity).toBe(0);
    });

    it('reads the staged delta scoped to the branch and organization', async () => {
      await service.getProductDetail('branch-1', 'I3', undefined, actor);

      expect(getBranchDelta).toHaveBeenCalledWith('branch-1', 'org-1');
    });

    it('leaves the direction filter on its own showrooms-table classification', async () => {
      // Guards ADR-02. The `showrooms` row deliberately points at the storage
      // that is NOT the main one, so the two classifications disagree: if
      // anyone repointed `direction` at is_main_storage the total would come
      // back 4 instead of 8, and fast stock transfer would silently change
      // which stock it offers.
      showroomRepo.find.mockResolvedValue([{ storageId: 'S-WH' }]);
      itemRepo.createQueryBuilder.mockReturnValue(queryBuilderMock([standalone]));

      const res = await service.listProducts('branch-1', actor, {
        page: 1,
        pageSize: 20,
        direction: 'showroom',
      } as any);

      expect(res.data[0].quantityOnHand).toBe(8);
    });
  });

  describe('loadDetailStockExtras', () => {
    const call = (itemIds: string[], branchId = 'branch-1') =>
      (service as any).loadDetailStockExtras('org-1', branchId, itemIds);

    it('returns an empty map and makes no repo calls when itemIds is empty', async () => {
      const res = await call([]);

      expect(res.size).toBe(0);
      expect(balanceRepo.find).not.toHaveBeenCalled();
      expect(locationRepo.find).not.toHaveBeenCalled();
      expect(storageRepo.find).not.toHaveBeenCalled();
      expect(branchRepo.find).not.toHaveBeenCalled();
      expect(showroomRepo.findOne).not.toHaveBeenCalled();
    });

    it('returns an entry with zero quantities and no storages when there are no matching stock balances', async () => {
      balanceRepo.find.mockResolvedValue([]);

      const res = await call(['I1']);

      // T-02-01: loadDetailStockExtras always sets an entry per itemId (to carry the
      // storages breakdown) even when the item has no balance at all.
      expect(res.size).toBe(1);
      expect(res.get('I1')).toEqual({ mainShowroomQuantity: 0, otherBranchQuantity: 0, storages: [] });
    });

    it('skips a balance whose location is missing (inactive location)', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L-GONE', quantity: 5 }]);
      locationRepo.find.mockResolvedValue([]); // L-GONE not returned -> inactive/missing
      storageRepo.find.mockResolvedValue([{ id: 'S1', branchId: 'branch-1', name: 'Kho A' }]);
      showroomRepo.findOne.mockResolvedValue({ storageId: 'S1' });

      const res = await call(['I1']);

      // The balance itself is dropped, but S1 is still an active branch storage, so it
      // still shows up in `storages` at quantity 0 (A-07).
      expect(res.get('I1')).toEqual({
        mainShowroomQuantity: 0,
        otherBranchQuantity: 0,
        storages: [{ storageId: 'S1', name: 'Kho A', quantity: 0, isMainShowroom: true }],
      });
    });

    it('skips a balance whose storage is missing (inactive storage)', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 5 }]);
      locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S-GONE' }]);
      storageRepo.find.mockResolvedValue([]); // S-GONE not returned -> inactive/missing
      showroomRepo.findOne.mockResolvedValue({ storageId: 'S-GONE' });

      const res = await call(['I1']);

      // No active branch storages are known at all, so storages stays empty.
      expect(res.get('I1')).toEqual({ mainShowroomQuantity: 0, otherBranchQuantity: 0, storages: [] });
    });

    it('adds to mainShowroomQuantity when the storage is the branch main showroom', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 5 }]);
      locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S-MAIN' }]);
      storageRepo.find.mockResolvedValue([{ id: 'S-MAIN', branchId: 'branch-1', name: 'Kho chính' }]);
      showroomRepo.findOne.mockResolvedValue({ storageId: 'S-MAIN' });

      const res = await call(['I1']);

      expect(res.get('I1')).toEqual({
        mainShowroomQuantity: 5,
        otherBranchQuantity: 0,
        storages: [{ storageId: 'S-MAIN', name: 'Kho chính', quantity: 5, isMainShowroom: true }],
      });
    });

    it('contributes to neither bucket when same-branch storage is not the main showroom', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 5 }]);
      locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S-OTHER' }]);
      storageRepo.find.mockResolvedValue([{ id: 'S-OTHER', branchId: 'branch-1', name: 'Kho phụ' }]);
      showroomRepo.findOne.mockResolvedValue({ storageId: 'S-MAIN' }); // different storage

      const res = await call(['I1']);

      expect(res.get('I1')).toEqual({
        mainShowroomQuantity: 0,
        otherBranchQuantity: 0,
        storages: [{ storageId: 'S-OTHER', name: 'Kho phụ', quantity: 5, isMainShowroom: false }],
      });
    });

    it('adds to otherBranchQuantity when the balance is at an active other branch', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 7 }]);
      locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S2' }]);
      storageRepo.find.mockResolvedValue([{ id: 'S2', branchId: 'branch-2' }]);
      branchRepo.find.mockResolvedValue([{ id: 'branch-2' }]);
      showroomRepo.findOne.mockResolvedValue(null);

      const res = await call(['I1']);

      // S2 belongs to branch-2, so it never enters branch-1's `storages` breakdown.
      expect(res.get('I1')).toEqual({ mainShowroomQuantity: 0, otherBranchQuantity: 7, storages: [] });
    });

    it('contributes to neither bucket when the other branch is not in the active set', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 7 }]);
      locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S2' }]);
      storageRepo.find.mockResolvedValue([{ id: 'S2', branchId: 'branch-2' }]);
      branchRepo.find.mockResolvedValue([]); // branch-2 not active
      showroomRepo.findOne.mockResolvedValue(null);

      const res = await call(['I1']);

      expect(res.get('I1')).toEqual({ mainShowroomQuantity: 0, otherBranchQuantity: 0, storages: [] });
    });

    it('leaves mainShowroomQuantity at 0 and does not throw when the branch has no main-showroom record (A-12)', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 5 }]);
      locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S1' }]);
      storageRepo.find.mockResolvedValue([{ id: 'S1', branchId: 'branch-1', name: 'Kho A' }]);
      showroomRepo.findOne.mockResolvedValue(null);

      const res = await call(['I1']);

      expect(res.get('I1')).toEqual({
        mainShowroomQuantity: 0,
        otherBranchQuantity: 0,
        storages: [{ storageId: 'S1', name: 'Kho A', quantity: 5, isMainShowroom: false }],
      });
    });

    it('calls balanceRepo.find exactly once per invocation', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 5 }]);
      locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S1' }]);
      storageRepo.find.mockResolvedValue([{ id: 'S1', branchId: 'branch-1' }]);
      showroomRepo.findOne.mockResolvedValue({ storageId: 'S1' });

      await call(['I1']);

      expect(balanceRepo.find).toHaveBeenCalledTimes(1);
    });

    it('keys the returned map per itemId, covering two items independently', async () => {
      balanceRepo.find.mockResolvedValue([
        { itemId: 'I1', locationId: 'L1', quantity: 5 },
        { itemId: 'I2', locationId: 'L2', quantity: 9 },
      ]);
      locationRepo.find.mockResolvedValue([
        { id: 'L1', storageId: 'S1' },
        { id: 'L2', storageId: 'S2' },
      ]);
      storageRepo.find.mockResolvedValue([
        { id: 'S1', branchId: 'branch-1', name: 'Kho A' },
        { id: 'S2', branchId: 'branch-2', name: 'Kho CN2' },
      ]);
      branchRepo.find.mockResolvedValue([{ id: 'branch-2' }]);
      showroomRepo.findOne.mockResolvedValue({ storageId: 'S1' });

      const res = await call(['I1', 'I2']);

      expect(res.get('I1')).toEqual({
        mainShowroomQuantity: 5,
        otherBranchQuantity: 0,
        storages: [{ storageId: 'S1', name: 'Kho A', quantity: 5, isMainShowroom: true }],
      });
      expect(res.get('I2')).toEqual({
        mainShowroomQuantity: 0,
        otherBranchQuantity: 9,
        // I2 has no balance at S1, but S1 is still the branch's only active storage and
        // still the main showroom, so it appears here at quantity 0 (A-07).
        storages: [{ storageId: 'S1', name: 'Kho A', quantity: 0, isMainShowroom: true }],
      });
    });

    it('sums stock across every warehouse of two different active other branches', async () => {
      balanceRepo.find.mockResolvedValue([
        { itemId: 'I1', locationId: 'L2a', quantity: 4 },
        { itemId: 'I1', locationId: 'L2b', quantity: 6 },
        { itemId: 'I1', locationId: 'L3a', quantity: 3 },
        { itemId: 'I1', locationId: 'L3b', quantity: 2 },
      ]);
      locationRepo.find.mockResolvedValue([
        { id: 'L2a', storageId: 'S2a' },
        { id: 'L2b', storageId: 'S2b' },
        { id: 'L3a', storageId: 'S3a' },
        { id: 'L3b', storageId: 'S3b' },
      ]);
      storageRepo.find.mockResolvedValue([
        { id: 'S2a', branchId: 'branch-2' },
        { id: 'S2b', branchId: 'branch-2' },
        { id: 'S3a', branchId: 'branch-3' },
        { id: 'S3b', branchId: 'branch-3' },
      ]);
      branchRepo.find.mockResolvedValue([{ id: 'branch-2' }, { id: 'branch-3' }]);
      showroomRepo.findOne.mockResolvedValue(null);

      const res = await call(['I1']);

      // None of the balances sit on a branch-1 storage, so `storages` stays empty.
      expect(res.get('I1')).toEqual({ mainShowroomQuantity: 0, otherBranchQuantity: 15, storages: [] });
    });

    it('excludes both a SUSPENDED and an ARCHIVED branch holding stock', async () => {
      balanceRepo.find.mockResolvedValue([
        { itemId: 'I1', locationId: 'L2', quantity: 5 },
        { itemId: 'I1', locationId: 'L3', quantity: 7 },
      ]);
      locationRepo.find.mockResolvedValue([
        { id: 'L2', storageId: 'S2' },
        { id: 'L3', storageId: 'S3' },
      ]);
      storageRepo.find.mockResolvedValue([
        { id: 'S2', branchId: 'branch-2' }, // SUSPENDED
        { id: 'S3', branchId: 'branch-3' }, // ARCHIVED
      ]);
      // The BranchStatus.ACTIVE query excludes both, so neither shows up here.
      branchRepo.find.mockResolvedValue([]);
      showroomRepo.findOne.mockResolvedValue(null);

      const res = await call(['I1']);

      // Neither S2 nor S3 belongs to branch-1, so `storages` stays empty.
      expect(res.get('I1')).toEqual({ mainShowroomQuantity: 0, otherBranchQuantity: 0, storages: [] });
    });

    it('scopes every query to organizationId (AC-04)', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 5 }]);
      locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S1' }]);
      storageRepo.find.mockResolvedValue([{ id: 'S1', branchId: 'branch-1' }]);
      showroomRepo.findOne.mockResolvedValue(null);

      await call(['I1']);

      expect(balanceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );
      expect(locationRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );
      expect(storageRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );
      expect(branchRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );
      expect(showroomRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );
    });

    it('queries stock_balances with is_tracked = true (A-09)', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 5 }]);
      locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S1' }]);
      storageRepo.find.mockResolvedValue([{ id: 'S1', branchId: 'branch-1' }]);
      showroomRepo.findOne.mockResolvedValue(null);

      await call(['I1']);

      expect(balanceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isTracked: true }) }),
      );
    });

    it('excludes stock at an inactive (is_active = false) warehouse of another branch (A-08)', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 5 }]);
      locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S-GONE' }]);
      // S-GONE (would belong to branch-2) is not returned -> deactivated storage.
      storageRepo.find.mockResolvedValue([]);
      branchRepo.find.mockResolvedValue([{ id: 'branch-2' }]);
      showroomRepo.findOne.mockResolvedValue(null);

      const res = await call(['I1']);

      // Both S1's storage and branch-1's own storage list are unknown here (storageRepo
      // returns [] entirely), so T-02-01's outer loop still sets an all-zero entry.
      expect(res.get('I1')).toEqual({ mainShowroomQuantity: 0, otherBranchQuantity: 0, storages: [] });
    });

    it('keys mainShowroomQuantity on showrooms.is_main_showroom, not storages.is_main_storage (ADR-03)', async () => {
      balanceRepo.find.mockResolvedValue([
        { itemId: 'I1', locationId: 'L-A', quantity: 5 },
        { itemId: 'I1', locationId: 'L-B', quantity: 2 },
      ]);
      locationRepo.find.mockResolvedValue([
        { id: 'L-A', storageId: 'S-A' },
        { id: 'L-B', storageId: 'S-B' },
      ]);
      // S-A is flagged is_main_storage but is NOT the showrooms.is_main_showroom row;
      // S-B is the opposite. If production code ever switched to reading
      // isMainStorage instead of the showrooms lookup, this would resolve to 5.
      storageRepo.find.mockResolvedValue([
        { id: 'S-A', branchId: 'branch-1', isMainStorage: true, name: 'Kho A' },
        { id: 'S-B', branchId: 'branch-1', isMainStorage: false, name: 'Kho B' },
      ]);
      showroomRepo.findOne.mockResolvedValue({ storageId: 'S-B' });

      const res = await call(['I1']);

      expect(res.get('I1')).toEqual({
        mainShowroomQuantity: 2,
        otherBranchQuantity: 0,
        // S-B is the main showroom (ADR-03), so it sorts first despite its name.
        storages: [
          { storageId: 'S-B', name: 'Kho B', quantity: 2, isMainShowroom: true },
          { storageId: 'S-A', name: 'Kho A', quantity: 5, isMainShowroom: false },
        ],
      });
    });

    it('does not floor mainShowroomQuantity at 0 when the showroom balance is negative (AC-07)', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: -1 }]);
      locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S-MAIN' }]);
      storageRepo.find.mockResolvedValue([{ id: 'S-MAIN', branchId: 'branch-1', name: 'Kho chính' }]);
      showroomRepo.findOne.mockResolvedValue({ storageId: 'S-MAIN' });

      const res = await call(['I1']);

      expect(res.get('I1')).toEqual({
        mainShowroomQuantity: -1,
        otherBranchQuantity: 0,
        storages: [{ storageId: 'S-MAIN', name: 'Kho chính', quantity: -1, isMainShowroom: true }],
      });
    });

    it('aggregates a standalone item (kind=ITEM) the same way as a variant', async () => {
      balanceRepo.find.mockResolvedValue([
        { itemId: 'I3', locationId: 'L2a', quantity: 4 },
        { itemId: 'I3', locationId: 'L2b', quantity: 6 },
      ]);
      locationRepo.find.mockResolvedValue([
        { id: 'L2a', storageId: 'S2a' },
        { id: 'L2b', storageId: 'S2b' },
      ]);
      storageRepo.find.mockResolvedValue([
        { id: 'S2a', branchId: 'branch-2' },
        { id: 'S2b', branchId: 'branch-2' },
      ]);
      branchRepo.find.mockResolvedValue([{ id: 'branch-2' }]);
      showroomRepo.findOne.mockResolvedValue(null);

      const res = await call(['I3']);

      expect(res.get('I3')).toEqual({ mainShowroomQuantity: 0, otherBranchQuantity: 10, storages: [] });
    });

    // T-02-03: the `storages` breakdown of the current branch (T-02-01/T-02-02).
    describe('storages breakdown', () => {
      it('lists every active branch storage, including ones with no balance for the item (AC-08)', async () => {
        balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 9 }]);
        locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S1' }]);
        storageRepo.find.mockResolvedValue([
          { id: 'S1', branchId: 'branch-1', name: 'Kho A' },
          { id: 'S2', branchId: 'branch-1', name: 'Kho B' },
          { id: 'S3', branchId: 'branch-1', name: 'Kho C' },
        ]);
        showroomRepo.findOne.mockResolvedValue(null);

        const res = await call(['I1']);

        expect(res.get('I1')?.storages).toEqual([
          { storageId: 'S1', name: 'Kho A', quantity: 9, isMainShowroom: false },
          { storageId: 'S2', name: 'Kho B', quantity: 0, isMainShowroom: false },
          { storageId: 'S3', name: 'Kho C', quantity: 0, isMainShowroom: false },
        ]);
      });

      it('reports a negative main-showroom balance in its own storage entry, matching mainShowroomQuantity (AC-08)', async () => {
        balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: -1 }]);
        locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S-MAIN' }]);
        storageRepo.find.mockResolvedValue([{ id: 'S-MAIN', branchId: 'branch-1', name: 'Kho chính' }]);
        showroomRepo.findOne.mockResolvedValue({ storageId: 'S-MAIN' });

        const res = await call(['I1']);

        const extras = res.get('I1')!;
        expect(extras.storages).toEqual([
          { storageId: 'S-MAIN', name: 'Kho chính', quantity: -1, isMainShowroom: true },
        ]);
        expect(extras.storages[0].quantity).toBe(extras.mainShowroomQuantity);
      });

      it('excludes a deactivated (is_active = false) storage holding stock from the array (AC-08)', async () => {
        balanceRepo.find.mockResolvedValue([
          { itemId: 'I1', locationId: 'L1', quantity: 5 },
          { itemId: 'I1', locationId: 'L3', quantity: 20 }, // L3 -> S3, deactivated
        ]);
        locationRepo.find.mockResolvedValue([
          { id: 'L1', storageId: 'S1' },
          { id: 'L3', storageId: 'S3' },
        ]);
        // S3 is not returned -> is_active = false, filtered out upstream.
        storageRepo.find.mockResolvedValue([
          { id: 'S1', branchId: 'branch-1', name: 'Kho A' },
          { id: 'S2', branchId: 'branch-1', name: 'Kho B' },
        ]);
        showroomRepo.findOne.mockResolvedValue(null);

        const res = await call(['I1']);

        const storages = res.get('I1')!.storages;
        expect(storages).toHaveLength(2);
        expect(storages.map((s: any) => s.storageId)).toEqual(['S1', 'S2']);
      });

      it('sorts the main showroom first, then the rest by name (AC-08)', async () => {
        balanceRepo.find.mockResolvedValue([]);
        locationRepo.find.mockResolvedValue([]);
        storageRepo.find.mockResolvedValue([
          { id: 'S-Z', branchId: 'branch-1', name: 'Kho Z' },
          { id: 'S-A', branchId: 'branch-1', name: 'Kho A' },
          { id: 'S-M', branchId: 'branch-1', name: 'Kho M (chính)' },
        ]);
        showroomRepo.findOne.mockResolvedValue({ storageId: 'S-M' });

        const res = await call(['I1']);

        expect(res.get('I1')?.storages.map((s: any) => s.storageId)).toEqual(['S-M', 'S-A', 'S-Z']);
        expect(res.get('I1')?.storages[0].isMainShowroom).toBe(true);
      });

      it('marks no storage as main showroom when the branch has no main-showroom record, but still lists every storage (AC-09)', async () => {
        balanceRepo.find.mockResolvedValue([{ itemId: 'I1', locationId: 'L1', quantity: 3 }]);
        locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S1' }]);
        storageRepo.find.mockResolvedValue([
          { id: 'S1', branchId: 'branch-1', name: 'Kho A' },
          { id: 'S2', branchId: 'branch-1', name: 'Kho B' },
        ]);
        showroomRepo.findOne.mockResolvedValue(null);

        const res = await call(['I1']);

        const storages = res.get('I1')!.storages;
        expect(storages).toHaveLength(2);
        expect(storages.every((s: any) => s.isMainShowroom === false)).toBe(true);
      });

      it('excludes a storage belonging to another branch from the array (AC-08)', async () => {
        balanceRepo.find.mockResolvedValue([
          { itemId: 'I1', locationId: 'L1', quantity: 5 },
          { itemId: 'I1', locationId: 'L2', quantity: 8 },
        ]);
        locationRepo.find.mockResolvedValue([
          { id: 'L1', storageId: 'S1' },
          { id: 'L2', storageId: 'S2' },
        ]);
        storageRepo.find.mockResolvedValue([
          { id: 'S1', branchId: 'branch-1', name: 'Kho A' },
          { id: 'S2', branchId: 'branch-2', name: 'Kho CN2' },
        ]);
        branchRepo.find.mockResolvedValue([{ id: 'branch-2' }]);
        showroomRepo.findOne.mockResolvedValue(null);

        const res = await call(['I1']);

        const extras = res.get('I1')!;
        expect(extras.storages).toEqual([
          { storageId: 'S1', name: 'Kho A', quantity: 5, isMainShowroom: false },
        ]);
        expect(extras.otherBranchQuantity).toBe(8);
      });

      // 500 variants x 5 branch storages = 2500 storage entries total across the map;
      // this is the payload-size case the ticket asks to keep a record of.
      it('returns exactly 5 storages per variant across a 500-variant product', async () => {
        const itemIds = Array.from({ length: 500 }, (_, i) => `V${i + 1}`);
        balanceRepo.find.mockResolvedValue(
          itemIds.map((itemId) => ({ itemId, locationId: 'L1', quantity: 2 })),
        );
        locationRepo.find.mockResolvedValue([{ id: 'L1', storageId: 'S1' }]);
        storageRepo.find.mockResolvedValue([
          { id: 'S1', branchId: 'branch-1', name: 'Kho A' },
          { id: 'S2', branchId: 'branch-1', name: 'Kho B' },
          { id: 'S3', branchId: 'branch-1', name: 'Kho C' },
          { id: 'S4', branchId: 'branch-1', name: 'Kho D' },
          { id: 'S5', branchId: 'branch-1', name: 'Kho E' },
        ]);
        showroomRepo.findOne.mockResolvedValue({ storageId: 'S1' });

        const res = await call(itemIds);

        expect(res.size).toBe(500);
        for (const itemId of itemIds) {
          expect(res.get(itemId)!.storages).toHaveLength(5);
        }
      });
    });
  });

  // mainShowroomQuantity (this feature) and sellableQuantity (temp-warehouse staging)
  // are computed by two independent methods on purpose (ADR-01) — these guard that
  // neither one leaks into the other's result.
  describe('mainShowroomQuantity vs sellableQuantity on the detail route', () => {
    beforeEach(() => {
      productRepo.findOne.mockResolvedValue(null);
      itemRepo.findOne.mockResolvedValue(standalone);
    });

    it('leaves mainShowroomQuantity unchanged when stock is staged into the showroom', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I3', locationId: 'L1', quantity: 5 }]);
      locationRepo.find.mockResolvedValue([{ id: 'L1', name: 'Mặc định', storageId: 'S-MAIN' }]);
      storageRepo.find.mockResolvedValue([
        { id: 'S-MAIN', branchId: 'branch-1', isMainStorage: true },
      ]);
      showroomRepo.findOne.mockResolvedValue({ storageId: 'S-MAIN' });
      getBranchDelta.mockResolvedValue(new Map([['I3', 3]]));

      const res = await service.getProductDetail('branch-1', 'I3', undefined, actor);

      expect(res.variants[0].mainShowroomQuantity).toBe(5);
    });

    // Regression guard for the two prior features at once: this goes red if anyone
    // drops `stagedStock.getBranchDelta` from `loadBranchStock` — sellableQuantity
    // would come back -1 (unfloored) instead of 2.
    it('still folds staged stock into sellableQuantity, floored at 0, with a negative on-hand balance', async () => {
      balanceRepo.find.mockResolvedValue([{ itemId: 'I3', locationId: 'L1', quantity: -1 }]);
      locationRepo.find.mockResolvedValue([{ id: 'L1', name: 'Mặc định', storageId: 'S-MAIN' }]);
      storageRepo.find.mockResolvedValue([
        { id: 'S-MAIN', branchId: 'branch-1', isMainStorage: true },
      ]);
      showroomRepo.findOne.mockResolvedValue({ storageId: 'S-MAIN' });
      getBranchDelta.mockResolvedValue(new Map([['I3', 3]]));

      const res = await service.getProductDetail('branch-1', 'I3', undefined, actor);

      expect(res.variants[0].sellableQuantity).toBe(2);
      expect(res.variants[0].mainShowroomQuantity).toBe(-1);
    });
  });

  // T-01-05: the performance risk of this feature is not a slow query, it's a
  // *repeated* one — one stock read per variant (or per branch) instead of one
  // read for the whole product. A 500-variant product would be the difference
  // between 2 reads and 1000+.
  describe('getProductDetail avoids N+1 stock reads on the detail route', () => {
    const VARIANT_COUNT = 24;
    const bigProduct = { id: 'PBIG', name: 'Áo nhiều biến thể', description: null, isActive: true };
    const bigVariants = Array.from({ length: VARIANT_COUNT }, (_, i) => ({
      id: `VB${i + 1}`,
      code: `VB-${i + 1}`,
      name: `Áo nhiều biến thể (${i + 1})`,
      unit: 'cái',
      sellingPrice: 100,
      productId: bigProduct.id,
      product: bigProduct,
      variantLabel: `${i + 1}`,
      categoryId: null,
      category: null,
      isActive: true,
      isPosVisible: true,
    }));
    const bigItemIds = bigVariants.map((v) => v.id);

    // Stock spread across three branches so both the same-branch and
    // cross-branch buckets in loadDetailStockExtras have something to sum,
    // exactly as the ticket asks for.
    const bigLocations = [
      { id: 'LB-MAIN', name: 'Mặc định', storageId: 'SB-MAIN' },
      { id: 'LB-B2', name: 'Kho CN2', storageId: 'SB-B2' },
      { id: 'LB-B3', name: 'Kho CN3', storageId: 'SB-B3' },
    ];
    const bigStorages = [
      { id: 'SB-MAIN', branchId: 'branch-1', isMainStorage: true, name: 'Mặc định' },
      { id: 'SB-B2', branchId: 'branch-2', isMainStorage: true, name: 'Kho CN2' },
      { id: 'SB-B3', branchId: 'branch-3', isMainStorage: true, name: 'Kho CN3' },
    ];
    const bigBalances = bigItemIds.flatMap((itemId) => [
      { itemId, locationId: 'LB-MAIN', quantity: 5 },
      { itemId, locationId: 'LB-B2', quantity: 3 },
      { itemId, locationId: 'LB-B3', quantity: 2 },
    ]);

    beforeEach(() => {
      productRepo.findOne.mockResolvedValue(bigProduct);
      itemRepo.find.mockResolvedValue(bigVariants);
      attrDefRepo.find.mockResolvedValue([]);
      itemAttrValueRepo.find.mockResolvedValue([]);
      balanceRepo.find.mockResolvedValue(bigBalances);
      locationRepo.find.mockResolvedValue(bigLocations);
      storageRepo.find.mockResolvedValue(bigStorages);
      branchRepo.find.mockResolvedValue([{ id: 'branch-2' }, { id: 'branch-3' }]);
      showroomRepo.findOne.mockResolvedValue({ storageId: 'SB-MAIN' });
    });

    it('reads stock_balances at most twice for a whole product, regardless of variant count', async () => {
      await service.getProductDetail('branch-1', bigProduct.id, undefined, actor);

      // One read from loadBranchStock (quantityOnHand/sellableQuantity), one from
      // loadDetailStockExtras (mainShowroomQuantity/otherBranchQuantity) — never
      // one per variant.
      expect(balanceRepo.find.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('narrows the extras stock_balances read to itemId In(...) with every variant id, not a table scan', async () => {
      await service.getProductDetail('branch-1', bigProduct.id, undefined, actor);

      // The extras read is the second balanceRepo.find call (loadBranchStock runs first).
      const extrasCallWhere = balanceRepo.find.mock.calls[1][0].where;
      expect(extrasCallWhere.itemId).toEqual(In(bigItemIds));
      expect(extrasCallWhere.itemId.value).toHaveLength(VARIANT_COUNT);
    });

    it('reads branches, storages and the main-showroom lookup a bounded number of times, not once per variant', async () => {
      await service.getProductDetail('branch-1', bigProduct.id, undefined, actor);

      // branchRepo.find / showroomRepo.findOne are called once, from
      // loadDetailStockExtras only (loadBranchStock only touches showroomRepo when a
      // `direction` filter is given, which the detail route never passes).
      expect(branchRepo.find.mock.calls.length).toBeLessThanOrEqual(1);
      expect(showroomRepo.findOne.mock.calls.length).toBeLessThanOrEqual(1);
      expect(showroomRepo.find.mock.calls.length).toBe(0);
      // storageRepo.find is called once per helper (loadBranchStock, then
      // loadDetailStockExtras) — bounded and independent of variant count, not
      // once per variant.
      expect(storageRepo.find.mock.calls.length).toBeLessThanOrEqual(2);
    });
  });
});
