import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ItemEntity } from '../../inventory/location/item.entity';
import { ProductEntity } from '../../inventory/product/product.entity';
import { StockBalanceEntity } from '../../inventory/ledger/stock-balance.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { ShowroomEntity } from '../../inventory/location/showroom.entity';
import { ProductAttributeDefinitionEntity } from '../../inventory/product/product-attribute-definition.entity';
import { ItemAttributeValueEntity } from '../../inventory/product/item-attribute-value.entity';
import { PosCatalogProductService } from './pos-catalog-product.service';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['cashier'],
};

type RepoMock = { find: jest.Mock; findOne: jest.Mock };
const repoMock = (): RepoMock => ({ find: jest.fn(), findOne: jest.fn() });

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
  let attrDefRepo: RepoMock;
  let itemAttrValueRepo: RepoMock;

  beforeEach(async () => {
    itemRepo = repoMock();
    productRepo = repoMock();
    balanceRepo = repoMock();
    locationRepo = repoMock();
    showroomRepo = repoMock();
    attrDefRepo = repoMock();
    itemAttrValueRepo = repoMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PosCatalogProductService,
        { provide: getRepositoryToken(ItemEntity), useValue: itemRepo },
        { provide: getRepositoryToken(ProductEntity), useValue: productRepo },
        { provide: getRepositoryToken(StockBalanceEntity), useValue: balanceRepo },
        { provide: getRepositoryToken(LocationEntity), useValue: locationRepo },
        { provide: getRepositoryToken(ShowroomEntity), useValue: showroomRepo },
        { provide: getRepositoryToken(ProductAttributeDefinitionEntity), useValue: attrDefRepo },
        { provide: getRepositoryToken(ItemAttributeValueEntity), useValue: itemAttrValueRepo },
      ],
    }).compile();

    service = module.get(PosCatalogProductService);
  });

  describe('listProducts', () => {
    beforeEach(() => {
      itemRepo.find.mockResolvedValue([variantS, variantM, standalone]);
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

    it('pushes categoryId into the item query (DB-level filter)', async () => {
      itemRepo.find.mockResolvedValue([variantS, variantM]); // DB already filtered to C1

      const res = await service.listProducts('branch-1', actor, {
        page: 1,
        pageSize: 20,
        categoryId: 'C1',
      } as any);

      expect(itemRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ categoryId: 'C1' }),
        }),
      );
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
});
