import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TransferStatus, StockMovementType, DocumentType } from '@erp/shared-interfaces';
import { StockTransferService, CreateTransferDto } from './stock-transfer.service';
import { StockTransferEntity } from './stock-transfer.entity';
import { LocationEntity } from '../location/location.entity';
import { StorageEntity } from '../location/storage.entity';
import { UserEntity } from '../../auth/user.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { ItemCostSnapshotService } from '../location/item-cost-snapshot.service';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { StorageDefaultLocationResolverService } from '../location/storage-default-location-resolver.service';

describe('StockTransferService', () => {
  let service: StockTransferService;
  let transferRepo: Record<string, jest.Mock>;
  let locationRepo: Record<string, jest.Mock>;
  let storageRepo: Record<string, jest.Mock>;
  let userRepo: Record<string, jest.Mock>;
  let balanceRepo: Record<string, jest.Mock>;
  let itemCostSnapshotService: Record<string, jest.Mock>;
  let ledgerService: Record<string, jest.Mock>;
  let docNumbering: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;
  let balanceQb: Record<string, jest.Mock>;
  let storageDefaultLocationResolver: { resolveStorageTransferLocation: jest.Mock };

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const validDto: CreateTransferDto = {
    sourceLocationId: 'loc-src',
    destinationLocationId: 'loc-dst',
    sourceBranchId: 'branch-src',
    destinationBranchId: 'branch-dst',
    lines: [{ itemId: 'item-1', quantity: 5 }],
  };

  beforeEach(async () => {
    transferRepo = {
      create: jest.fn().mockImplementation((data) => ({ id: 'xfer-1', ...data })),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    locationRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    storageRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    userRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    balanceRepo = {
      findOne: jest.fn(),
    };

    itemCostSnapshotService = {
      snapshotCosts: jest
        .fn()
        .mockResolvedValue(new Map<string, number>([['item-1', 8]])),
    };

    ledgerService = {
      recordBatchMovements: jest.fn().mockResolvedValue([]),
      publishMovementEvents: jest.fn().mockResolvedValue(undefined),
    };

    docNumbering = {
      generate: jest.fn().mockResolvedValue('TFR-2026-0001'),
    };

    // Sufficient on-hand by default; individual tests override getOne().
    balanceQb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ quantity: 100 }),
    };

    const mockManager = {
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(balanceQb),
      create: jest.fn().mockImplementation((_entity, data) => ({
        id: 'xfer-1',
        ...data,
      })),
      save: jest.fn().mockImplementation((_entity, data) =>
        Promise.resolve({ id: 'xfer-1', ...data }),
      ),
      // postIntraWarehouseMoves() re-marks destination balances as tracked
      // via a raw UPDATE; empty result is fine for these tests.
      query: jest.fn().mockResolvedValue([]),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };
    storageDefaultLocationResolver = {
      resolveStorageTransferLocation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockTransferService,
        { provide: getRepositoryToken(StockTransferEntity), useValue: transferRepo },
        { provide: getRepositoryToken(LocationEntity), useValue: locationRepo },
        { provide: getRepositoryToken(StorageEntity), useValue: storageRepo },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
        { provide: getRepositoryToken(StockBalanceEntity), useValue: balanceRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: StockLedgerService, useValue: ledgerService },
        { provide: DocumentNumberingService, useValue: docNumbering },
        { provide: ItemCostSnapshotService, useValue: itemCostSnapshotService },
        {
          provide: StorageDefaultLocationResolverService,
          useValue: storageDefaultLocationResolver,
        },
      ],
    }).compile();

    service = module.get(StockTransferService);
  });

  describe('create', () => {
    it('should reject when source == destination location', async () => {
      const dto: CreateTransferDto = {
        ...validDto,
        sourceLocationId: 'loc-same',
        destinationLocationId: 'loc-same',
      };

      await expect(service.create(dto, actor)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto, actor)).rejects.toThrow(
        'Source and destination locations must be different',
      );
    });

    it('should create a DRAFT transfer with a document number assigned up-front', async () => {
      // create() reloads via findOrFail after save.
      transferRepo.findOne.mockResolvedValue({
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.DRAFT,
        documentNumber: 'TFR-2026-0001',
      });

      const result = await service.create(validDto, actor);

      expect(result.status).toBe(TransferStatus.DRAFT);
      expect(result.documentNumber).toBe('TFR-2026-0001');
      expect(docNumbering.generate).toHaveBeenCalledWith(
        DocumentType.TRANSFER,
        'branch-src',
        actor,
      );
      expect(transferRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLocationId: 'loc-src',
          destinationLocationId: 'loc-dst',
          status: TransferStatus.DRAFT,
          documentNumber: 'TFR-2026-0001',
        }),
      );
      expect(transferRepo.save).toHaveBeenCalled();
    });
  });

  describe('post', () => {
    it('should post a DRAFT directly and create paired TRANSFER_OUT/TRANSFER_IN ledger entries', async () => {
      const transfer = {
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.DRAFT,
        documentNumber: 'TFR-2026-0001',
        sourceLocationId: 'loc-src',
        destinationLocationId: 'loc-dst',
        sourceBranchId: 'branch-src',
        destinationBranchId: 'branch-dst',
        lines: [{ itemId: 'item-1', quantity: 5 }],
      };
      // post() loads the DRAFT, then reloads the POSTED row at the end.
      transferRepo.findOne
        .mockResolvedValueOnce(transfer)
        .mockResolvedValueOnce({ ...transfer, status: TransferStatus.POSTED });

      const result = await service.post('xfer-1', actor);

      expect(result.status).toBe(TransferStatus.POSTED);
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            movementType: StockMovementType.TRANSFER_OUT,
            quantity: -5,
            locationId: 'loc-src',
            // Snapshot of items.purchase_price (8.00). Both legs share the
            // same unit_cost so signed line_value sums to zero across the move.
            unitCost: 8,
          }),
          expect.objectContaining({
            movementType: StockMovementType.TRANSFER_IN,
            quantity: 5,
            locationId: 'loc-dst',
            unitCost: 8,
          }),
        ]),
      );
      // Number is assigned at create(), never re-generated at post().
      expect(docNumbering.generate).not.toHaveBeenCalled();
    });

    it('should fail posting an already POSTED transfer', async () => {
      const transfer = {
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.POSTED,
        lines: [],
      };
      transferRepo.findOne.mockResolvedValue(transfer);

      await expect(service.post('xfer-1', actor)).rejects.toThrow(BadRequestException);
      await expect(service.post('xfer-1', actor)).rejects.toThrow(
        /Cannot transition from POSTED/,
      );
    });
  });

  describe('cancel', () => {
    it('should cancel a transfer in DRAFT status', async () => {
      const transfer = {
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.DRAFT,
      };
      transferRepo.findOne.mockResolvedValue(transfer);

      const result = await service.cancel('xfer-1', actor);

      expect(result.status).toBe(TransferStatus.CANCELLED);
      expect(transferRepo.save).toHaveBeenCalled();
    });

    it('reverses both ledger legs and sets CANCELLED for a POSTED transfer', async () => {
      const posted = {
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.POSTED,
        documentNumber: 'CK000001',
        sourceBranchId: 'branch-1',
        destinationBranchId: 'branch-1',
        sourceLocationId: 'loc-src',
        destinationLocationId: 'loc-dst',
        lines: [
          {
            itemId: 'item-1',
            quantity: 5,
            sourceLocationId: 'loc-src',
            destinationLocationId: 'loc-dst',
            unitPrice: '8.00',
          },
        ],
      };
      transferRepo.findOne
        .mockResolvedValueOnce(posted)
        .mockResolvedValueOnce({ ...posted, status: TransferStatus.CANCELLED });

      const result = await service.cancel('xfer-1', actor);

      expect(result.status).toBe(TransferStatus.CANCELLED);
      // Reversal: stock returns to source (+), leaves destination (−).
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            movementType: StockMovementType.TRANSFER_IN,
            quantity: 5,
            locationId: 'loc-src',
            referenceType: 'TRANSFER_REVERSAL',
          }),
          expect.objectContaining({
            movementType: StockMovementType.TRANSFER_OUT,
            quantity: -5,
            locationId: 'loc-dst',
            referenceType: 'TRANSFER_REVERSAL',
          }),
        ]),
        expect.anything(),
      );
      expect(ledgerService.publishMovementEvents).toHaveBeenCalled();
    });

    it('rejects cancelling an already CANCELLED transfer (no double reversal)', async () => {
      transferRepo.findOne.mockResolvedValue({
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.CANCELLED,
        lines: [],
      });

      await expect(service.cancel('xfer-1', actor)).rejects.toThrow(
        BadRequestException,
      );
      expect(ledgerService.recordBatchMovements).not.toHaveBeenCalled();
    });
  });

  describe('createIntraWarehouseTransferAndPost', () => {
    const sourceLocation = {
      id: 'loc-src',
      organizationId: 'org-1',
      storageId: 'storage-1',
      code: 'A-01',
      name: 'Vị trí A-01',
    };
    const destLocation = {
      id: 'loc-dst',
      organizationId: 'org-1',
      storageId: 'storage-1',
      code: 'B-01',
      name: 'Vị trí B-01',
    };

    const intraDto = {
      sourceLocationId: 'loc-src',
      destinationLocationId: 'loc-dst',
      lines: [{ itemId: 'item-1', quantity: 3 }],
    };

    it('happy path: đổi vị trí → chỉ ghi ledger, KHÔNG sinh phiếu chuyển kho', async () => {
      // postIntraWarehouseMoves batch-loads both locations via find().
      locationRepo.find.mockResolvedValue([sourceLocation, destLocation]);

      const result = await service.createIntraWarehouseTransferAndPost(intraDto, actor);

      // Đổi vị trí không sinh phiếu → trả null và không cấp số chứng từ.
      expect(result).toBeNull();
      expect(docNumbering.generate).not.toHaveBeenCalled();
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            movementType: StockMovementType.TRANSFER_OUT,
            referenceType: 'LOCATION_CHANGE',
          }),
          expect.objectContaining({
            movementType: StockMovementType.TRANSFER_IN,
            referenceType: 'LOCATION_CHANGE',
          }),
        ]),
        expect.anything(),
      );
    });

    it('cho phép chuyển số lượng 0 (đổi vị trí kể cả khi hết tồn)', async () => {
      locationRepo.find.mockResolvedValue([sourceLocation, destLocation]);

      const result = await service.createIntraWarehouseTransferAndPost(
        { ...intraDto, lines: [{ itemId: 'item-1', quantity: 0 }] },
        actor,
      );

      expect(result).toBeNull();
      expect(ledgerService.recordBatchMovements).toHaveBeenCalled();
    });

    it('luồng arrange (createDocument mặc định) → tạo và post phiếu chuyển kho', async () => {
      locationRepo.find.mockResolvedValue([sourceLocation, destLocation]);
      transferRepo.findOne.mockResolvedValue({
        id: 'xfer-1',
        status: TransferStatus.POSTED,
        documentNumber: 'TFR-2026-0001',
      });

      const result = await service.postIntraWarehouseMoves(
        [
          {
            itemId: 'item-1',
            quantity: 3,
            sourceLocationId: 'loc-src',
            destinationLocationId: 'loc-dst',
          },
        ],
        actor,
      );

      expect(docNumbering.generate).toHaveBeenCalled();
      expect(result?.status).toBe(TransferStatus.POSTED);
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ referenceType: 'TRANSFER' }),
        ]),
        expect.anything(),
      );
    });

    it('cross-storage rejection: throws BadRequestException', async () => {
      locationRepo.find.mockResolvedValue([
        { ...sourceLocation, storageId: 'storage-A' },
        { ...destLocation, storageId: 'storage-B' },
      ]);

      await expect(
        service.createIntraWarehouseTransferAndPost(intraDto, actor),
      ).rejects.toThrow(/cùng một kho/);
    });

    it('cross-org rejection: location belongs to another org → throws NotFoundException', async () => {
      // Locations from another org are not returned by the org-scoped find().
      locationRepo.find.mockResolvedValue([]);

      const orgBactor = { ...actor, organizationId: 'org-2' };

      await expect(
        service.createIntraWarehouseTransferAndPost(intraDto, orgBactor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createAndPost (Kho → Kho, same branch)', () => {
    const storageA = {
      id: 'storage-A',
      organizationId: 'org-1',
      branchId: 'branch-1',
      name: 'Kho A',
    };
    const storageB = {
      id: 'storage-B',
      organizationId: 'org-1',
      branchId: 'branch-1',
      name: 'Kho B',
    };

    const khoToKhoDto = {
      lines: [
        {
          itemId: 'item-1',
          quantity: 3,
          sourceStorageId: 'storage-A',
          destinationStorageId: 'storage-B',
        },
      ],
    };

    const draftTransfer = {
      id: 'xfer-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
      sourceBranchId: 'branch-1',
      destinationBranchId: 'branch-1',
      sourceLocationId: 'loc-A',
      destinationLocationId: 'loc-B',
      documentNumber: 'TFR-2026-0001',
      status: TransferStatus.DRAFT,
      lines: [
        {
          itemId: 'item-1',
          quantity: 3,
          sourceLocationId: 'loc-A',
          destinationLocationId: 'loc-B',
          unitPrice: '8.00',
        },
      ],
    };

    function mockDefaultLocations() {
      storageDefaultLocationResolver.resolveStorageTransferLocation
        .mockResolvedValueOnce('loc-A')
        .mockResolvedValueOnce('loc-B');
    }

    it('happy path: posts both legs in one transaction against the source/dest defaults', async () => {
      storageRepo.find.mockResolvedValue([storageA, storageB]);
      mockDefaultLocations();
      transferRepo.findOne
        .mockResolvedValueOnce(draftTransfer) // create() reload
        .mockResolvedValueOnce(draftTransfer) // post() load
        .mockResolvedValueOnce({ ...draftTransfer, status: TransferStatus.POSTED }); // post() reload

      const result = await service.createAndPost(khoToKhoDto, actor);

      expect(result.status).toBe(TransferStatus.POSTED);
      // Both legs written on the caller's transaction (manager passed).
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            movementType: StockMovementType.TRANSFER_OUT,
            quantity: -3,
            locationId: 'loc-A',
            unitCost: 8,
          }),
          expect.objectContaining({
            movementType: StockMovementType.TRANSFER_IN,
            quantity: 3,
            locationId: 'loc-B',
            unitCost: 8,
          }),
        ]),
        expect.anything(),
      );
      expect(ledgerService.publishMovementEvents).toHaveBeenCalled();
    });

    it('rejects storages in a different branch', async () => {
      storageRepo.find.mockResolvedValue([
        storageA,
        { ...storageB, branchId: 'branch-2' },
      ]);

      await expect(service.createAndPost(khoToKhoDto, actor)).rejects.toThrow(
        /same branch/,
      );
      expect(ledgerService.recordBatchMovements).not.toHaveBeenCalled();
    });

    it('rejects when a storage has no active location', async () => {
      storageRepo.find.mockResolvedValue([storageA, storageB]);
      storageDefaultLocationResolver.resolveStorageTransferLocation.mockRejectedValue(
        new BadRequestException(
          'Kho "Kho A" chưa có vị trí lưu cụ thể — vui lòng chọn kệ hoặc tạo ít nhất một vị trí (không phải "Chưa xếp")',
        ),
      );

      await expect(service.createAndPost(khoToKhoDto, actor)).rejects.toThrow(
        /vị trí lưu cụ thể/,
      );
    });

    it('rejects when on-hand at the source location is insufficient', async () => {
      storageRepo.find.mockResolvedValue([storageA, storageB]);
      mockDefaultLocations();
      balanceQb.getOne.mockResolvedValue({ quantity: 1 }); // need 3, have 1
      transferRepo.findOne
        .mockResolvedValueOnce(draftTransfer) // create() reload
        .mockResolvedValueOnce(draftTransfer); // post() load (throws before reload)

      await expect(service.createAndPost(khoToKhoDto, actor)).rejects.toThrow(
        BadRequestException,
      );
      // The orphan DRAFT is cleaned up after the failed post.
      expect(transferRepo.delete).toHaveBeenCalledWith({ id: 'xfer-1' });
    });

    it('rejects a transporter that does not belong to the organization', async () => {
      storageRepo.find.mockResolvedValue([storageA, storageB]);
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createAndPost(
          { ...khoToKhoDto, transporterUserId: 'ghost-user' },
          actor,
        ),
      ).rejects.toThrow(/Transporter user not found/);
      expect(ledgerService.recordBatchMovements).not.toHaveBeenCalled();
    });
  });

  describe('update — edit POSTED (reverse + repost)', () => {
    const storageA = {
      id: 'storage-A',
      organizationId: 'org-1',
      branchId: 'branch-1',
      name: 'Kho A',
    };
    const storageB = {
      id: 'storage-B',
      organizationId: 'org-1',
      branchId: 'branch-1',
      name: 'Kho B',
    };

    // Edit moves the destination from the old bin to storage-B's default bin.
    const editDto = {
      lines: [
        {
          itemId: 'item-1',
          quantity: 3,
          sourceStorageId: 'storage-A',
          destinationStorageId: 'storage-B',
        },
      ],
    };

    const postedTransfer = {
      id: 'xfer-1',
      organizationId: 'org-1',
      status: TransferStatus.POSTED,
      documentNumber: 'CK000001',
      sourceBranchId: 'branch-1',
      destinationBranchId: 'branch-1',
      sourceLocationId: 'loc-A',
      destinationLocationId: 'loc-old-dst',
      lines: [
        {
          itemId: 'item-1',
          quantity: 3,
          sourceLocationId: 'loc-A',
          destinationLocationId: 'loc-old-dst',
          unitPrice: '8.00',
        },
      ],
    };

    function mockDefaultLocations() {
      storageDefaultLocationResolver.resolveStorageTransferLocation
        .mockResolvedValueOnce('loc-A')
        .mockResolvedValueOnce('loc-B');
    }

    it('reverses the original legs and posts the edited legs, keeping the document number', async () => {
      storageRepo.find.mockResolvedValue([storageA, storageB]);
      mockDefaultLocations();
      transferRepo.findOne
        .mockResolvedValueOnce(postedTransfer)
        .mockResolvedValueOnce(postedTransfer); // final reload (still POSTED, same number)

      const result = await service.update('xfer-1', editDto, actor);

      expect(result.status).toBe(TransferStatus.POSTED);
      expect(result.documentNumber).toBe('CK000001');
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ referenceType: 'TRANSFER_EDIT_REVERSAL' }),
          expect.objectContaining({ referenceType: 'TRANSFER' }),
        ]),
        expect.anything(),
      );
      expect(ledgerService.publishMovementEvents).toHaveBeenCalled();
    });

    it('blocks the edit when a location would go negative (insufficient stock)', async () => {
      storageRepo.find.mockResolvedValue([storageA, storageB]);
      mockDefaultLocations();
      balanceQb.getOne.mockResolvedValue({ quantity: 1 }); // old dest has 1, reversal needs 3
      transferRepo.findOne.mockResolvedValueOnce(postedTransfer);

      await expect(service.update('xfer-1', editDto, actor)).rejects.toThrow(
        BadRequestException,
      );
      expect(ledgerService.recordBatchMovements).not.toHaveBeenCalled();
    });

    it('rejects editing a CANCELLED transfer', async () => {
      transferRepo.findOne.mockResolvedValue({
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.CANCELLED,
        lines: [],
      });

      await expect(service.update('xfer-1', editDto, actor)).rejects.toThrow(
        /cancelled/i,
      );
      expect(ledgerService.recordBatchMovements).not.toHaveBeenCalled();
    });

    it('edits a DRAFT without touching the ledger', async () => {
      storageRepo.find.mockResolvedValue([storageA, storageB]);
      mockDefaultLocations();
      const draft = { ...postedTransfer, status: TransferStatus.DRAFT };
      transferRepo.findOne
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(draft);

      const result = await service.update('xfer-1', editDto, actor);

      expect(result.status).toBe(TransferStatus.DRAFT);
      expect(ledgerService.recordBatchMovements).not.toHaveBeenCalled();
    });
  });
});
