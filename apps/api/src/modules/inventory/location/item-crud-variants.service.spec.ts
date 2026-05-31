import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InventoryItemCrudService } from './item-crud.service';
import { ItemEntity } from './item.entity';
import { ItemCategoryEntity } from './item-category.entity';
import { BrandEntity } from './brand.entity';
import { LocationEntity } from './location.entity';
import { ProductEntity } from '../product/product.entity';
import { ItemBarcodeEntity } from './item-barcode.entity';
import { ProductAttributeDefinitionEntity } from '../product/product-attribute-definition.entity';
import { ProductAttributeOptionEntity } from '../product/product-attribute-option.entity';
import { ItemAttributeValueEntity } from '../product/item-attribute-value.entity';
import { StockLedgerService } from '../ledger/stock-ledger.service';

/** Proves createProductWithVariants persists the per-variant price/SKU/barcode
 *  sent in variants[], instead of applying the top-level price to every row. */
describe('InventoryItemCrudService.create (product with variants)', () => {
  let service: InventoryItemCrudService;
  let itemRepo: Record<string, jest.Mock>;
  let productRepo: Record<string, jest.Mock>;
  let barcodeRepo: Record<string, jest.Mock>;

  const actor = {
    userId: 'u1',
    organizationId: 'org-1',
    branchId: 'b1',
    roles: [],
    permissions: [],
  };

  const qbNull = () => {
    const qb: Record<string, jest.Mock> = {};
    ['where', 'andWhere', 'select', 'innerJoin', 'leftJoinAndSelect'].forEach(
      (m) => (qb[m] = jest.fn().mockReturnValue(qb)),
    );
    qb.getOne = jest.fn().mockResolvedValue(null);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    return qb;
  };

  const idGen = (prefix: string) => {
    let n = 0;
    return jest
      .fn()
      .mockImplementation((e: Record<string, unknown>) =>
        Promise.resolve({ ...e, id: `${prefix}-${++n}` }),
      );
  };

  beforeEach(async () => {
    itemRepo = {
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: idGen('item'),
    };
    productRepo = {
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: jest.fn().mockImplementation((e) => Promise.resolve({ ...e, id: 'prod-1' })),
    };
    barcodeRepo = {
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: idGen('bc'),
    };
    const attrRepo = () => ({
      createQueryBuilder: jest.fn().mockImplementation(() => qbNull()),
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: idGen('attr'),
      findOne: jest.fn().mockResolvedValue(null),
    });

    const dataSource = {
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === ProductEntity) return productRepo;
        if (entity === ItemBarcodeEntity) return barcodeRepo;
        return itemRepo;
      }),
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryItemCrudService,
        { provide: getRepositoryToken(ItemEntity), useValue: itemRepo },
        {
          provide: getRepositoryToken(ItemCategoryEntity),
          useValue: { findOne: jest.fn().mockResolvedValue({ id: 'cat' }) },
        },
        {
          provide: getRepositoryToken(BrandEntity),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: getRepositoryToken(LocationEntity),
          useValue: { createQueryBuilder: jest.fn().mockImplementation(() => qbNull()) },
        },
        { provide: getRepositoryToken(ProductAttributeDefinitionEntity), useValue: attrRepo() },
        { provide: getRepositoryToken(ProductAttributeOptionEntity), useValue: attrRepo() },
        { provide: getRepositoryToken(ItemAttributeValueEntity), useValue: attrRepo() },
        { provide: DataSource, useValue: dataSource },
        { provide: StockLedgerService, useValue: { recordMovement: jest.fn() } },
      ],
    }).compile();

    service = module.get(InventoryItemCrudService);
  });

  it('uses each variant own price/SKU, not the top-level price', async () => {
    await service.create(
      {
        code: 'P1',
        name: 'Prod',
        unit: 'Giày',
        purchasePrice: 100,
        sellingPrice: 300,
        colors: ['Den', 'do'],
        sizes: ['38', '39'],
        variants: [
          { color: 'Den', size: '38', sku: 'P1-DEN-38', barcode: 'BC-1', purchasePrice: 300, sellPrice: 500 },
          { color: 'Den', size: '39', sku: 'P1-DEN-39', purchasePrice: 310, sellPrice: 510 },
          { color: 'do', size: '38', sku: 'P1-DO-38', purchasePrice: 320, sellPrice: 520 },
          { color: 'do', size: '39', sku: 'P1-DO-39', purchasePrice: 330, sellPrice: 530 },
        ],
      },
      actor,
    );

    const savedItems = itemRepo.save.mock.calls.map((c) => c[0]);
    expect(savedItems).toHaveLength(4);
    const byCode = Object.fromEntries(savedItems.map((i) => [i.code, i]));
    // Per-variant prices win over the top-level 100/300.
    expect(byCode['P1-DEN-38']).toMatchObject({ purchasePrice: 300, sellingPrice: 500 });
    expect(byCode['P1-DEN-39']).toMatchObject({ purchasePrice: 310, sellingPrice: 510 });
    expect(byCode['P1-DO-39']).toMatchObject({ purchasePrice: 330, sellingPrice: 530 });
    // No variant kept the top-level price.
    expect(savedItems.every((i) => i.purchasePrice !== 100)).toBe(true);

    // Barcodes: explicit one used, otherwise cloned from SKU.
    const savedBarcodes = barcodeRepo.save.mock.calls.map((c) => c[0].code);
    expect(savedBarcodes).toContain('BC-1');
    expect(savedBarcodes).toContain('P1-DEN-39');
  });
});
