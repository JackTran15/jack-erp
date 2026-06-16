import { ConflictException } from '@nestjs/common';
import { InventoryLocationService } from './inventory-location.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  roles: ['admin'],
};

describe('InventoryLocationService.createShowroom', () => {
  let service: InventoryLocationService;
  let storageRepo: { findOne: jest.Mock };
  let showroomRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let branchService: { findById: jest.Mock };

  beforeEach(() => {
    storageRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'storage-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
      }),
    };
    showroomRepo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve({ id: 'showroom-1', ...entity })),
    };
    branchService = {
      findById: jest.fn().mockResolvedValue({ id: 'branch-1', isMainBranch: false }),
    };

    service = new InventoryLocationService(
      {} as never, // itemRepo
      {} as never, // itemCategoryRepo
      {} as never, // brandRepo
      {} as never, // unitRepo
      {} as never, // providerRepo
      storageRepo as never,
      showroomRepo as never,
      {} as never, // locationRepo
      {} as never, // assignmentRepo
      branchService as never,
    );
  });

  const dto = {
    name: 'Showroom',
    branchId: 'branch-1',
    storageId: 'storage-1',
  };

  it('creates a main showroom for a non-main branch', async () => {
    showroomRepo.findOne.mockResolvedValue(null);

    const result = await service.createShowroom(dto, actor);

    expect(showroomRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Showroom',
        branchId: 'branch-1',
        storageId: 'storage-1',
        isMainShowroom: true,
        organizationId: 'org-1',
      }),
    );
    expect(result.isMainShowroom).toBe(true);
  });

  it('rejects a second showroom in the same branch', async () => {
    showroomRepo.findOne.mockResolvedValue({ id: 'existing', branchId: 'branch-1' });

    await expect(service.createShowroom(dto, actor)).rejects.toThrow(
      ConflictException,
    );
    expect(showroomRepo.save).not.toHaveBeenCalled();
  });
});
