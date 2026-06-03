import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InventoryItemCategoryCrudService } from './item-category-crud.service';
import { ItemCategoryEntity } from './item-category.entity';
import {
  CommissionMethod,
  ItemCategoryCommissionEntity,
} from './item-category-commission.entity';

describe('InventoryItemCategoryCrudService', () => {
  let service: InventoryItemCategoryCrudService;
  let repo: Record<string, jest.Mock>;
  let commissionRepo: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;
  let mockManager: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const mockCategory: Partial<ItemCategoryEntity> = {
    id: 'cat-1',
    code: 'NHOM01',
    name: 'Giày',
    organizationId: 'org-1',
    createdBy: 'user-1',
  };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn().mockResolvedValue(mockCategory),
      create: jest.fn().mockImplementation((data) => ({ ...data, id: 'cat-new' })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      merge: jest.fn().mockImplementation((existing, updates) => ({ ...existing, ...updates })),
    };

    commissionRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    mockManager = {
      delete: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockImplementation((_e, data) => ({ ...data })),
      save: jest.fn().mockImplementation((_e, rows) => Promise.resolve(rows)),
    };

    dataSource = {
      createQueryRunner: jest.fn(),
      transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryItemCategoryCrudService,
        { provide: getRepositoryToken(ItemCategoryEntity), useValue: repo },
        { provide: getRepositoryToken(ItemCategoryCommissionEntity), useValue: commissionRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(InventoryItemCategoryCrudService);
  });

  describe('create', () => {
    it('persists scalars and reconciles commissions', async () => {
      const result = await service.create(
        {
          code: 'NHOM02',
          name: 'Dép',
          parentGroupId: 'cat-1',
          description: 'desc',
          commissions: [
            { positionName: 'Sales', method: 'PERCENT', rate: 5, discountLimitPercent: 10 },
            { positionName: 'Manager', method: 'AMOUNT', rate: 20000, discountLimitPercent: 0 },
          ],
        } as any,
        actor,
      );

      expect(result).toBeDefined();
      // parent validated against org
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'cat-1', organizationId: 'org-1' },
      });
      // category row created without the nested commissions key
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Dép', code: 'NHOM02', description: 'desc' }),
      );
      expect(repo.create.mock.calls[0][0].commissions).toBeUndefined();
      // commissions reconciled: delete existing then save the 2 rows
      expect(mockManager.delete).toHaveBeenCalledWith(
        ItemCategoryCommissionEntity,
        { categoryId: 'cat-new', organizationId: 'org-1' },
      );
      const savedRows = mockManager.save.mock.calls[0][1];
      expect(savedRows).toHaveLength(2);
      expect(savedRows[0]).toMatchObject({ positionName: 'Sales', method: CommissionMethod.PERCENT, rate: 5 });
      expect(savedRows[1]).toMatchObject({ method: CommissionMethod.AMOUNT, rate: 20000 });
    });

    it('rejects a parent category from another organization', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.create({ name: 'X', parentGroupId: 'other-org-cat' } as any, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not touch commissions when the key is absent', async () => {
      await service.create({ name: 'NoComm' } as any, actor);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('rejects a category pointing to itself as parent', async () => {
      await expect(
        service.update('cat-1', { parentGroupId: 'cat-1' } as any, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('reconciles commissions on update', async () => {
      await service.update(
        'cat-1',
        { name: 'Giày', commissions: [{ positionName: 'CSKH', rate: 3 }] } as any,
        actor,
      );
      expect(mockManager.delete).toHaveBeenCalledWith(
        ItemCategoryCommissionEntity,
        { categoryId: 'cat-1', organizationId: 'org-1' },
      );
      const savedRows = mockManager.save.mock.calls[0][1];
      expect(savedRows).toHaveLength(1);
      expect(savedRows[0]).toMatchObject({ positionName: 'CSKH', method: CommissionMethod.PERCENT, rate: 3 });
    });
  });

  describe('getById', () => {
    it('attaches the commission rows', async () => {
      commissionRepo.find.mockResolvedValue([{ id: 'cm-1', positionName: 'Sales' }]);
      const result = await service.getById('cat-1', actor);
      expect(result.commissions).toHaveLength(1);
      expect(commissionRepo.find).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1', organizationId: 'org-1' },
      });
    });
  });
});
