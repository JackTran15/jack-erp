import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TransferStatus, StockMovementType, DocumentType } from '@erp/shared-interfaces';
import { StockTransferService, CreateTransferDto } from './stock-transfer.service';
import { StockTransferEntity } from './stock-transfer.entity';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';

describe('StockTransferService', () => {
  let service: StockTransferService;
  let transferRepo: Record<string, jest.Mock>;
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
        { provide: DataSource, useValue: dataSource },
        { provide: StockLedgerService, useValue: ledgerService },
        { provide: DocumentNumberingService, useValue: docNumbering },
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
          }),
          expect.objectContaining({
            movementType: StockMovementType.TRANSFER_IN,
            quantity: 5,
            locationId: 'loc-dst',
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
});
