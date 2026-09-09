import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
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
import { TempWarehouseStagedStockService } from '../../inventory/temp-warehouse/temp-warehouse-staged-stock.service';
import { PosCatalogDirection } from '../dto/pos-catalog.query.dto';
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

/**
 * Chainable stub for the list route's aggregate stock query. The SQL itself is proved against a
 * restored production database (see 07-verification.md); what these tests pin is the decision
 * logic around it — which predicates each `direction` adds, and when the query is skipped
 * altogether — so `clauses` records every where/andWhere fragment in order.
 */
const aggregateQueryBuilderMock = (rows: unknown[]) => {
  const clauses: string[] = [];
  const qb: Record<string, jest.Mock> & { clauses: string[] } = { clauses } as never;
  for (const method of ['innerJoin', 'select', 'addSelect', 'groupBy', 'setParameters']) {
    qb[method] = jest.fn(() => qb);
  }
  for (const method of ['where', 'andWhere']) {
    qb[method] = jest.fn((clause: string) => {
      clauses.push(clause);
      return qb;
    });
  }
  qb.getRawMany = jest.fn().mockResolvedValue(rows);
  return qb;
};

/**
 * The same stub, but resolving from balance/location fixtures instead of a hand-written total: it
 * evaluates the predicates the builder actually added, so a test that flips `direction` still
 * exercises the classification rather than asserting its own arithmetic. The SQL those predicates
 * compile to is proved separately against a restored production database (07-verification.md).
 */
