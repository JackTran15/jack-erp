import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TransferStatus, StockMovementType, DocumentType } from '@erp/shared-interfaces';
import { StockTransferService, CreateTransferDto } from './stock-transfer.service';
import { StockTransferEntity } from './stock-transfer.entity';
import { LocationEntity } from '../location/location.entity';
import { ItemCostSnapshotService } from '../location/item-cost-snapshot.service';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';

describe('StockTransferService', () => {
  let service: StockTransferService;
  let transferRepo: Record<string, jest.Mock>;
  let locationRepo: Record<string, jest.Mock>;
  let itemCostSnapshotService: Record<string, jest.Mock>;
  let ledgerService: Record<string, jest.Mock>;
  let docNumbering: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;

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
    };

    locationRepo = {
      findOne: jest.fn(),
    };

    itemCostSnapshotService = {
      snapshotCosts: jest
        .fn()
        .mockResolvedValue(new Map<string, number>([['item-1', 8]])),
    };

    ledgerService = {
      recordBatchMovements: jest.fn().mockResolvedValue([]),
    };

    docNumbering = {
      generate: jest.fn().mockResolvedValue('TFR-2026-0001'),
    };

    const mockManager = {
      update: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockTransferService,
        { provide: getRepositoryToken(StockTransferEntity), useValue: transferRepo },
        { provide: getRepositoryToken(LocationEntity), useValue: locationRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: StockLedgerService, useValue: ledgerService },
        { provide: DocumentNumberingService, useValue: docNumbering },
        { provide: ItemCostSnapshotService, useValue: itemCostSnapshotService },
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

    it('should create a DRAFT transfer with valid input', async () => {
      const result = await service.create(validDto, actor);

      expect(result.status).toBe(TransferStatus.DRAFT);
      expect(transferRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLocationId: 'loc-src',
          destinationLocationId: 'loc-dst',
          status: TransferStatus.DRAFT,
        }),
      );
      expect(transferRepo.save).toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('should succeed transitioning DRAFT -> APPROVED', async () => {
      const transfer = {
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.DRAFT,
      };
      transferRepo.findOne.mockResolvedValue(transfer);

      const result = await service.approve('xfer-1', actor);

      expect(result.status).toBe(TransferStatus.APPROVED);
      expect(result.approvedBy).toBe('user-1');
      expect(transferRepo.save).toHaveBeenCalled();
    });

    it('should fail transitioning POSTED -> APPROVED', async () => {
      const transfer = {
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.POSTED,
      };
      transferRepo.findOne.mockResolvedValue(transfer);

      await expect(service.approve('xfer-1', actor)).rejects.toThrow(BadRequestException);
      await expect(service.approve('xfer-1', actor)).rejects.toThrow(
        /Cannot transition from POSTED/,
      );
    });
  });

  describe('post', () => {
    it('should create paired TRANSFER_OUT/TRANSFER_IN ledger entries', async () => {
      const transfer = {
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.APPROVED,
        sourceLocationId: 'loc-src',
        destinationLocationId: 'loc-dst',
        sourceBranchId: 'branch-src',
        destinationBranchId: 'branch-dst',
        lines: [{ itemId: 'item-1', quantity: 5 }],
      };
      transferRepo.findOne.mockResolvedValue(transfer);

      await service.post('xfer-1', actor);

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
      expect(docNumbering.generate).toHaveBeenCalledWith(
        DocumentType.TRANSFER,
        'branch-src',
        actor,
      );
    });
  });

  describe('cancel', () => {
    it.each([TransferStatus.DRAFT, TransferStatus.APPROVED])(
      'should cancel a transfer in %s status',
      async (status) => {
        const transfer = {
          id: 'xfer-1',
          organizationId: 'org-1',
          status,
        };
        transferRepo.findOne.mockResolvedValue(transfer);

        const result = await service.cancel('xfer-1', actor);

        expect(result.status).toBe(TransferStatus.CANCELLED);
        expect(transferRepo.save).toHaveBeenCalled();
      },
    );

    it('should fail cancelling a POSTED transfer', async () => {
      const transfer = {
        id: 'xfer-1',
        organizationId: 'org-1',
        status: TransferStatus.POSTED,
      };
      transferRepo.findOne.mockResolvedValue(transfer);

      await expect(service.cancel('xfer-1', actor)).rejects.toThrow(BadRequestException);
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

    it('happy path: same storage → creates, approves, and posts transfer', async () => {
      // locationRepo returns matching locations
      locationRepo.findOne
        .mockResolvedValueOnce(sourceLocation)  // source lookup
        .mockResolvedValueOnce(destLocation);   // dest lookup

      // transferRepo.findOne drives approve() and post() calls
      // 1st findOne (approve): returns DRAFT transfer
      // 2nd findOne (post): returns APPROVED transfer
      // 3rd findOne (post's final reload): returns POSTED transfer
      const draftTransfer = {
        id: 'xfer-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        sourceBranchId: 'branch-1',
        destinationBranchId: 'branch-1',
        sourceLocationId: 'loc-src',
        destinationLocationId: 'loc-dst',
        status: TransferStatus.DRAFT,
        lines: [{ itemId: 'item-1', quantity: 3 }],
      };
      const approvedTransfer = { ...draftTransfer, status: TransferStatus.APPROVED };
      const postedTransfer = { ...draftTransfer, status: TransferStatus.POSTED, documentNumber: 'TFR-2026-0001' };

      transferRepo.findOne
        .mockResolvedValueOnce(draftTransfer)    // approve() → findOrFail
        .mockResolvedValueOnce(approvedTransfer) // post() → findOrFail
        .mockResolvedValueOnce(postedTransfer);  // post() → final reload

      const result = await service.createIntraWarehouseTransferAndPost(intraDto, actor);

      expect(result.status).toBe(TransferStatus.POSTED);
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ movementType: StockMovementType.TRANSFER_OUT }),
          expect.objectContaining({ movementType: StockMovementType.TRANSFER_IN }),
        ]),
      );
    });

    it('cross-storage rejection: throws BadRequestException', async () => {
      locationRepo.findOne
        .mockResolvedValueOnce({ ...sourceLocation, storageId: 'storage-A' })
        .mockResolvedValueOnce({ ...destLocation, storageId: 'storage-B' });

      await expect(
        service.createIntraWarehouseTransferAndPost(intraDto, actor),
      ).rejects.toThrow(/cùng một kho/);
    });

    it('cross-org rejection: location belongs to another org → throws NotFoundException', async () => {
      // Simulate locationRepo returning null for org-2 locations
      locationRepo.findOne
        .mockResolvedValueOnce(null) // source not found for org-2
        .mockResolvedValueOnce(destLocation);

      const orgBactor = { ...actor, organizationId: 'org-2' };

      await expect(
        service.createIntraWarehouseTransferAndPost(intraDto, orgBactor),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
