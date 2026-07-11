import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from '../../metrics/metrics.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InventoryItemCrudService } from './item-crud.service';
import { ItemEntity } from './item.entity';
import { ItemCategoryEntity } from './item-category.entity';
import { BrandEntity } from './brand.entity';
import { LocationEntity } from './location.entity';
import { ItemProviderEntity } from './item-provider.entity';
import { ItemUnitEntity } from './item-unit.entity';
import { ProductAttributeDefinitionEntity } from '../product/product-attribute-definition.entity';
import { ProductAttributeOptionEntity } from '../product/product-attribute-option.entity';
import { ItemAttributeValueEntity } from '../product/item-attribute-value.entity';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { CacheService } from '../../redis/cache.service';

/** Focused coverage for the nested-reconcile + brand-resolve behaviour added to update(). */
describe('InventoryItemCrudService.update (nested reconcile)', () => {
  let service: InventoryItemCrudService;
  let repo: Record<string, jest.Mock>;
  let brandRepo: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;
  let mockManager: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const mockItem: Partial<ItemEntity> = {
    id: 'item-1',
    code: 'SKU1',
    name: 'Item',
    unit: 'Cái',
    organizationId: 'org-1',
  };

  const emptyQb = () => {
    const qb: Record<string, jest.Mock> = {};
    ['innerJoin', 'leftJoinAndSelect', 'where', 'andWhere', 'select', 'orderBy']
      .forEach((m) => (qb[m] = jest.fn().mockReturnValue(qb)));
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    qb.getOne = jest.fn().mockResolvedValue(null);
    return qb;
  };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn().mockResolvedValue(mockItem),
      merge: jest.fn().mockImplementation((existing, updates) => ({ ...existing, ...updates })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      createQueryBuilder: jest.fn().mockImplementation(() => emptyQb()),
    };
    brandRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'brand-x', name: 'Nike' }),
    };
    mockManager = {
      delete: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockImplementation((_e, data) => ({ ...data })),
      save: jest.fn().mockImplementation((_e, rows) => Promise.resolve(rows)),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockManager)),
      query: jest.fn().mockResolvedValue([]),
    };

    const repoMock = () => ({
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockImplementation(() => emptyQb()),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryItemCrudService,
        { provide: MetricsService, useValue: { incCacheHit() {}, incCacheMiss() {}, observeCheckout() {}, incImportRows() {}, incImportJob() {}, observeKafkaPublish() {}, incKafkaPublishError() {}, observeHttp() {} } },
        { provide: getRepositoryToken(ItemEntity), useValue: repo },
        { provide: getRepositoryToken(ItemCategoryEntity), useValue: repoMock() },
        { provide: getRepositoryToken(BrandEntity), useValue: brandRepo },
        { provide: getRepositoryToken(LocationEntity), useValue: repoMock() },
        { provide: getRepositoryToken(ProductAttributeDefinitionEntity), useValue: repoMock() },
        { provide: getRepositoryToken(ProductAttributeOptionEntity), useValue: repoMock() },
        { provide: getRepositoryToken(ItemAttributeValueEntity), useValue: repoMock() },
        { provide: DataSource, useValue: dataSource },
        { provide: StockLedgerService, useValue: { recordMovement: jest.fn() } },
        { provide: CacheService, useValue: { invalidate: jest.fn(), getOrSet: jest.fn() } },
      ],
    }).compile();

    service = module.get(InventoryItemCrudService);
  });

  it('reconciles providers: deletes existing then re-inserts with exactly one primary', async () => {
    await service.update(
      'item-1',
      {
        providers: [
          { providerId: 'p1' },
          { providerId: 'p2', isPrimary: true },
        ],
      } as any,
      actor,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(mockManager.delete).toHaveBeenCalledWith(ItemProviderEntity, {
      itemId: 'item-1',
      organizationId: 'org-1',
    });
    const saved = mockManager.save.mock.calls.find(
      (c) => c[0] === ItemProviderEntity,
    )![1];
    expect(saved).toHaveLength(2);
    expect(saved.filter((r: any) => r.isPrimary)).toHaveLength(1);
    expect(saved.find((r: any) => r.providerId === 'p2').isPrimary).toBe(true);
  });

  it('reconciles units: deletes existing then re-inserts', async () => {
    await service.update(
      'item-1',
      { units: [{ unitName: 'Hộp', ratio: 10, isDefaultSell: true }] } as any,
      actor,
    );

    expect(mockManager.delete).toHaveBeenCalledWith(ItemUnitEntity, {
      itemId: 'item-1',
      organizationId: 'org-1',
    });
    const saved = mockManager.save.mock.calls.find(
      (c) => c[0] === ItemUnitEntity,
    )![1];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ unitName: 'Hộp', ratio: 10, isDefaultSell: true });
  });

  it('does NOT touch nested rows when providers/units are absent', async () => {
    await service.update('item-1', { name: 'Renamed' } as any, actor);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('resolves brandId and denormalizes the brand name', async () => {
    await service.update('item-1', { brandId: 'brand-x' } as any, actor);
    expect(brandRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'brand-x', organizationId: 'org-1' },
    });
    expect(repo.merge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ brand: 'Nike', brandId: 'brand-x' }),
    );
  });

  it('treats colors/sizes as virtual fields when updating a real item id', async () => {
    await service.update(
      'item-1',
      { name: 'Renamed', colors: ['Đen'], sizes: ['39'] } as any,
      actor,
    );

    expect(repo.merge).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'Renamed' }),
    );
    expect(repo.merge).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ colors: expect.anything(), sizes: expect.anything() }),
    );
  });

  it('hydrates initial stock fields from the opening stock ledger entry', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        initialStock: '12.5',
        notes: 'Tồn kho đầu kỳ — đơn giá nhập 45000',
      },
    ]);

    const record = await service.getById('item-1', actor);

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INITIAL_STOCK'),
      ['org-1', 'item-1'],
    );
    expect(record).toMatchObject({
      initialStock: 12.5,
      initialStockUnitPrice: 45000,
    });
  });
});