const aggregateQueryBuilderFor = (
  balanceRows: { itemId: string; locationId: string; quantity: number }[],
  activeLocations: { id: string; storageId?: string | null }[],
) => {
  const qb = aggregateQueryBuilderMock([]);
  qb.getRawMany = jest.fn(async () => {
    const locById = new Map(activeLocations.map((l) => [l.id, l]));
    const showroomStorageIds: string[] | undefined = qb.andWhere.mock.calls
      .map(([, params]) => (params as { showroomStorageIds?: string[] })?.showroomStorageIds)
      .find((ids) => ids !== undefined);
    const onlyShowroom = qb.clauses.some((c) => c.startsWith('l.storageId IN'));
    const exceptShowroom = qb.clauses.some((c) => c.includes('NOT IN'));

    const totals = new Map<string, number>();
    for (const b of balanceRows) {
      // A location absent from the fixture is one the INNER JOIN would not match.
      const loc = locById.get(b.locationId);
      if (!loc) continue;
      const inShowroom = (showroomStorageIds ?? []).includes(loc.storageId as string);
      if (onlyShowroom && !inShowroom) continue;
      if (exceptShowroom && inShowroom) continue;
      totals.set(b.itemId, (totals.get(b.itemId) ?? 0) + b.quantity);
    }
    // numeric SUM arrives as a string, exactly as node-postgres hands it over.
    return [...totals].map(([itemId, total]) => ({ itemId, total: String(total) }));
  });
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
  let getBranchDelta: jest.Mock;
  let dataSource: { query: jest.Mock };

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

    // The card-key CTE is raw SQL. Its results are proved against a restored
    // production database (see T-01-02's measurements); what these tests pin is
    // what the service asks for — which predicates and which ORDER BY.
    dataSource = { query: jest.fn().mockResolvedValue([]) };

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
        {
          provide: TempWarehouseStagedStockService,
          useValue: { getBranchDelta },
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(PosCatalogProductService);
  });

  describe('listProducts', () => {
    // The route no longer walks an in-memory catalogue: it asks the database for
    // one page of card ids, then for those cards' columns. These fixtures answer
    // as the database would, routed by which query is being run so the tests do
    // not depend on call order.
    const CARD_ROWS = [
      { card_id: 'P1', is_product: true },
      { card_id: 'I3', is_product: false },
    ];
    const DETAIL_ROWS = [
      {
        card_id: 'P1',
        is_product: true,
        name: 'Áo',
        description: 'Áo thun cotton',
        category_id: 'C1',
        category_name: 'Áo',
        unit: 'cái',
        min_price: '100',
        max_price: '150',
        variant_count: 2,
        item_ids: ['I1', 'I2'],
      },
      {
        card_id: 'I3',
        is_product: false,
        name: 'Bút',
        description: null,
        category_id: null,
        category_name: null,
        unit: 'cây',
        min_price: '50',
        max_price: '50',
        variant_count: 1,
        item_ids: ['I3'],
      },
    ];

    /** Routes each raw query to its fixture by what the SQL selects. */
    const answerWith = (over: {
      cards?: unknown[];
      details?: unknown[];
      count?: string;
      ranked?: unknown[];
    } = {}) => {
      dataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('count(*)')) return [{ count: over.count ?? '2' }];
        if (sql.includes('array_agg(i.id::text) AS item_ids')) {
          return (
            over.ranked ?? [
              { card_id: 'P1', item_ids: ['I1', 'I2'] },
              { card_id: 'I3', item_ids: ['I3'] },
            ]
          );
        }
        if (sql.includes('variant_count')) return over.details ?? DETAIL_ROWS;
        return over.cards ?? CARD_ROWS;
      });
    };

    const sqlMatching = (fragment: string): string | undefined =>
      (dataSource.query.mock.calls as [string, unknown[]][])
        .map(([sql]) => sql.replace(/\s+/g, ' '))
        .find((sql) => sql.includes(fragment));

    beforeEach(() => {
      answerWith();
      balanceRepo.createQueryBuilder.mockReturnValue(
        aggregateQueryBuilderFor(balances, locations),
      );
    });

    it('groups variants under a product card and exposes a standalone item as its own card', async () => {
      const res = await service.listProducts('branch-1', actor, {
        page: 1,
        pageSize: 20,
      } as any);

      expect(res.total).toBe(2);
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
        categoryName: 'Áo',
        imageUrl: null,
      });
      expect(itemCard).toMatchObject({
        kind: 'ITEM',
        id: 'I3',
        name: 'Bút',
        variantCount: 1,
        quantityOnHand: 10,
      });
    });

    it('holds nothing back between calls', async () => {
      // The org card blob, its 60-second rebuild and the invalidation call site
      // in item-crud are all gone: the service no longer takes a CacheService at
      // all, so a price edit is visible on the very next request. ADR-01. Two
      // identical calls must therefore both reach the database.
      const query = { page: 1, pageSize: 20 } as any;

      await service.listProducts('branch-1', actor, query);
      const first = dataSource.query.mock.calls.length;
      await service.listProducts('branch-1', actor, query);

      expect(dataSource.query.mock.calls.length).toBe(first * 2);
      expect(balanceRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
    });

    it('asks the database for stock only for the items on the page', async () => {
      const qb = aggregateQueryBuilderFor(balances, locations);
      balanceRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listProducts('branch-1', actor, {
        page: 1,
        pageSize: 20,
      } as any);

      // The whole point of the change: not the ~14,000 balance rows of the branch.
      expect(qb.clauses).toContain('sb.itemId IN (:...itemIds)');
      const narrowing = qb.andWhere.mock.calls
        .map(([, params]) => (params as { itemIds?: string[] })?.itemIds)
        .find((ids) => ids !== undefined);
      expect(narrowing).toEqual(['I1', 'I2', 'I3']);
    });

    it('delegates paging to the database instead of slicing in memory', async () => {
      await service.listProducts('branch-1', actor, {
        page: 3,
        pageSize: 20,
      } as any);

      const sql = sqlMatching('LIMIT');
      expect(sql).toContain('LIMIT $2 OFFSET $3');
      const params = (dataSource.query.mock.calls as [string, unknown[]][]).find(
        ([s]) => s.includes('LIMIT'),
      )![1];
      expect(params).toEqual(['org-1', 20, 40]);
    });

    it('pushes the search term into the card query', async () => {
      await service.listProducts('branch-1', actor, {
        page: 1,
        pageSize: 20,
        search: 'áo',
      } as any);

      expect(sqlMatching('bool_or(')).toBeDefined();
      const params = (dataSource.query.mock.calls as [string, unknown[]][]).find(
        ([s]) => s.includes('bool_or('),
      )![1];
      expect(params).toContain('%áo%');
    });

    it('includes descendant categories when a parent group is selected', async () => {
      categoryRepo.find.mockResolvedValue([
        { id: 'C1', parentGroupId: 'C0' },
        { id: 'C2', parentGroupId: 'C1' },
        { id: 'C9', parentGroupId: null },
      ]);

      await service.listProducts('branch-1', actor, {
        page: 1,
        pageSize: 20,
        categoryId: 'C0',
      } as any);

      const params = (dataSource.query.mock.calls as [string, unknown[]][]).find(
        ([s]) => s.includes('= ANY($2::uuid[])'),
      )![1];
      // C0 itself plus every descendant, and nothing outside the subtree.
      expect(params[1]).toEqual(expect.arrayContaining(['C0', 'C1', 'C2']));
      expect(params[1]).not.toContain('C9');
    });

    it('returns an empty page rather than throwing when the filter matches nothing', async () => {
      categoryRepo.find.mockResolvedValue([]);
      answerWith({ cards: [], details: [], count: '0' });

      const res = await service.listProducts('branch-1', actor, {
        page: 1,
        pageSize: 20,
        categoryId: 'C-missing',
      } as any);

      expect(res).toMatchObject({ data: [], total: 0, page: 1, pageSize: 20 });
    });

    it('shows a card with no branch stock at all as 0, not as missing', async () => {
      balanceRepo.createQueryBuilder.mockReturnValue(
        aggregateQueryBuilderFor([], locations),
      );

      const res = await service.listProducts('branch-1', actor, {
        page: 1,
        pageSize: 20,
      } as any);

      expect(res.data).toHaveLength(2);
      expect(res.data.every((c) => c.quantityOnHand === 0)).toBe(true);
    });

    describe('sortBy=quantityOnHand', () => {
      it('ranks on the branch-wide aggregate, not on one page of it', async () => {
        const qb = aggregateQueryBuilderFor(balances, locations);
        balanceRepo.createQueryBuilder.mockReturnValue(qb);

        const res = await service.listProducts('branch-1', actor, {
          page: 1,
          pageSize: 20,
          sortBy: 'quantityOnHand',
          sortOrder: 'desc',
        } as any);

        // Cannot narrow to a page it has not chosen yet — ADR-03. And having
        // paid for the branch-wide total once, it must not ask a second time
        // for a subset of what it already holds.
        expect(qb.clauses).not.toContain('sb.itemId IN (:...itemIds)');
        expect(balanceRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
        // P1 = 10, I3 = 10; both present, and total is the full card count.
        expect(res.total).toBe(2);
        expect(res.data.map((c) => c.id).sort()).toEqual(['I3', 'P1']);
      });

      it('orders ascending by stock when asked', async () => {
        balanceRepo.createQueryBuilder.mockReturnValue(
          aggregateQueryBuilderFor(
            [
              { itemId: 'I1', locationId: 'L1', quantity: 1 },
              { itemId: 'I3', locationId: 'L1', quantity: 7 },
            ],
            locations,
          ),
        );

        const res = await service.listProducts('branch-1', actor, {
          page: 1,
          pageSize: 20,
          sortBy: 'quantityOnHand',
          sortOrder: 'asc',
        } as any);

        expect(res.data.map((c) => c.id)).toEqual(['P1', 'I3']);
      });

      it('does not ask the database to order by name', async () => {
        await service.listProducts('branch-1', actor, {
          page: 1,
          pageSize: 20,
          sortBy: 'quantityOnHand',
        } as any);

        expect(sqlMatching('vi-VN-x-icu')).toBeUndefined();
      });
    });

    it('never hydrates the branch balance or location tables', async () => {
      await service.listProducts('branch-1', actor, {
        page: 1,
        pageSize: 20,
      } as any);

      expect(balanceRepo.find).not.toHaveBeenCalled();
      expect(locationRepo.find).not.toHaveBeenCalled();
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
      dataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('count(*)')) return [{ count: '1' }];
        if (sql.includes('variant_count')) {
          return [
            {
              card_id: 'I3',
              is_product: false,
              name: 'Bút',
              description: null,
              category_id: null,
              category_name: null,
              unit: 'cây',
              min_price: '50',
              max_price: '50',
              variant_count: 1,
              item_ids: ['I3'],
            },
          ];
        }
        return [{ card_id: 'I3', is_product: false }];
      });
      balanceRepo.createQueryBuilder.mockReturnValue(
        aggregateQueryBuilderFor(bxBalances, bxLocations),
      );

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

  /**
   * The list route reads stock through its own loader rather than `loadBranchStock`, which is
   * fenced off by ADR-01 of pos-variant-stock-columns because it owns `sellableQuantity`. These
   * cases cover the filter and `direction` matrix in isolation; T-01-02 covers the wiring.
   */
  describe('loadListStockTotals', () => {
    /** Invokes the private loader the way `listProducts` does. */
    const load = (direction?: PosCatalogDirection) =>
      (service as never as {
        loadListStockTotals: (
          orgId: string,
          branchId: string,
          direction?: PosCatalogDirection,
        ) => Promise<Map<string, number>>;
      }).loadListStockTotals('org-1', 'branch-1', direction);

    it('folds the aggregate rows into itemId -> total, coercing the numeric string', async () => {
      const qb = aggregateQueryBuilderMock([
        { itemId: 'I1', total: '8' },
        { itemId: 'I2', total: '2.50' },
      ]);
      balanceRepo.createQueryBuilder.mockReturnValue(qb);

      const totals = await load();

      expect(totals.get('I1')).toBe(8);
      expect(totals.get('I2')).toBe(2.5);
      // AC-04: an item with no balance row is absent, and listProducts reads it as `?? 0`.
      expect(totals.has('I3')).toBe(false);
    });

    it('sums decimals in the database rather than per row in JS', async () => {
      // 0.1 + 0.2 across two locations. Postgres adds these as numeric and hands back one
      // string, so the classic float artefact never reaches the card.
      const qb = aggregateQueryBuilderMock([{ itemId: 'I1', total: '0.30' }]);
      balanceRepo.createQueryBuilder.mockReturnValue(qb);

      expect((await load()).get('I1')).toBe(0.3);
    });

    it('filters out untracked rows and deactivated locations', async () => {
      const qb = aggregateQueryBuilderMock([]);
      balanceRepo.createQueryBuilder.mockReturnValue(qb);

      await load();

      // AC-03 — the untracked predicate is on the balance side.
      expect(qb.clauses).toContain('sb.isTracked = true');
      // AC-02 — the deactivated-location predicate rides on the join, which is what replaces
      // the old `if (!loc) continue`.
      const [, , joinCondition] = qb.innerJoin.mock.calls[0];
      expect(joinCondition).toContain('l.isActive = true');
      expect(joinCondition).toContain('l.organizationId = :orgId');
    });

    it('adds no storage predicate and reads no showrooms when direction is omitted', async () => {
      const qb = aggregateQueryBuilderMock([]);
      balanceRepo.createQueryBuilder.mockReturnValue(qb);

      await load();

      expect(showroomRepo.find).not.toHaveBeenCalled();
      expect(qb.clauses.some((c) => c.includes('storageId'))).toBe(false);
    });

    it('restricts to showroom storages for direction=SHOWROOM', async () => {
      showroomRepo.find.mockResolvedValue([{ storageId: 'S1' }, { storageId: 'S2' }]);
      const qb = aggregateQueryBuilderMock([]);
      balanceRepo.createQueryBuilder.mockReturnValue(qb);

      await load(PosCatalogDirection.SHOWROOM);

      expect(qb.clauses).toContain('l.storageId IN (:...showroomStorageIds)');
      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('IN (:...showroomStorageIds)'), {
        showroomStorageIds: ['S1', 'S2'],
      });
    });

    it('returns nothing for direction=SHOWROOM at a branch with no showroom, without querying', async () => {
      // Not an error: an unconfigured branch matched nothing under the old in-memory filter
      // either, because every location failed `showroomStorageIds.has(...)`.
      showroomRepo.find.mockResolvedValue([]);
      const qb = aggregateQueryBuilderMock([{ itemId: 'I1', total: '5' }]);
      balanceRepo.createQueryBuilder.mockReturnValue(qb);

      expect((await load(PosCatalogDirection.SHOWROOM)).size).toBe(0);
      expect(qb.getRawMany).not.toHaveBeenCalled();
    });

    it('keeps null-storage locations for direction=WAREHOUSE', async () => {
      showroomRepo.find.mockResolvedValue([{ storageId: 'S1' }]);
      const qb = aggregateQueryBuilderMock([]);
      balanceRepo.createQueryBuilder.mockReturnValue(qb);

      await load(PosCatalogDirection.WAREHOUSE);

      // A bare NOT IN evaluates to NULL for a null storage_id and would drop the row, but the
      // in-memory filter kept it — `showroomStorageIds.has(undefined)` is false. The IS NULL
      // arm is what preserves that.
      expect(qb.clauses).toContain(
        '(l.storageId IS NULL OR l.storageId NOT IN (:...showroomStorageIds))',
      );
    });

    it('adds no storage predicate for direction=WAREHOUSE at a branch with no showroom', async () => {
      showroomRepo.find.mockResolvedValue([]);
      const qb = aggregateQueryBuilderMock([{ itemId: 'I1', total: '5' }]);
      balanceRepo.createQueryBuilder.mockReturnValue(qb);

      // Nothing is a showroom, so everything is warehouse — the whole branch, unfiltered.
      expect((await load(PosCatalogDirection.WAREHOUSE)).get('I1')).toBe(5);
      expect(qb.clauses.some((c) => c.includes('storageId'))).toBe(false);
    });
  });
  describe('card-key query', () => {
    // The two private methods are exercised through listProducts in T-01-04.
    // Until then they are reached directly: this ticket is about the SQL the
    // service asks for, and routing through the old in-memory path would only
    // obscure it.
    const callPage = (query: Record<string, unknown>) =>
      (
        service as unknown as {
          loadCardKeysPage: (
            orgId: string,
            query: unknown,
            categoryIds: string[] | null,
          ) => Promise<unknown>;
        }
      ).loadCardKeysPage('org-1', { page: 1, pageSize: 20, ...query }, null);

    const sqlOf = (call: number): string =>
      (dataSource.query.mock.calls[call][0] as string).replace(/\s+/g, ' ');

    const paramsOf = (call: number): unknown[] =>
      dataSource.query.mock.calls[call][1] as unknown[];

    it('orders by name under the Vietnamese ICU collation by default', async () => {
      await callPage({});

      // The database is en_US.utf8; without this collation the order disagrees
      // with the JS localeCompare(name, 'vi') it replaced. See ADR-02.
      expect(sqlOf(0)).toContain('ORDER BY name COLLATE "vi-VN-x-icu" ASC');
    });

    it('orders by price columns without the collation', async () => {
      await callPage({ sortBy: 'minPrice', sortOrder: 'desc' });

      expect(sqlOf(0)).toContain('ORDER BY min_price DESC');
      expect(sqlOf(0)).not.toContain('vi-VN-x-icu');
    });

    it('falls back to the name ordering for an unknown sortBy', async () => {
      await callPage({ sortBy: 'somethingElse' });

      expect(sqlOf(0)).toContain('ORDER BY name COLLATE "vi-VN-x-icu" ASC');
    });

    it('binds the page size and offset rather than interpolating them', async () => {
      await callPage({ page: 3, pageSize: 20 });

      expect(sqlOf(0)).toContain('LIMIT $2 OFFSET $3');
      expect(paramsOf(0)).toEqual(['org-1', 20, 40]);
    });

    it('adds no category or search predicate when neither is asked for', async () => {
      await callPage({});

      expect(sqlOf(0)).not.toContain('HAVING');
      expect(sqlOf(0)).not.toContain('LIKE');
      expect(paramsOf(0)).toEqual(['org-1', 20, 0]);
    });

    it('filters a product card on its representative category, and a standalone item on its own', async () => {
      await (
        service as unknown as {
          loadCardKeysPage: (
            o: string,
            q: unknown,
            c: string[] | null,
          ) => Promise<unknown>;
        }
      ).loadCardKeysPage('org-1', { page: 1, pageSize: 20 }, ['cat-1', 'cat-2']);

      const sql = sqlOf(0);
      // Product arm: the representative variant's category, chosen by item id so
      // the rule is deterministic.
      expect(sql).toContain(
        "HAVING (array_agg(i.category_id ORDER BY i.id) FILTER (WHERE i.category_id IS NOT NULL))[1] = ANY($2::uuid[])",
      );
      // Standalone arm: the item's own category.
      expect(sql).toContain('AND i.category_id = ANY($2::uuid[])');
      expect(paramsOf(0)[1]).toEqual(['cat-1', 'cat-2']);
    });

    it('matches search across product, category, code, name and variant label', async () => {
      // Mixed case and padding on purpose: the column side is lowercased, so a
      // term bound as typed matches nothing. An already-lowercase fixture here
      // let exactly that bug through to the E2E run.
      await callPage({ search: '  Đầm Dạ  ' });

      const sql = sqlOf(0);
      // bool_or, not WHERE: a non-matching variant must still count towards the
      // card's MIN/MAX price, exactly as the in-memory filter did.
      expect(sql).toContain('HAVING bool_or(');
      for (const column of [
        'lower(p.name) LIKE $2',
        "lower(coalesce(c.name, '')) LIKE $2",
        'lower(i.code) LIKE $2',
        'lower(i.name) LIKE $2',
        "lower(coalesce(i.variant_label, '')) LIKE $2",
      ]) {
        expect(sql).toContain(column);
      }
      expect(paramsOf(0)[1]).toBe('%đầm dạ%');
    });

    it('counts the same card set the page is drawn from', async () => {
      dataSource.query.mockResolvedValue([{ count: '2539' }]);

      const total = await (
        service as unknown as {
          countCardKeys: (
            o: string,
            q: unknown,
            c: string[] | null,
          ) => Promise<number>;
        }
      ).countCardKeys('org-1', { page: 1, pageSize: 20, search: 'giay' }, [
        'cat-1',
      ]);

      expect(total).toBe(2539);
      const sql = sqlOf(0);
      expect(sql).toContain('SELECT count(*)::text AS count FROM card_keys');
      expect(sql).not.toContain('LIMIT');
      // Same filters as the page query, so total and data cannot disagree.
      expect(sql).toContain('= ANY($2::uuid[])');
      expect(sql).toContain('bool_or(');
    });

    it('reports zero rather than NaN when the count comes back empty', async () => {
      dataSource.query.mockResolvedValue([]);

      const total = await (
        service as unknown as {
          countCardKeys: (
            o: string,
            q: unknown,
            c: string[] | null,
          ) => Promise<number>;
        }
      ).countCardKeys('org-1', { page: 1, pageSize: 20 }, null);

      expect(total).toBe(0);
    });
  });
  describe('card details and page-scoped stock', () => {
    const details = (cardIds: string[]) =>
      (
        service as unknown as {
          loadCardDetails: (o: string, ids: string[]) => Promise<Map<string, unknown>>;
        }
      ).loadCardDetails('org-1', cardIds);

    const stockTotals = (itemIds?: string[]) =>
      (
        service as unknown as {
          loadListStockTotals: (
            o: string,
            b: string,
            d?: PosCatalogDirection,
            ids?: string[],
          ) => Promise<Map<string, number>>;
        }
      ).loadListStockTotals('org-1', 'branch-1', undefined, itemIds);

    it('asks for nothing when the page is empty', async () => {
      const result = await details([]);

      expect(result.size).toBe(0);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('maps a product card, coercing the numeric columns the driver returns as strings', async () => {
      dataSource.query.mockResolvedValue([
        {
          card_id: 'p-1',
          is_product: true,
          name: 'Áo thun',
          description: null,
          category_id: 'cat-1',
          category_name: 'Áo',
          unit: 'Cái',
          min_price: '150000.00',
          max_price: '250000.00',
          variant_count: 3,
          item_ids: ['i-1', 'i-2', 'i-3'],
        },
      ]);

      const result = await details(['p-1']);

      expect(result.get('p-1')).toEqual({
        kind: 'PRODUCT',
        name: 'Áo thun',
        description: null,
        categoryId: 'cat-1',
        categoryName: 'Áo',
        unit: 'Cái',
        minPrice: 150000,
        maxPrice: 250000,
        variantCount: 3,
        itemIds: ['i-1', 'i-2', 'i-3'],
      });
    });

    it('marks a row with no product as a standalone item card', async () => {
      dataSource.query.mockResolvedValue([
        {
          card_id: 'i-9',
          is_product: false,
          name: 'Bình giữ nhiệt',
          description: 'x',
          category_id: null,
          category_name: null,
          unit: 'Cái',
          min_price: '99000',
          max_price: '99000',
          variant_count: 1,
          item_ids: ['i-9'],
        },
      ]);

      const result = await details(['i-9']);

      expect(result.get('i-9')).toMatchObject({
        kind: 'ITEM',
        categoryId: null,
        categoryName: null,
        variantCount: 1,
      });
    });

    it('picks the category of the lowest-id variant, not whichever row came back first', async () => {
      await details(['p-1']);

      // Deterministic where buildOrgCards was not: it took "the first variant
      // with a category" in unspecified row order.
      const sql = (dataSource.query.mock.calls[0][0] as string).replace(/\s+/g, ' ');
      expect(sql).toContain(
        '(array_agg(i.category_id ORDER BY i.id) FILTER (WHERE i.category_id IS NOT NULL))[1]',
      );
      expect(sql).toContain(
        '(array_agg(c.name ORDER BY i.id) FILTER (WHERE c.name IS NOT NULL))[1]',
      );
    });

    it('never falls back to a variant name or description for a product card', async () => {
      const sql = (await details(['p-1']), dataSource.query.mock.calls[0][0] as string);

      // COALESCE(p.name, i.name) would silently invent a name for a product
      // whose own name is blank; buildOrgCards did not do that.
      expect(sql).toContain(
        'CASE WHEN i.product_id IS NOT NULL THEN p.name ELSE i.name END',
      );
      expect(sql).toContain(
        'CASE WHEN i.product_id IS NOT NULL THEN p.description ELSE i.description END',
      );
    });

    it('narrows the stock aggregate to the page when item ids are given', async () => {
      const qb = aggregateQueryBuilderMock([{ itemId: 'i-1', total: '5' }]);
      balanceRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await stockTotals(['i-1', 'i-2']);

      expect(qb.clauses).toContain('sb.itemId IN (:...itemIds)');
      expect(result.get('i-1')).toBe(5);
    });

    it('leaves the aggregate branch-wide when no item ids are given', async () => {
      const qb = aggregateQueryBuilderMock([]);
      balanceRepo.createQueryBuilder.mockReturnValue(qb);

      await stockTotals(undefined);

      // The sortBy=quantityOnHand path relies on this staying branch-wide.
      expect(qb.clauses).not.toContain('sb.itemId IN (:...itemIds)');
    });

    it('runs no query at all for an empty page', async () => {
      balanceRepo.createQueryBuilder.mockClear();

      const result = await stockTotals([]);

      expect(result.size).toBe(0);
      expect(balanceRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
