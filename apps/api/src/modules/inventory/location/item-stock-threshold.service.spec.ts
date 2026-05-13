import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ItemStockThresholdService } from './item-stock-threshold.service';
import { ItemStockThresholdEntity } from './item-stock-threshold.entity';
import { LocationEntity } from './location.entity';
import { InventoryLocationService } from './inventory-location.service';

describe('ItemStockThresholdService', () => {
  let service: ItemStockThresholdService;
  let repo: Record<string, jest.Mock>;
  let locationRepo: Record<string, jest.Mock>;
  let locationService: Record<string, jest.Mock>;
  let dataSource: { transaction: jest.Mock };
  let txManager: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const item = { id: 'item-1', organizationId: 'org-1', branchId: 'branch-1' };
  const location = {
    id: 'loc-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    code: 'L1',
    name: 'Kho 1',
    isActive: true,
  };

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    locationRepo = {
      find: jest.fn().mockResolvedValue([location]),
      findOne: jest.fn().mockResolvedValue(location),
    };

    locationService = {
      getItemById: jest.fn().mockResolvedValue(item),
    };

    txManager = {
      find: jest.fn().mockResolvedValue([location]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((_entity, data) => ({ ...data })),
      save: jest.fn().mockImplementation((_entity, data) => Promise.resolve(data)),
    };

    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation(async (cb: (m: typeof txManager) => unknown) => cb(txManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemStockThresholdService,
        { provide: getRepositoryToken(ItemStockThresholdEntity), useValue: repo },
        { provide: getRepositoryToken(LocationEntity), useValue: locationRepo },
        { provide: InventoryLocationService, useValue: locationService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(ItemStockThresholdService);
  });

  describe('upsert', () => {
    it('clears existing threshold to null when client sends { minQty: null, maxQty: null }', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 't-1',
        itemId: 'item-1',
        locationId: 'loc-1',
        minQty: 10,
        maxQty: 100,
        organizationId: 'org-1',
      });

      await service.upsert('item-1', 'loc-1', { minQty: null, maxQty: null }, actor);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ minQty: null, maxQty: null }),
      );
    });

    it('persists null when only minQty is sent as null (PATCH replaces both fields)', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 't-1',
        itemId: 'item-1',
        locationId: 'loc-1',
        minQty: 10,
        maxQty: 100,
        organizationId: 'org-1',
      });

      await service.upsert('item-1', 'loc-1', { minQty: null }, actor);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ minQty: null, maxQty: null }),
      );
    });

    it('saves numeric values when sent', async () => {
      repo.findOne.mockResolvedValueOnce(null);

      await service.upsert('item-1', 'loc-1', { minQty: 5, maxQty: 50 }, actor);

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ minQty: 5, maxQty: 50 }),
      );
    });

    it('throws BadRequestException when minQty > maxQty', async () => {
      await expect(
        service.upsert('item-1', 'loc-1', { minQty: 100, maxQty: 10 }, actor),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('setDefault', () => {
    it('clears existing thresholds across locations when sent null', async () => {
      txManager.findOne.mockResolvedValueOnce({
        id: 't-1',
        itemId: 'item-1',
        locationId: 'loc-1',
        minQty: 10,
        maxQty: 100,
      });

      await service.setDefault('item-1', { minQty: null, maxQty: null }, actor);

      expect(txManager.save).toHaveBeenCalledWith(
        ItemStockThresholdEntity,
        expect.objectContaining({ minQty: null, maxQty: null }),
      );
    });

    it('creates new rows with null when no existing threshold and sent null', async () => {
      txManager.findOne.mockResolvedValueOnce(null);

      const result = await service.setDefault(
        'item-1',
        { minQty: null, maxQty: null },
        actor,
      );

      expect(txManager.save).toHaveBeenCalledWith(
        ItemStockThresholdEntity,
        expect.objectContaining({
          itemId: 'item-1',
          locationId: 'loc-1',
          minQty: null,
          maxQty: null,
        }),
      );
      expect(result.applied).toBe(1);
    });

    it('throws BadRequestException when minQty > maxQty', async () => {
      await expect(
        service.setDefault('item-1', { minQty: 100, maxQty: 10 }, actor),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
