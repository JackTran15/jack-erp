import { ConflictException } from '@nestjs/common';
import { InventoryLocationService } from './inventory-location.service';
import { InventoryLocationController } from './inventory-location.controller';
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
      {} as never, // docNumbering
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

describe('InventoryLocationService.listShowrooms', () => {
  let service: InventoryLocationService;
  let showroomRepo: { findAndCount: jest.Mock };

  // Showroom S is backed by a storage that has since been deactivated; it
  // carries no nested `storage` key because the query never selects the
  // join it filters on.
  const inactiveBackedShowroom = {
    id: 'showroom-inactive',
    name: 'S',
    branchId: 'branch-1',
    storageId: 'storage-inactive',
    organizationId: 'org-1',
  };
  const activeBackedShowroom = {
    id: 'showroom-active',
    name: 'T',
    branchId: 'branch-1',
    storageId: 'storage-active',
    organizationId: 'org-1',
  };

  beforeEach(() => {
    showroomRepo = { findAndCount: jest.fn() };

    service = new InventoryLocationService(
      {} as never, // itemRepo
      {} as never, // itemCategoryRepo
      {} as never, // brandRepo
      {} as never, // unitRepo
      {} as never, // providerRepo
      {} as never, // storageRepo
      showroomRepo as never,
      {} as never, // locationRepo
      {} as never, // assignmentRepo
      {} as never, // branchService
      {} as never, // docNumbering
    );
  });

  const baseQuery = { page: 1, pageSize: 20 };

  it('without activeOnly, keeps the pre-existing call shape and still returns inactive-backed showrooms (AC-11)', async () => {
    showroomRepo.findAndCount.mockResolvedValue([
      [inactiveBackedShowroom, activeBackedShowroom],
      2,
    ]);

    const result = await service.listShowrooms(baseQuery, actor);

    expect(showroomRepo.findAndCount).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      skip: 0,
      take: 20,
      order: { createdAt: 'DESC' },
    });
    expect(result.data).toEqual([inactiveBackedShowroom, activeBackedShowroom]);
    expect(result.total).toBe(2);
  });

  it('activeOnly=true filters by the backing storage and total reflects the filtered set', async () => {
    showroomRepo.findAndCount.mockResolvedValue([[activeBackedShowroom], 1]);

    const result = await service.listShowrooms(
      { ...baseQuery, activeOnly: true },
      actor,
    );

    expect(showroomRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          storage: { isActive: true },
        },
      }),
    );
    expect(result.data).toEqual([activeBackedShowroom]);
    expect(result.total).toBe(1);
  });

  it('combines branchId and storageId filters with activeOnly', async () => {
    showroomRepo.findAndCount.mockResolvedValue([[activeBackedShowroom], 1]);

    await service.listShowrooms(
      {
        ...baseQuery,
        branchId: 'branch-1',
        storageId: 'storage-active',
        activeOnly: true,
      },
      actor,
    );

    expect(showroomRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          branchId: 'branch-1',
          storageId: 'storage-active',
          storage: { isActive: true },
        },
      }),
    );
  });

  it('does not add a nested storage key to the returned items', async () => {
    showroomRepo.findAndCount.mockResolvedValue([[activeBackedShowroom], 1]);

    const result = await service.listShowrooms(
      { ...baseQuery, activeOnly: true },
      actor,
    );

    for (const item of result.data) {
      expect(item).not.toHaveProperty('storage');
    }
    // The find options passed to the repo must not request the relation be
    // loaded — that is what would put `storage` on the response payload.
    const callArgs = showroomRepo.findAndCount.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('relations');
  });
});

describe('InventoryLocationController.listShowrooms — activeOnly coercion', () => {
  let controller: InventoryLocationController;
  let service: { listShowrooms: jest.Mock };

  beforeEach(() => {
    service = { listShowrooms: jest.fn().mockResolvedValue({ data: [], total: 0 }) };
    controller = new InventoryLocationController(
      service as never,
      {} as never, // itemCrudService
      {} as never, // itemProviderService
      {} as never, // itemBarcodeService
      {} as never, // itemThresholdService
    );
  });

  it.each([
    ['true', true],
    [true, true],
    ['1', true],
    [undefined, false],
    ['false', false],
  ])('coerces activeOnly=%p to %p, same as listStorages', async (raw, expected) => {
    const query = { page: 1, pageSize: 20, activeOnly: raw } as never;

    await controller.listShowrooms(query, actor);

    expect(service.listShowrooms).toHaveBeenCalledWith(
      expect.objectContaining({ activeOnly: expected }),
      actor,
    );
  });
});
