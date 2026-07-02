import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ItemStorageLocationService } from './item-storage-location.service';
import { ItemStorageLocationEntity } from './item-storage-location.entity';
import { LocationEntity } from '../location/location.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

describe('ItemStorageLocationService', () => {
  let service: ItemStorageLocationService;
  let islRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let locationRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    islRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve({ id: 'isl-1', ...entity })),
    };
    locationRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemStorageLocationService,
        { provide: getRepositoryToken(ItemStorageLocationEntity), useValue: islRepo },
        { provide: getRepositoryToken(LocationEntity), useValue: locationRepo },
      ],
    }).compile();

    service = module.get(ItemStorageLocationService);
  });

  describe('validateAndAssign', () => {
    it('creates a mapping keyed by item when none exists', async () => {
      locationRepo.findOne.mockResolvedValue({ id: 'loc-1', storageId: 'storage-1' });
      islRepo.findOne.mockResolvedValue(null);

      await service.validateAndAssign('item-1', 'storage-1', 'loc-1', actor);

      expect(islRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: 'item-1', storageId: 'storage-1', locationId: 'loc-1' }),
      );
      expect(islRepo.save).toHaveBeenCalled();
    });

    it('keeps the existing mapping (idempotent first-write)', async () => {
      islRepo.findOne.mockResolvedValue({ id: 'isl-1', locationId: 'loc-existing' });
      locationRepo.findOne.mockResolvedValueOnce({
        id: 'loc-new',
        storageId: 'storage-1',
      });
      locationRepo.findOne.mockResolvedValueOnce({
        id: 'loc-existing',
        storageId: 'storage-1',
      });

      await service.validateAndAssign('item-1', 'storage-1', 'loc-new', actor);

      expect(islRepo.save).not.toHaveBeenCalled();
    });

    it('repairs an existing mapping when it points outside the storage', async () => {
      const existing = { id: 'isl-1', locationId: 'loc-showroom' };
      islRepo.findOne.mockResolvedValue(existing);
      locationRepo.findOne.mockResolvedValueOnce({
        id: 'loc-warehouse',
        storageId: 'storage-1',
      });
      locationRepo.findOne.mockResolvedValueOnce(null);

      await service.validateAndAssign('item-1', 'storage-1', 'loc-warehouse', actor);

      expect(islRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'isl-1', locationId: 'loc-warehouse' }),
      );
    });
  });

  describe('validateAndAssignByLocation', () => {
    it('skips the unassigned ("Chưa xếp") location', async () => {
      locationRepo.findOne.mockResolvedValue({ id: 'loc-u', storageId: 'storage-1', isUnassigned: true });

      await service.validateAndAssignByLocation('item-1', 'loc-u', actor);

      expect(islRepo.findOne).not.toHaveBeenCalled();
      expect(islRepo.save).not.toHaveBeenCalled();
    });

    it('assigns for a real shelf', async () => {
      locationRepo.findOne.mockResolvedValue({ id: 'loc-1', storageId: 'storage-1', isUnassigned: false });
      islRepo.findOne.mockResolvedValue(null);

      await service.validateAndAssignByLocation('item-1', 'loc-1', actor);

      expect(islRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: 'item-1', storageId: 'storage-1', locationId: 'loc-1' }),
      );
    });

    it('no-ops when the location is not found', async () => {
      locationRepo.findOne.mockResolvedValue(null);

      await service.validateAndAssignByLocation('item-1', 'loc-missing', actor);

      expect(islRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('setLocation', () => {
    it('overwrites the location of an existing mapping', async () => {
      locationRepo.findOne.mockResolvedValue({ id: 'loc-new', storageId: 'storage-1' });
      islRepo.findOne.mockResolvedValue({ id: 'isl-1', locationId: 'loc-old' });

      const result = await service.setLocation('item-1', 'storage-1', 'loc-new', actor);

      expect(result.locationId).toBe('loc-new');
    });

    it('creates a mapping when none exists', async () => {
      locationRepo.findOne.mockResolvedValue({ id: 'loc-1', storageId: 'storage-1' });
      islRepo.findOne.mockResolvedValue(null);

      await service.setLocation('item-1', 'storage-1', 'loc-1', actor);

      expect(islRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: 'item-1', storageId: 'storage-1', locationId: 'loc-1' }),
      );
      expect(islRepo.save).toHaveBeenCalled();
    });

    it('rejects a location outside the selected storage', async () => {
      locationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.setLocation('item-1', 'storage-1', 'loc-showroom', actor),
      ).rejects.toThrow(/Vị trí không thuộc kho/);

      expect(islRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('setLocationByItem', () => {
    it('resolves the storage from the location then upserts', async () => {
      locationRepo.findOne.mockResolvedValue({ id: 'loc-1', storageId: 'storage-1' });
      islRepo.findOne.mockResolvedValue(null);

      await service.setLocationByItem('item-1', 'loc-1', actor);

      expect(islRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: 'item-1', storageId: 'storage-1', locationId: 'loc-1' }),
      );
    });

    it('no-ops when the location is not found', async () => {
      locationRepo.findOne.mockResolvedValue(null);

      await service.setLocationByItem('item-1', 'loc-missing', actor);

      expect(islRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('resolveAssignedLocation', () => {
    it('returns the assigned location for (item, storage)', async () => {
      islRepo.findOne.mockResolvedValue({ locationId: 'loc-1' });
      locationRepo.findOne.mockResolvedValue({ id: 'loc-1', code: 'A-01' });

      const result = await service.resolveAssignedLocation('item-1', 'storage-1', 'org-1');

      expect(result).toEqual({ locationId: 'loc-1', code: 'A-01' });
      expect(locationRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'loc-1',
            storageId: 'storage-1',
            organizationId: 'org-1',
          }),
        }),
      );
    });

    it('returns null when the item has no mapping', async () => {
      islRepo.findOne.mockResolvedValue(null);

      const result = await service.resolveAssignedLocation('item-1', 'storage-1', 'org-1');

      expect(result).toBeNull();
    });

    it('returns null when the mapped location is not in the requested storage', async () => {
      islRepo.findOne.mockResolvedValue({ locationId: 'loc-showroom' });
      locationRepo.findOne.mockResolvedValue(null);

      const result = await service.resolveAssignedLocation('item-1', 'storage-1', 'org-1');

      expect(result).toBeNull();
    });
  });

  describe('listByItem', () => {
    it('lists mappings for an item', async () => {
      const rows = [{ itemId: 'item-1', storageId: 'storage-1', locationId: 'loc-1' }];
      islRepo.find.mockResolvedValue(rows);

      const result = await service.listByItem('item-1', actor);

      expect(result).toBe(rows);
      expect(islRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { itemId: 'item-1', organizationId: 'org-1' } }),
      );
    });
  });
});
