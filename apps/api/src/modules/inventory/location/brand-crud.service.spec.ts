import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BrandCrudService } from './brand-crud.service';
import { BrandEntity } from './brand.entity';

describe('BrandCrudService', () => {
  let service: BrandCrudService;
  let repo: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const mockBrand: Partial<BrandEntity> = {
    id: 'brand-1',
    name: 'Samsung',
    organizationId: 'org-1',
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockQb: Record<string, jest.Mock>;
  let mockRunner: any;

  beforeEach(async () => {
    mockQb = {
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockBrand], 1]),
    };

    repo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
      findOne: jest.fn().mockResolvedValue(mockBrand),
      create: jest.fn().mockImplementation((data) => ({ ...data, id: 'brand-new' })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      merge: jest.fn().mockImplementation((existing, updates) => ({ ...existing, ...updates })),
    };

    mockRunner = {
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
        BrandCrudService,
        { provide: getRepositoryToken(BrandEntity), useValue: repo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(BrandCrudService);
  });

  describe('list', () => {
    it('returns paginated brands scoped to the organization', async () => {
      const result = await service.list({ page: 1, pageSize: 10 } as any, {}, actor);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'entity.organizationId = :orgId',
        { orgId: 'org-1' },
      );
    });
  });

  describe('create', () => {
    it('trims the name and persists with org/createdBy from the actor', async () => {
      const result = await service.create({ name: '  Nike ' } as any, actor);

      expect(result).toBeDefined();
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Nike',
          organizationId: 'org-1',
          createdBy: 'user-1',
        }),
      );
      expect(repo.save).toHaveBeenCalled();
    });

    it('rejects a blank name', async () => {
      await expect(service.create({ name: '   ' } as any, actor)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getById', () => {
    it('throws NotFoundException when missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getById('missing', actor)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('hard-deletes the brand', async () => {
      await service.remove('brand-1', actor);
      expect(mockRunner.manager.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'brand-1' }),
      );
      expect(mockRunner.manager.save).not.toHaveBeenCalled();
    });
  });
});
