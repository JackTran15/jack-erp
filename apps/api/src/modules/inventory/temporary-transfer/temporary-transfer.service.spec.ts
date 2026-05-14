import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  StockMovementType,
  TemporaryTransferStatus,
} from '@erp/shared-interfaces';
import { TemporaryTransferService } from './temporary-transfer.service';
import { TemporaryTransferEntity } from './temporary-transfer.entity';
import { TemporaryTransferLineEntity } from './temporary-transfer-line.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { InventoryLocationService } from '../location/inventory-location.service';

describe('TemporaryTransferService', () => {
  let service: TemporaryTransferService;
  let transferRepo: Record<string, jest.Mock>;
  let lineRepo: Record<string, jest.Mock>;
  let balanceRepo: Record<string, jest.Mock>;
  let ledgerService: Record<string, jest.Mock>;
  let documentNumbering: Record<string, jest.Mock>;
  let locationService: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;
  let mockManager: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
  };

  const tempLocation = {
    id: 'temp-loc',
    branchId: 'branch-1',
    organizationId: 'org-1',
  };

  beforeEach(async () => {
    transferRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    lineRepo = {
      createQueryBuilder: jest.fn(),
    };
    balanceRepo = {
      findOne: jest.fn().mockResolvedValue({ quantity: 100 }),
    };
    ledgerService = {
      recordBatchMovements: jest.fn().mockResolvedValue([]),
    };
    documentNumbering = {
      generate: jest.fn().mockResolvedValue('TMP-2026-0001'),
    };
    locationService = {
      getOrCreateMainTemporaryLocation: jest.fn().mockResolvedValue(tempLocation),
    };

    mockManager = {
      create: jest.fn().mockImplementation((_entity: unknown, data: unknown) => data),
      save: jest.fn().mockImplementation((_entity: unknown, data: any) =>
        Promise.resolve({ ...data, id: 'transfer-1' }),
      ),
      update: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemporaryTransferService,
        { provide: getRepositoryToken(TemporaryTransferEntity), useValue: transferRepo },
        { provide: getRepositoryToken(TemporaryTransferLineEntity), useValue: lineRepo },
        { provide: getRepositoryToken(StockBalanceEntity), useValue: balanceRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: StockLedgerService, useValue: ledgerService },
        { provide: DocumentNumberingService, useValue: documentNumbering },
        { provide: InventoryLocationService, useValue: locationService },
      ],
    }).compile();

    service = module.get(TemporaryTransferService);
  });

  describe('create', () => {
    const validDto = {
      carrierUserId: 'user-carrier',
      lines: [
        { itemId: 'item-1', sourceLocationId: 'loc-src', quantity: 2 },
      ],
    };

    it('rejects empty line list', async () => {
      await expect(service.create({ ...validDto, lines: [] }, actor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when source location equals temp location', async () => {
      await expect(
        service.create(
          {
            ...validDto,
            lines: [{ itemId: 'item-1', sourceLocationId: tempLocation.id, quantity: 1 }],
          },
          actor,
        ),
      ).rejects.toThrow(/không được trùng/);
    });

    it('rejects when source balance is insufficient', async () => {
      balanceRepo.findOne.mockResolvedValueOnce({ quantity: 1 });
      await expect(
        service.create(
          { ...validDto, lines: [{ itemId: 'item-1', sourceLocationId: 'loc-src', quantity: 5 }] },
          actor,
        ),
      ).rejects.toThrow(/không đủ/);
    });

    it('creates posted transfer and writes paired TRANSFER_OUT/TRANSFER_IN ledger entries', async () => {
      transferRepo.findOne.mockResolvedValue({
        id: 'transfer-1',
        organizationId: 'org-1',
        lines: [],
      });

      await service.create(validDto, actor);

      expect(documentNumbering.generate).toHaveBeenCalled();
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            movementType: StockMovementType.TRANSFER_OUT,
            locationId: 'loc-src',
            quantity: -2,
          }),
          expect.objectContaining({
            movementType: StockMovementType.TRANSFER_IN,
            locationId: tempLocation.id,
            quantity: 2,
          }),
        ]),
      );
    });
  });

  describe('returnLines', () => {
    const transfer = {
      id: 'transfer-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
      destinationTempLocationId: tempLocation.id,
      documentNumber: 'TMP-2026-0001',
      status: TemporaryTransferStatus.OPEN,
      lines: [
        {
          id: 'line-1',
          itemId: 'item-1',
          sourceLocationId: 'loc-src',
          quantity: 3,
          returnedQuantity: 0,
        },
      ],
    };

    beforeEach(() => {
      transferRepo.findOne.mockImplementation(() => Promise.resolve({ ...transfer, lines: transfer.lines.map((l) => ({ ...l })) }));
    });

    it('rejects when return quantity exceeds remaining', async () => {
      await expect(
        service.returnLines(
          'transfer-1',
          { lines: [{ lineId: 'line-1', returnQuantity: 4 }] },
          actor,
        ),
      ).rejects.toThrow(/Số lượng trả/);
    });

    it('moves to PARTIALLY_RETURNED when only part of one line is returned', async () => {
      await service.returnLines(
        'transfer-1',
        { lines: [{ lineId: 'line-1', returnQuantity: 1 }] },
        actor,
      );
      expect(mockManager.update).toHaveBeenCalledWith(
        TemporaryTransferEntity,
        { id: 'transfer-1' },
        expect.objectContaining({ status: TemporaryTransferStatus.PARTIALLY_RETURNED }),
      );
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            movementType: StockMovementType.TRANSFER_OUT,
            locationId: tempLocation.id,
            quantity: -1,
          }),
          expect.objectContaining({
            movementType: StockMovementType.TRANSFER_IN,
            locationId: 'loc-src',
            quantity: 1,
          }),
        ]),
      );
    });

    it('moves to FULLY_RETURNED when remaining is fully returned', async () => {
      await service.returnLines(
        'transfer-1',
        { lines: [{ lineId: 'line-1', returnQuantity: 3 }] },
        actor,
      );
      expect(mockManager.update).toHaveBeenCalledWith(
        TemporaryTransferEntity,
        { id: 'transfer-1' },
        expect.objectContaining({ status: TemporaryTransferStatus.FULLY_RETURNED }),
      );
    });

    it('rejects when transfer is already fully returned', async () => {
      transferRepo.findOne.mockResolvedValue({
        ...transfer,
        status: TemporaryTransferStatus.FULLY_RETURNED,
      });
      await expect(
        service.returnLines(
          'transfer-1',
          { lines: [{ lineId: 'line-1', returnQuantity: 1 }] },
          actor,
        ),
      ).rejects.toThrow(/đã/);
    });
  });

  describe('cancel', () => {
    it('cancels and reverses ledger entries when no lines have been returned', async () => {
      transferRepo.findOne.mockResolvedValue({
        id: 'transfer-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        destinationTempLocationId: tempLocation.id,
        documentNumber: 'TMP-2026-0001',
        status: TemporaryTransferStatus.OPEN,
        lines: [
          { id: 'l1', itemId: 'item-1', sourceLocationId: 'loc-src', quantity: 2, returnedQuantity: 0 },
        ],
      });

      await service.cancel('transfer-1', actor);

      expect(mockManager.update).toHaveBeenCalledWith(
        TemporaryTransferEntity,
        { id: 'transfer-1' },
        { status: TemporaryTransferStatus.CANCELLED },
      );
      expect(ledgerService.recordBatchMovements).toHaveBeenCalled();
    });

    it('rejects cancel when any line has been partially returned', async () => {
      transferRepo.findOne.mockResolvedValue({
        id: 'transfer-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        destinationTempLocationId: tempLocation.id,
        status: TemporaryTransferStatus.OPEN,
        lines: [
          { id: 'l1', itemId: 'item-1', sourceLocationId: 'loc-src', quantity: 2, returnedQuantity: 1 },
        ],
      });

      await expect(service.cancel('transfer-1', actor)).rejects.toThrow(/Không thể hủy/);
    });

    it('rejects cancel for non-OPEN status', async () => {
      transferRepo.findOne.mockResolvedValue({
        id: 'transfer-1',
        organizationId: 'org-1',
        status: TemporaryTransferStatus.PARTIALLY_RETURNED,
        lines: [],
      });

      await expect(service.cancel('transfer-1', actor)).rejects.toThrow(/trạng thái OPEN/);
    });
  });
});
