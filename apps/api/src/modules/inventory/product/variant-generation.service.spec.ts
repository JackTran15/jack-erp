import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { VariantGenerationService } from './variant-generation.service';
import { ProductEntity } from './product.entity';
import { ProductAttributeDefinitionEntity } from './product-attribute-definition.entity';
import { ItemEntity } from '../location/item.entity';
import { ItemAttributeValueEntity } from './item-attribute-value.entity';

describe('VariantGenerationService', () => {
  let service: VariantGenerationService;
  let productRepo: Record<string, jest.Mock>;
  let defRepo: Record<string, jest.Mock>;
  let itemRepo: Record<string, jest.Mock>;
  let junctionRepo: Record<string, jest.Mock & { manager: any }>;
  let dataSource: Record<string, jest.Mock>;
  let mockManager: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const mockProduct: Partial<ProductEntity> = {
    id: 'prod-1',
    name: 'Giày Test',
    defaultProviderId: 'provider-1',
    organizationId: 'org-1',
  };

  const sizeOptions = [
    { id: 'opt-39', attributeDefinitionId: 'def-size', valueLabel: '39', sortOrder: 0, codeSuffix: '39', organizationId: 'org-1' },
    { id: 'opt-40', attributeDefinitionId: 'def-size', valueLabel: '40', sortOrder: 1, codeSuffix: '40', organizationId: 'org-1' },
    { id: 'opt-43', attributeDefinitionId: 'def-size', valueLabel: '43', sortOrder: 2, codeSuffix: '43', organizationId: 'org-1' },
  ];

  const colorOptions = [
    { id: 'opt-nau', attributeDefinitionId: 'def-color', valueLabel: 'Nâu', sortOrder: 0, codeSuffix: null, organizationId: 'org-1' },
    { id: 'opt-den', attributeDefinitionId: 'def-color', valueLabel: 'Đen', sortOrder: 1, codeSuffix: null, organizationId: 'org-1' },
  ];

  const sizeDef: Partial<ProductAttributeDefinitionEntity> = {
    id: 'def-size',
    productId: 'prod-1',
    name: 'Size',
    sortOrder: 0,
    organizationId: 'org-1',
    options: sizeOptions as any,
  };

  const colorDef: Partial<ProductAttributeDefinitionEntity> = {
    id: 'def-color',
    productId: 'prod-1',
    name: 'Màu',
    sortOrder: 1,
    organizationId: 'org-1',
    options: colorOptions as any,
  };

  function setupMocks(overrides?: {
    product?: Partial<ProductEntity> | null;
    definitions?: Partial<ProductAttributeDefinitionEntity>[];
    existingVariant?: ItemEntity | null;
  }) {
    const product = overrides?.product !== undefined ? overrides.product : mockProduct;
    const definitions = overrides?.definitions ?? [sizeDef, colorDef];
    const existingVariant = overrides?.existingVariant ?? null;

    productRepo = {
      findOne: jest.fn().mockResolvedValue(product),
    };

    defRepo = {
      find: jest.fn().mockResolvedValue(definitions),
    };

    itemRepo = {};

    const mockManagerQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      subQuery: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      getQuery: jest.fn().mockReturnValue('subquery'),
      getOne: jest.fn().mockResolvedValue(existingVariant),
    };

    let itemCounter = 0;
    mockManager = {
      createQueryBuilder: jest.fn().mockReturnValue(mockManagerQb),
      create: jest.fn().mockImplementation((_Entity, data) => ({
        id: `item-${++itemCounter}`,
        ...data,
      })),
      save: jest.fn().mockImplementation((_Entity, entity) => {
        if (Array.isArray(entity)) return Promise.resolve(entity);
        return Promise.resolve(entity);
      }),
      findOne: jest.fn().mockResolvedValue(null),
    };

    junctionRepo = {
      manager: { ...mockManager },
    } as any;

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };
  }

  async function buildService() {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VariantGenerationService,
        { provide: getRepositoryToken(ProductEntity), useValue: productRepo },
        {
          provide: getRepositoryToken(ProductAttributeDefinitionEntity),
          useValue: defRepo,
        },
        { provide: getRepositoryToken(ItemEntity), useValue: itemRepo },
        {
          provide: getRepositoryToken(ItemAttributeValueEntity),
          useValue: junctionRepo,
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    return module.get(VariantGenerationService);
  }

  beforeEach(async () => {
    setupMocks();
    service = await buildService();
  });

  describe('generateVariants', () => {
    it('should generate 6 variants for 3×2 Cartesian product', async () => {
      const result = await service.generateVariants('prod-1', actor);

      expect(result.createdCount).toBe(6);
      expect(result.items).toHaveLength(6);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('should create items with correct variant labels', async () => {
      const result = await service.generateVariants('prod-1', actor);

      const labels = result.items.map((i) => i.variantLabel);
      expect(labels).toContain('39 · Nâu');
      expect(labels).toContain('39 · Đen');
      expect(labels).toContain('40 · Nâu');
      expect(labels).toContain('40 · Đen');
      expect(labels).toContain('43 · Nâu');
      expect(labels).toContain('43 · Đen');
    });

    it('should set productId on each created item', async () => {
      const result = await service.generateVariants('prod-1', actor);

      for (const item of result.items) {
        expect(item.productId).toBe('prod-1');
      }
    });

    it('should create junction rows for each item', async () => {
      await service.generateVariants('prod-1', actor);

      const junctionSaves = (mockManager.save as jest.Mock).mock.calls.filter(
        ([entity]: any) => entity === ItemAttributeValueEntity,
      );
      expect(junctionSaves).toHaveLength(6);
      for (const [, junctions] of junctionSaves) {
        expect(junctions).toHaveLength(2);
      }
    });
  });

  describe('idempotency', () => {
    it('should skip existing combos and create 0', async () => {
      setupMocks({
        existingVariant: { id: 'existing-item' } as ItemEntity,
      });
      service = await buildService();

      const result = await service.generateVariants('prod-1', actor);
      expect(result.createdCount).toBe(0);
      expect(result.items).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('should throw NotFoundException for non-existent product', async () => {
      setupMocks({ product: null });
      service = await buildService();

      await expect(
        service.generateVariants('missing', actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if product has no defaultProviderId', async () => {
      setupMocks({
        product: { ...mockProduct, defaultProviderId: undefined },
      });
      service = await buildService();

      await expect(
        service.generateVariants('prod-1', actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if no attribute definitions', async () => {
      setupMocks({ definitions: [] });
      service = await buildService();

      await expect(
        service.generateVariants('prod-1', actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if a definition has no options', async () => {
      setupMocks({
        definitions: [{ ...sizeDef, options: [] }],
      });
      service = await buildService();

      await expect(
        service.generateVariants('prod-1', actor),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('threshold warning', () => {
    it('should throw BadRequestException for >500 combos without force', async () => {
      const manyOptions = Array.from({ length: 501 }, (_, i) => ({
        id: `opt-${i}`,
        attributeDefinitionId: 'def-big',
        valueLabel: `Val${i}`,
        sortOrder: i,
        codeSuffix: `${i}`,
        organizationId: 'org-1',
      }));

      setupMocks({
        definitions: [
          {
            id: 'def-big',
            productId: 'prod-1',
            name: 'ManyValues',
            sortOrder: 0,
            organizationId: 'org-1',
            options: manyOptions as any,
          },
        ],
      });
      service = await buildService();

      await expect(
        service.generateVariants('prod-1', actor, false),
      ).rejects.toThrow(/ngưỡng/);
    });

    it('should proceed with force=true even above threshold', async () => {
      const manyOptions = Array.from({ length: 501 }, (_, i) => ({
        id: `opt-${i}`,
        attributeDefinitionId: 'def-big',
        valueLabel: `Val${i}`,
        sortOrder: i,
        codeSuffix: `${i}`,
        organizationId: 'org-1',
      }));

      setupMocks({
        definitions: [
          {
            id: 'def-big',
            productId: 'prod-1',
            name: 'ManyValues',
            sortOrder: 0,
            organizationId: 'org-1',
            options: manyOptions as any,
          },
        ],
      });
      service = await buildService();

      const result = await service.generateVariants('prod-1', actor, true);
      expect(result.createdCount).toBe(501);
    });
  });

  describe('code generation', () => {
    it('should generate item names with product name and variant label', async () => {
      const result = await service.generateVariants('prod-1', actor);

      for (const item of result.items) {
        expect(item.name).toContain('Giày Test');
        expect(item.name).toMatch(/\(.+\)/);
      }
    });
  });
});
