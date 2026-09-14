import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

// create() pre-generates the row id (T-04-03 review: syncOwner must run
// before a document number is minted) via `crypto.randomUUID()` — pinned to
// the fixture id used throughout this file so every existing assertion on
// 'xfer-1' keeps meaning what it always meant.
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'xfer-1'),
}));
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
import { MediaLinkService } from '../../media/media-link.service';
import { MediaOwnerType } from '../../media/media-object.entity';
import { MediaOwnerReaderRegistry } from '../../media/media-owner-reader.registry';
import { MediaQueryService } from '../../media/media-query.service';

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
  let mediaLink: Record<string, jest.Mock>;
  let mediaQuery: Record<string, jest.Mock>;
  let mediaOwnerReaderRegistry: Record<string, jest.Mock>;

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
      // Handles both TypeORM overloads used across this service:
      // `manager.save(Entity, data)` (postIntraWarehouseMoves) and the
      // single-arg `manager.save(entityInstance)` (create()'s own insert).
      save: jest.fn().mockImplementation((entityOrData, maybeData) => {
        const data = maybeData !== undefined ? maybeData : entityOrData;
        return Promise.resolve({ id: 'xfer-1', ...data });
      }),
      // postIntraWarehouseMoves() re-marks destination balances as tracked
      // via a raw UPDATE; empty result is fine for these tests.
      query: jest.fn().mockResolvedValue([]),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
      // Deliberately a *different* object from the transaction's manager —
      // resolveDocCounterparty() reads this one outside any transaction
      // (only when counterpartyKind is set, unused by these tests). Keeping
      // it distinct means an "uses the transaction manager" assertion can
      // actually fail if the code under test writes through this one instead.
      manager: { find: jest.fn().mockResolvedValue([]) } as any,
      _mockManager: mockManager as any,
    };
    storageDefaultLocationResolver = {
      resolveStorageTransferLocation: jest.fn(),
    };

    mediaLink = {
      syncOwner: jest.fn().mockResolvedValue([]),
      detachAll: jest.fn().mockResolvedValue([]),
    };
    mediaQuery = {
      listForOwners: jest.fn().mockResolvedValue(new Map()),
    };
    mediaOwnerReaderRegistry = {
      register: jest.fn(),
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
        { provide: MediaLinkService, useValue: mediaLink },
        { provide: MediaQueryService, useValue: mediaQuery },
        { provide: MediaOwnerReaderRegistry, useValue: mediaOwnerReaderRegistry },
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
      // `manager` is now passed (T-04-03): generate() runs inside create()'s
      // own transaction, after the attachment sync, so it never opens a
      // second connection while this one is held (see that method's own
      // doc comment on pool deadlock) and never burns a number on a
      // rejected attachment id.
      expect(docNumbering.generate).toHaveBeenCalledWith(
        DocumentType.TRANSFER,
        'branch-src',
        actor,
        dataSource._mockManager,
      );
      expect(transferRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLocationId: 'loc-src',
          destinationLocationId: 'loc-dst',
          status: TransferStatus.DRAFT,
          documentNumber: 'TFR-2026-0001',
        }),
      );
      // Entity insert now runs through the transaction manager (T-04-03), so
      // an invalid attachment id can roll the whole create back.
      expect((dataSource._mockManager as any).save).toHaveBeenCalled();
    });

    describe('attachments (T-04-03)', () => {
      it('syncs attachmentIds through the same transaction as the insert, before the document number is minted, and inserts the sorted list directly', async () => {
        transferRepo.findOne.mockResolvedValue({
          id: 'xfer-1',
          organizationId: 'org-1',
          status: TransferStatus.DRAFT,
        });
        mediaLink.syncOwner.mockResolvedValueOnce(['media-1', 'media-2']);

        await service.create(
          { ...validDto, attachmentIds: ['media-2', 'media-1'] },
          actor,
        );

        expect(mediaLink.syncOwner).toHaveBeenCalledWith(
          MediaOwnerType.STOCK_TRANSFER,
          'xfer-1',
          ['media-2', 'media-1'],
          actor,
          dataSource._mockManager,
        );
        // The synced (sorted) list is written as part of the one INSERT —
        // there is no second write to the attachmentIds column.
        expect((dataSource._mockManager as any).save).toHaveBeenCalledWith(
          expect.objectContaining({ attachmentIds: ['media-1', 'media-2'] }),
        );
        expect((dataSource._mockManager as any).update).not.toHaveBeenCalled();
        // syncOwner is called before the document number is minted, so an
        // invalid attachment id never burns a number gap.
        expect(
          mediaLink.syncOwner.mock.invocationCallOrder[0],
        ).toBeLessThan(docNumbering.generate.mock.invocationCallOrder[0]);
      });

      it('never calls syncOwner when attachmentIds is not sent', async () => {
        transferRepo.findOne.mockResolvedValue({
          id: 'xfer-1',
          organizationId: 'org-1',
          status: TransferStatus.DRAFT,
        });

        await service.create(validDto, actor);

        expect(mediaLink.syncOwner).not.toHaveBeenCalled();
      });

      it('rolls back the whole create (rejects, never reaches findOrFail) when an attachment id belongs to another organization', async () => {
        const crossOrgError = new NotFoundException('Media not found');
        mediaLink.syncOwner.mockRejectedValueOnce(crossOrgError);

        await expect(
          service.create(
            { ...validDto, attachmentIds: ['media-other-org'] },
            actor,
          ),
        ).rejects.toBe(crossOrgError);

        expect(transferRepo.findOne).not.toHaveBeenCalled();
        expect((dataSource._mockManager as any).update).not.toHaveBeenCalled();
      });
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

    it('rejects deleting a system-generated transfer (temp warehouse / POS fulfillment)', async () => {
      transferRepo.findOne.mockResolvedValue({
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.POSTED,
        isSystemGenerated: true,
        lines: [],
      });

      await expect(service.cancel('xfer-1', actor)).rejects.toThrow(
        /system-generated/i,
      );
      expect(ledgerService.recordBatchMovements).not.toHaveBeenCalled();
      expect(transferRepo.save).not.toHaveBeenCalled();
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
      // The orphan DRAFT is cleaned up after the failed post — media synced
      // by create() must be detached in the SAME transaction as the delete,
      // or it stays ATTACHED to an owner_id that no longer exists and cleanup
      // never collects it (T-04-03 review, ADR-05/A-19). A retry must upload
      // the files again, since detached media become DELETED.
      expect(mediaLink.detachAll).toHaveBeenCalledWith(
        MediaOwnerType.STOCK_TRANSFER,
        'xfer-1',
        'org-1',
        dataSource._mockManager,
      );
      expect((dataSource._mockManager as any).delete).toHaveBeenCalledWith(
        StockTransferEntity,
        { id: 'xfer-1' },
      );
      expect(
        mediaLink.detachAll.mock.invocationCallOrder[0],
      ).toBeLessThan(
        (dataSource._mockManager as any).delete.mock.invocationCallOrder[0],
      );
      expect(transferRepo.delete).not.toHaveBeenCalled();
    });

    it('posts despite insufficient on-hand when validateOnHand is off (kho xuất âm)', async () => {
      storageRepo.find.mockResolvedValue([storageA, storageB]);
      mockDefaultLocations();
      balanceQb.getOne.mockResolvedValue({ quantity: 1 }); // need 3, have 1
      transferRepo.findOne
        .mockResolvedValueOnce(draftTransfer) // create() reload
        .mockResolvedValueOnce(draftTransfer) // post() load
        .mockResolvedValueOnce({ ...draftTransfer, status: TransferStatus.POSTED });

      const result = await service.createAndPost(khoToKhoDto, actor, {
        validateOnHand: false,
      });

      expect(result.status).toBe(TransferStatus.POSTED);
      expect(transferRepo.delete).not.toHaveBeenCalled();
      expect(ledgerService.recordBatchMovements).toHaveBeenCalled();
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

    // The temp-warehouse consumer compensates a sale that is already in the
    // ledger, so its legs have to land before that sale — see ADR-01/ADR-03.
    describe('opts.postedAt', () => {
      const backdated = new Date('2026-08-29T03:15:22.999Z');

      function mockPostReloads() {
        transferRepo.findOne
          .mockResolvedValueOnce(draftTransfer) // create() reload
          .mockResolvedValueOnce(draftTransfer) // post() load
          .mockResolvedValueOnce({ ...draftTransfer, status: TransferStatus.POSTED });
      }

      it('stamps both ledger legs with the supplied instant (validateOnHand off — temp warehouse path)', async () => {
        storageRepo.find.mockResolvedValue([storageA, storageB]);
        mockDefaultLocations();
        mockPostReloads();

        await service.createAndPost(khoToKhoDto, actor, {
          validateOnHand: false,
          postedAt: backdated,
        });

        const [movements] = ledgerService.recordBatchMovements.mock.calls[0];
        expect(movements).toHaveLength(2);
        // Both legs share one instant, or the transfer itself would create a
        // moment where the source has shipped and the destination has not received.
        expect(movements.map((m: { postedAt?: Date }) => m.postedAt)).toEqual([
          backdated,
          backdated,
        ]);
      });

      it('stamps both ledger legs on the locking path too, so the two branches cannot drift', async () => {
        storageRepo.find.mockResolvedValue([storageA, storageB]);
        mockDefaultLocations();
        mockPostReloads();

        await service.createAndPost(khoToKhoDto, actor, { postedAt: backdated });

        const [movements] = ledgerService.recordBatchMovements.mock.calls[0];
        expect(movements.map((m: { postedAt?: Date }) => m.postedAt)).toEqual([
          backdated,
          backdated,
        ]);
      });

      it('leaves postedAt unset when the caller supplies none, so the ledger keeps the write instant (AC-03)', async () => {
        storageRepo.find.mockResolvedValue([storageA, storageB]);
        mockDefaultLocations();
        mockPostReloads();

        await service.createAndPost(khoToKhoDto, actor);

        const [movements] = ledgerService.recordBatchMovements.mock.calls[0];
        for (const movement of movements) {
          expect(movement.postedAt).toBeUndefined();
        }
      });

      it('keeps the transfer\u2019s own posted_at at real time even when the legs are backdated (ADR-03)', async () => {
        storageRepo.find.mockResolvedValue([storageA, storageB]);
        mockDefaultLocations();
        mockPostReloads();

        const before = Date.now();
        await service.createAndPost(khoToKhoDto, actor, {
          validateOnHand: false,
          postedAt: backdated,
        });
        const after = Date.now();

        const statusPatch = (dataSource._mockManager as any).update.mock.calls.find(
          (call: unknown[]) => call[1] === 'xfer-1',
        )![2] as { status: TransferStatus; postedAt: Date };
        expect(statusPatch.status).toBe(TransferStatus.POSTED);
        expect(statusPatch.postedAt.getTime()).toBeGreaterThanOrEqual(before);
        expect(statusPatch.postedAt.getTime()).toBeLessThanOrEqual(after);
      });
    });

    describe('attachments (T-04-03)', () => {
      it('createAndPost path: attaches media through the same create() sync (HTTP POST /inventory/stock/transfers)', async () => {
        storageRepo.find.mockResolvedValue([storageA, storageB]);
        mockDefaultLocations();
        transferRepo.findOne
          .mockResolvedValueOnce(draftTransfer)
          .mockResolvedValueOnce(draftTransfer)
          .mockResolvedValueOnce({ ...draftTransfer, status: TransferStatus.POSTED });
        mediaLink.syncOwner.mockResolvedValueOnce(['media-1']);

        await service.createAndPost(
          { ...khoToKhoDto, attachmentIds: ['media-1'] },
          actor,
        );

        expect(mediaLink.syncOwner).toHaveBeenCalledWith(
          MediaOwnerType.STOCK_TRANSFER,
          'xfer-1',
          ['media-1'],
          actor,
          dataSource._mockManager,
        );
      });

      it('v2 handler path: attaches media (CreateStockTransferV2Handler forwards its dto straight into createAndPost)', async () => {
        storageRepo.find.mockResolvedValue([storageA, storageB]);
        mockDefaultLocations();
        transferRepo.findOne
          .mockResolvedValueOnce(draftTransfer)
          .mockResolvedValueOnce(draftTransfer)
          .mockResolvedValueOnce({ ...draftTransfer, status: TransferStatus.POSTED });
        mediaLink.syncOwner.mockResolvedValueOnce(['media-2']);

        // Shape CreateStockTransferV2Handler.execute() actually sends: the v2
        // dto cast to BranchScopedTransferInput, unchanged apart from the
        // per-product uniform-location check it runs first (not exercised
        // here — see create-stock-transfer-v2.handler.spec.ts).
        await service.createAndPost(
          {
            lines: [
              {
                itemId: 'item-1',
                quantity: 3,
                sourceStorageId: 'storage-A',
                destinationStorageId: 'storage-B',
              },
            ],
            attachmentIds: ['media-2'],
          },
          actor,
        );

        expect(mediaLink.syncOwner).toHaveBeenCalledWith(
          MediaOwnerType.STOCK_TRANSFER,
          'xfer-1',
          ['media-2'],
          actor,
          dataSource._mockManager,
        );
      });

      it('never calls syncOwner when the request omits attachmentIds', async () => {
        storageRepo.find.mockResolvedValue([storageA, storageB]);
        mockDefaultLocations();
        transferRepo.findOne
          .mockResolvedValueOnce(draftTransfer)
          .mockResolvedValueOnce(draftTransfer)
          .mockResolvedValueOnce({ ...draftTransfer, status: TransferStatus.POSTED });

        await service.createAndPost(khoToKhoDto, actor);

        expect(mediaLink.syncOwner).not.toHaveBeenCalled();
      });
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

    it('allows the edit to drive a location negative when allowNegative is set', async () => {
      storageRepo.find.mockResolvedValue([storageA, storageB]);
      mockDefaultLocations();
      balanceQb.getOne.mockResolvedValue({ quantity: 1 }); // old dest has 1, reversal needs 3
      transferRepo.findOne
        .mockResolvedValueOnce(postedTransfer)
        .mockResolvedValueOnce(postedTransfer); // final reload

      const result = await service.update('xfer-1', editDto, actor, {
        allowNegative: true,
      });

      expect(result.status).toBe(TransferStatus.POSTED);
      expect(ledgerService.recordBatchMovements).toHaveBeenCalled();
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

    it('rejects editing a system-generated transfer (temp warehouse / POS fulfillment)', async () => {
      transferRepo.findOne.mockResolvedValue({
        ...postedTransfer,
        isSystemGenerated: true,
      });

      await expect(service.update('xfer-1', editDto, actor)).rejects.toThrow(
        /system-generated/i,
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

    describe('attachments (T-04-03)', () => {
      it('POSTED: the reversal edit keeps the same id — syncs attachmentIds in the same transaction as the reverse+repost, and stores the SYNCED array (not the submitted one)', async () => {
        storageRepo.find.mockResolvedValue([storageA, storageB]);
        mockDefaultLocations();
        transferRepo.findOne
          .mockResolvedValueOnce(postedTransfer)
          .mockResolvedValueOnce(postedTransfer);
        // syncOwner drops 'media-x' — the persisted column must reflect
        // that, not the raw client-submitted list.
        mediaLink.syncOwner.mockResolvedValueOnce(['media-1']);

        await service.update(
          'xfer-1',
          { ...editDto, attachmentIds: ['media-1', 'media-x'] },
          actor,
        );

        expect(mediaLink.syncOwner).toHaveBeenCalledWith(
          MediaOwnerType.STOCK_TRANSFER,
          'xfer-1',
          ['media-1', 'media-x'],
          actor,
          dataSource._mockManager,
        );
        expect((dataSource._mockManager as any).update).toHaveBeenCalledWith(
          StockTransferEntity,
          'xfer-1',
          { attachmentIds: ['media-1'] },
        );
      });

      it('POSTED: the in-transaction stock re-check runs first — an insufficient-stock rejection means syncOwner is never called', async () => {
        storageRepo.find.mockResolvedValue([storageA, storageB]);
        mockDefaultLocations();
        balanceQb.getOne.mockResolvedValue({ quantity: 1 }); // old dest has 1, reversal needs 3
        transferRepo.findOne.mockResolvedValueOnce(postedTransfer);

        await expect(
          service.update(
            'xfer-1',
            { ...editDto, attachmentIds: ['media-1'] },
            actor,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(mediaLink.syncOwner).not.toHaveBeenCalled();
      });

      it('DRAFT: syncs attachmentIds inside the same transaction as the header/lines save, and stores the SYNCED array (not the submitted one)', async () => {
        storageRepo.find.mockResolvedValue([storageA, storageB]);
        mockDefaultLocations();
        const draft = { ...postedTransfer, status: TransferStatus.DRAFT };
        transferRepo.findOne
          .mockResolvedValueOnce(draft)
          .mockResolvedValueOnce(draft);
        mediaLink.syncOwner.mockResolvedValueOnce(['media-2']);

        await service.update(
          'xfer-1',
          { ...editDto, attachmentIds: ['media-y', 'media-2'] },
          actor,
        );

        expect(mediaLink.syncOwner).toHaveBeenCalledWith(
          MediaOwnerType.STOCK_TRANSFER,
          'xfer-1',
          ['media-y', 'media-2'],
          actor,
          dataSource._mockManager,
        );
        expect((dataSource._mockManager as any).update).toHaveBeenCalledWith(
          StockTransferEntity,
          'xfer-1',
          { attachmentIds: ['media-2'] },
        );
      });

      it('never calls syncOwner when attachmentIds is not sent', async () => {
        storageRepo.find.mockResolvedValue([storageA, storageB]);
        mockDefaultLocations();
        transferRepo.findOne
          .mockResolvedValueOnce(postedTransfer)
          .mockResolvedValueOnce(postedTransfer);

        await service.update('xfer-1', editDto, actor);

        expect(mediaLink.syncOwner).not.toHaveBeenCalled();
      });

      it('CANCELLED: rejects the edit and never calls syncOwner', async () => {
        transferRepo.findOne.mockResolvedValue({
          id: 'xfer-1',
          organizationId: 'org-1',
          status: TransferStatus.CANCELLED,
          lines: [],
        });

        await expect(
          service.update(
            'xfer-1',
            { ...editDto, attachmentIds: ['media-1'] },
            actor,
          ),
        ).rejects.toThrow(/cancelled/i);

        expect(mediaLink.syncOwner).not.toHaveBeenCalled();
      });
    });
  });

  describe('getById — attachments (T-04-03)', () => {
    it('inlines attachments from MediaQueryService.listForOwners', async () => {
      transferRepo.findOne.mockResolvedValue({
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.DRAFT,
        lines: [],
      });
      mediaQuery.listForOwners.mockResolvedValueOnce(
        new Map([
          [
            'xfer-1',
            [
              {
                id: 'media-1',
                fileName: 'phieu.pdf',
                contentType: 'application/pdf',
                size: 2048,
                sortOrder: 0,
                bucket: 'erp-media-private',
                objectKey: 'org/org-1/stock_transfer/media-1',
                ownerType: MediaOwnerType.STOCK_TRANSFER,
              },
            ],
          ],
        ]),
      );

      const transfer = await service.getById('xfer-1', 'org-1');

      expect(mediaQuery.listForOwners).toHaveBeenCalledWith(
        MediaOwnerType.STOCK_TRANSFER,
        ['xfer-1'],
        'org-1',
      );
      expect((transfer as any).attachments).toEqual([
        {
          id: 'media-1',
          fileName: 'phieu.pdf',
          contentType: 'application/pdf',
          size: 2048,
        },
      ]);
    });

    it('returns an empty attachments array when nothing is attached', async () => {
      transferRepo.findOne.mockResolvedValue({
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.DRAFT,
        lines: [],
      });

      const transfer = await service.getById('xfer-1', 'org-1');

      expect((transfer as any).attachments).toEqual([]);
    });
  });

  describe('onModuleInit — media reader registration (ADR-06, T-04-03)', () => {
    function registeredReader() {
      service.onModuleInit();
      expect(mediaOwnerReaderRegistry.register).toHaveBeenCalledWith(
        MediaOwnerType.STOCK_TRANSFER,
        expect.any(Function),
      );
      return mediaOwnerReaderRegistry.register.mock.calls[0][1] as (
        ownerId: string,
        readerActor: typeof actor,
      ) => Promise<boolean>;
    }

    it('returns true when the actor can view the transfer (reuses getById)', async () => {
      transferRepo.findOne.mockResolvedValue({
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.DRAFT,
        lines: [],
      });
      const reader = registeredReader();

      await expect(reader('xfer-1', actor)).resolves.toBe(true);
    });

    it('returns false (never throws) when getById 404s (different organization)', async () => {
      transferRepo.findOne.mockResolvedValue(null);
      const reader = registeredReader();

      await expect(reader('xfer-1', actor)).resolves.toBe(false);
    });

    it('rethrows an unexpected error instead of swallowing it to false', async () => {
      transferRepo.findOne.mockRejectedValue(new Error('db down'));
      const reader = registeredReader();

      await expect(reader('xfer-1', actor)).rejects.toThrow('db down');
    });

    it('also maps a ForbiddenException from getById to false (not just NotFoundException)', async () => {
      // getById never actually throws ForbiddenException today (no branch
      // scope on this GET — see the controller check), but the reader's
      // contract (map NotFound/Forbidden to false, rethrow else) must hold
      // regardless — assert it directly against the method.
      jest.spyOn(service, 'getById').mockRejectedValueOnce(
        new ForbiddenException('no'),
      );
      const reader = registeredReader();

      await expect(reader('xfer-1', actor)).resolves.toBe(false);
    });
  });
});
