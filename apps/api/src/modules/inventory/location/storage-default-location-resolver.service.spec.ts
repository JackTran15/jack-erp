import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { LocationEntity } from './location.entity';
import { StorageDefaultLocationResolverService } from './storage-default-location-resolver.service';

describe('StorageDefaultLocationResolverService', () => {
  let service: StorageDefaultLocationResolverService;
  const locationRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        StorageDefaultLocationResolverService,
        { provide: getRepositoryToken(LocationEntity), useValue: locationRepo },
      ],
    }).compile();
    service = module.get(StorageDefaultLocationResolverService);
  });

  it('prefers fallback shelf over unassigned bin', async () => {
    locationRepo.findOne.mockResolvedValueOnce({ id: 'shelf-a' });

    const id = await service.resolveStorageTransferLocation('storage-1', 'org-1', {
      fallbackLocationId: 'shelf-a',
    });

    expect(id).toBe('shelf-a');
    expect(locationRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isUnassigned: false }),
      }),
    );
  });

  it('prefers isDefault shelf when fallback is missing', async () => {
    locationRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'default-shelf' });

    const id = await service.resolveStorageTransferLocation('storage-1', 'org-1');

    expect(id).toBe('default-shelf');
    expect(locationRepo.findOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ isDefault: true, isUnassigned: false }),
      }),
    );
  });

  it('throws when storage has no concrete shelf', async () => {
    locationRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(
      service.resolveStorageTransferLocation('storage-1', 'org-1'),
    ).rejects.toThrow(BadRequestException);
  });
});
