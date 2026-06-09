import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ProductStorageLocationService } from './product-storage-location.service';
import { ProductStorageLocationEntity } from './product-storage-location.entity';
import { ItemEntity } from '../location/item.entity';
import { LocationEntity } from '../location/location.entity';

describe('ProductStorageLocationService', () => {
  let service: ProductStorageLocationService;
  let pslRepo: Record<string, jest.Mock>;
  let itemRepo: Record<string, jest.Mock>;
  let locationRepo: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  beforeEach(async () => {
    pslRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((data) => ({ id: 'psl-new', ...data })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    itemRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'item-1',
        productId: 'prod-1',
        organizationId: 'org-1',
      }),
    };

    locationRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'loc-1',
        storageId: 'storage-1',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductStorageLocationService,
        {
          provide: getRepositoryToken(ProductStorageLocationEntity),
          useValue: pslRepo,
        },
        { provide: getRepositoryToken(ItemEntity), useValue: itemRepo },
        { provide: getRepositoryToken(LocationEntity), useValue: locationRepo },
      ],
    }).compile();

    service = module.get(ProductStorageLocationService);
  });

  describe('validateAndAssign', () => {
    it('should skip items without productId (legacy items)', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 'item-1', productId: null });

      await service.validateAndAssign('item-1', 'storage-1', 'loc-1', actor);

      expect(pslRepo.findOne).not.toHaveBeenCalled();
      expect(pslRepo.save).not.toHaveBeenCalled();
    });

    it('should auto-insert mapping on first assignment', async () => {
      pslRepo.findOne.mockResolvedValue(null);

      await service.validateAndAssign('item-1', 'storage-1', 'loc-1', actor);

      expect(pslRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          storageId: 'storage-1',
          locationId: 'loc-1',
        }),
      );
      expect(pslRepo.save).toHaveBeenCalled();
    });

    it('should pass when mapping exists and location matches', async () => {
      pslRepo.findOne.mockResolvedValue({
        productId: 'prod-1',
        storageId: 'storage-1',
        locationId: 'loc-1',
      });

      await expect(
        service.validateAndAssign('item-1', 'storage-1', 'loc-1', actor),
      ).resolves.not.toThrow();

      expect(pslRepo.save).not.toHaveBeenCalled();
    });

    it('should throw when mapping exists but location differs (same storage)', async () => {
      pslRepo.findOne.mockResolvedValue({
        productId: 'prod-1',
        storageId: 'storage-1',
        locationId: 'loc-other',
      });

      await expect(
        service.validateAndAssign('item-1', 'storage-1', 'loc-1', actor),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateAndAssignByLocation', () => {
    it('should resolve storageId from location and delegate', async () => {
      pslRepo.findOne.mockResolvedValue(null);

      await service.validateAndAssignByLocation('item-1', 'loc-1', actor);

      expect(locationRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: 'loc-1',
          organizationId: 'org-1',
          branchId: 'branch-1',
        },
      });
      expect(pslRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ storageId: 'storage-1' }),
      );
    });

    it('should silently skip if location not found', async () => {
      locationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.validateAndAssignByLocation('item-1', 'loc-missing', actor),
      ).resolves.not.toThrow();

      expect(pslRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('listByProduct', () => {
    it('should return mappings for a product', async () => {
      const mockMappings = [
        { productId: 'prod-1', storageId: 's1', locationId: 'l1' },
        { productId: 'prod-1', storageId: 's2', locationId: 'l2' },
      ];
      pslRepo.find.mockResolvedValue(mockMappings);

      const result = await service.listByProduct('prod-1', actor);

      expect(result).toHaveLength(2);
      expect(pslRepo.find).toHaveBeenCalledWith({
        where: {
          productId: 'prod-1',
          organizationId: 'org-1',
          branchId: 'branch-1',
        },
      });
    });
  });

  describe('setLocation', () => {
    it('should create new mapping if none exists', async () => {
      pslRepo.findOne.mockResolvedValue(null);

      await service.setLocation('prod-1', 'storage-1', 'loc-1', actor);

      expect(pslRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          storageId: 'storage-1',
          locationId: 'loc-1',
        }),
      );
      expect(pslRepo.save).toHaveBeenCalled();
    });

    it('should update existing mapping to new location', async () => {
      const existing = {
        productId: 'prod-1',
        storageId: 'storage-1',
        locationId: 'loc-old',
      };
      pslRepo.findOne.mockResolvedValue(existing);

      await service.setLocation('prod-1', 'storage-1', 'loc-new', actor);

      expect(existing.locationId).toBe('loc-new');
      expect(pslRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ locationId: 'loc-new' }),
      );
    });
  });

  describe('resolveAssignedLocation', () => {
    it('returns the arranged bin (id + code) for an item in a storage', async () => {
      itemRepo.findOne.mockResolvedValue({
        id: 'item-1',
        productId: 'prod-1',
        organizationId: 'org-1',
      });
      pslRepo.findOne.mockResolvedValue({
        productId: 'prod-1',
        storageId: 'storage-1',
        locationId: 'loc-A01',
      });
      locationRepo.findOne.mockResolvedValue({ id: 'loc-A01', code: 'A-01' });

      const res = await service.resolveAssignedLocation('item-1', 'storage-1', 'org-1');
      expect(res).toEqual({ locationId: 'loc-A01', code: 'A-01' });
    });

    it('returns null when the item has no product', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 'item-1', productId: null });
      const res = await service.resolveAssignedLocation('item-1', 'storage-1', 'org-1');
      expect(res).toBeNull();
      expect(pslRepo.findOne).not.toHaveBeenCalled();
    });

    it('returns null when the product is not arranged in the storage', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 'item-1', productId: 'prod-1' });
      pslRepo.findOne.mockResolvedValue(null);
      const res = await service.resolveAssignedLocation('item-1', 'storage-1', 'org-1');
      expect(res).toBeNull();
    });
  });
});
