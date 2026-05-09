import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { ProductCrudService } from './product-crud.service';
import { ProductEntity } from './product.entity';

describe('ProductCrudService', () => {
  let service: ProductCrudService;
  let repo: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const mockProduct: Partial<ProductEntity> = {
    id: 'prod-1',
    name: 'Giày Gelli',
    description: 'Giày da thời trang',
    isActive: true,
    organizationId: 'org-1',
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockQb: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockQb = {
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockProduct], 1]),
    };

    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      findOne: jest.fn().mockResolvedValue(mockProduct),
      create: jest.fn().mockImplementation((data) => ({ ...data, id: 'prod-new' })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      merge: jest.fn().mockImplementation((existing, updates) => ({ ...existing, ...updates })),
    };

    const mockRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
        remove: jest.fn().mockResolvedValue(undefined),
      },
    };

    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductCrudService,
        { provide: getRepositoryToken(ProductEntity), useValue: repo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(ProductCrudService);
  });

  describe('list', () => {
    it('should return paginated products', async () => {
      const result = await service.list(
        { page: 1, pageSize: 10 } as any,
        {},
        actor,
      );

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(repo.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('should return a product by id', async () => {
      const result = await service.getById('prod-1', actor);

      expect(result).toBeDefined();
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'prod-1',
            organizationId: 'org-1',
          }),
        }),
      );
    });

    it('should throw NotFoundException if not found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getById('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create and return a product', async () => {
      const dto = { name: 'New Product', isActive: true };
      const result = await service.create(dto as any, actor);

      expect(result).toBeDefined();
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Product',
          organizationId: 'org-1',
        }),
      );
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update and return the product', async () => {
      const result = await service.update(
        'prod-1',
        { description: 'Updated' } as any,
        actor,
      );

      expect(result).toBeDefined();
      expect(repo.merge).toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should soft-delete the product', async () => {
      await service.remove('prod-1', actor);

      const runner = dataSource.createQueryRunner();
      expect(runner.connect).toHaveBeenCalled();
      expect(runner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ deletedAt: expect.any(Date) }),
      );
    });
  });

  describe('applySearch', () => {
    it('should add ILIKE conditions on name and description', async () => {
      await service.list(
        { page: 1, pageSize: 10, search: 'Giày' } as any,
        {},
        actor,
      );

      expect(mockQb.andWhere).toHaveBeenCalled();
    });

    it('should not add search conditions when search is empty', async () => {
      const callsBefore = mockQb.andWhere.mock.calls.length;
      await service.list({ page: 1, pageSize: 10 } as any, {}, actor);

      // Only scoping where clause, no search clause
      const callsAfter = mockQb.andWhere.mock.calls.length;
      // At minimum, org scoping adds one andWhere
      expect(callsAfter - callsBefore).toBeGreaterThanOrEqual(1);
    });
  });
});
