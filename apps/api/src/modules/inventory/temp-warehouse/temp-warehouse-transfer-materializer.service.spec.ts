import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  TempWarehouseDirection,
  TempWarehouseTransferKind,
  TempWarehouseTransferRequestedPayload,
} from '@erp/shared-interfaces';
import { LocationEntity } from '../location/location.entity';
import { InventoryLocationStockService } from '../location/inventory-location-stock.service';
import { StorageDefaultLocationResolverService } from '../location/storage-default-location-resolver.service';
import { BranchLocationResolverService } from './branch-location-resolver.service';
import { TempWarehouseTransferMaterializerService } from './temp-warehouse-transfer-materializer.service';

describe('TempWarehouseTransferMaterializerService', () => {
  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
  };

  const branchLocs = {
    warehouseStorageId: 'wh-storage',
    warehouseLocationId: 'wh-loc-default',
    showroomStorageId: 'sr-storage',
    showroomLocationId: 'sr-loc-default',
  };

  const payload: TempWarehouseTransferRequestedPayload = {
    sessionId: 'session-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    direction: TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
    sourceLocationId: 'ignored-header',
    destinationLocationId: 'ignored-header',
    sourceBranchId: 'branch-1',
    destinationBranchId: 'branch-1',
    lines: [
      {
        tempWarehouseLineId: 'line-1',
        itemId: 'item-1',
        quantity: 1,
        sourceLocationId: '11111111-1111-4111-8111-111111111111',
      },
    ],
    actor: {
      userId: actor.userId,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      roles: [],
    },
    requestedAt: new Date().toISOString(),
    kind: TempWarehouseTransferKind.PARTIAL,
    notes: 'Partial from temp warehouse session session-1',
  };

  let service: TempWarehouseTransferMaterializerService;
  const locationRepo = { findOne: jest.fn() };
  const branchResolver = { resolve: jest.fn().mockResolvedValue(branchLocs) };
  const storageDefaultLocationResolver = {
    resolveStorageTransferLocation: jest.fn(),
  };
  const inventoryLocationStockService = {
    getPreferredShelf: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TempWarehouseTransferMaterializerService,
        { provide: BranchLocationResolverService, useValue: branchResolver },
        {
          provide: StorageDefaultLocationResolverService,
          useValue: storageDefaultLocationResolver,
        },
        {
          provide: InventoryLocationStockService,
          useValue: inventoryLocationStockService,
        },
        { provide: getRepositoryToken(LocationEntity), useValue: locationRepo },
      ],
    }).compile();
    service = module.get(TempWarehouseTransferMaterializerService);
  });

  it('maps W2S lines with per-line shelf, storages, and showroom preferred destination', async () => {
    locationRepo.findOne
      .mockResolvedValueOnce({ id: '11111111-1111-4111-8111-111111111111', isUnassigned: false })
      .mockResolvedValueOnce({ id: 'sr-loc-default', isUnassigned: false });
    inventoryLocationStockService.getPreferredShelf.mockResolvedValue({
      id: 'sr-loc-default',
      code: 'SR-01',
      name: 'Sàn showroom',
    });

    const dto = await service.buildBranchScopedTransfer(payload, actor);

    expect(dto.lines).toEqual([
      {
        itemId: 'item-1',
        quantity: 1,
        sourceStorageId: 'wh-storage',
        destinationStorageId: 'sr-storage',
        sourceLocationId: '11111111-1111-4111-8111-111111111111',
        destinationLocationId: 'sr-loc-default',
      },
    ]);
  });

  it('uses item preferred shelf when temp line has invalid shelf id', async () => {
    const invalidShelfPayload = {
      ...payload,
      lines: [
        {
          tempWarehouseLineId: 'line-1',
          itemId: 'item-1',
          quantity: 1,
          sourceLocationId: 'shelf-mặc-định',
        },
      ],
    };
    inventoryLocationStockService.getPreferredShelf
      .mockResolvedValueOnce({
        id: 'wh-default-shelf',
        code: 'DEFAULT',
        name: 'Mặc định',
      })
      .mockResolvedValueOnce({
        id: 'sr-loc-default',
        code: 'SR-01',
        name: 'Sàn showroom',
      });
    locationRepo.findOne
      .mockResolvedValueOnce({ id: 'wh-default-shelf', isUnassigned: false })
      .mockResolvedValueOnce({ id: 'sr-loc-default', isUnassigned: false });

    const dto = await service.buildBranchScopedTransfer(invalidShelfPayload, actor);

    expect(dto.lines[0].sourceLocationId).toBe('wh-default-shelf');
    expect(inventoryLocationStockService.getPreferredShelf).toHaveBeenCalledWith(
      'item-1',
      'wh-storage',
      actor,
    );
  });

  it('falls back to warehouse default when temp line has no shelf id', async () => {
    const noShelfPayload = {
      ...payload,
      lines: [{ tempWarehouseLineId: 'line-2', itemId: 'item-2', quantity: 1 }],
    };
    inventoryLocationStockService.getPreferredShelf
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'sr-loc-default',
        code: 'SR-01',
        name: 'Sàn showroom',
      });
    storageDefaultLocationResolver.resolveStorageTransferLocation
      .mockResolvedValueOnce('wh-loc-default')
      .mockResolvedValueOnce('sr-loc-default');
    locationRepo.findOne
      .mockResolvedValueOnce({ id: 'wh-loc-default', isUnassigned: false })
      .mockResolvedValueOnce({ id: 'sr-loc-default', isUnassigned: false });

    const dto = await service.buildBranchScopedTransfer(noShelfPayload, actor);

    expect(dto.lines[0].sourceLocationId).toBe('wh-loc-default');
    expect(dto.lines[0].destinationLocationId).toBe('sr-loc-default');
  });

  it('rejects explicit unassigned shelf on source line', async () => {
    locationRepo.findOne.mockResolvedValueOnce({ id: 'unassigned', isUnassigned: true });

    await expect(service.buildBranchScopedTransfer(payload, actor)).rejects.toThrow(
      /Chưa xếp/,
    );
  });
});
