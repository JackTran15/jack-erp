import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { StockMovementType, DocumentType } from '@erp/shared-interfaces';
import { StockAdjustmentService, CreateAdjustmentDto } from './stock-adjustment.service';
import { StockAdjustmentEntity, AdjustmentStatus } from './stock-adjustment.entity';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { ItemCostSnapshotService } from '../location/item-cost-snapshot.service';

describe('StockAdjustmentService', () => {
  let service: StockAdjustmentService;
  let adjustmentRepo: Record<string, jest.Mock>;
  let itemCostSnapshotService: Record<string, jest.Mock>;
  let ledgerService: Record<string, jest.Mock>;
  let docNumbering: Record<string, jest.Mock>;
  let configService: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const validDto: CreateAdjustmentDto = {
    locationId: 'loc-1',
    branchId: 'branch-1',
    reasonCode: 'DAMAGED',
    lines: [{ itemId: 'item-1', quantity: -3 }],
  };

  beforeEach(async () => {
    adjustmentRepo = {
      create: jest.fn().mockImplementation((data) => ({
        id: 'adj-1',
        ...data,
        lines: data.lines ?? [],
      })),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      findOne: jest.fn(),
    };

    itemCostSnapshotService = {
      snapshotCosts: jest
        .fn()
        .mockResolvedValue(new Map<string, number>([['item-1', 4]])),
    };

    ledgerService = {
      recordBatchMovements: jest.fn().mockResolvedValue([]),
    };

    docNumbering = {
      generate: jest.fn().mockResolvedValue('ADJ-2026-0001'),
    };

    configService = {
      get: jest.fn().mockReturnValue(100),
    };

    const mockManager = {
      update: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockAdjustmentService,
        { provide: getRepositoryToken(StockAdjustmentEntity), useValue: adjustmentRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: StockLedgerService, useValue: ledgerService },
        { provide: DocumentNumberingService, useValue: docNumbering },
        { provide: ConfigService, useValue: configService },
        { provide: ItemCostSnapshotService, useValue: itemCostSnapshotService },
      ],
    }).compile();

    service = module.get(StockAdjustmentService);
  });

  describe('create', () => {
    it('should require a reason code', async () => {
      const dto = { ...validDto, reasonCode: '' };

      await expect(service.create(dto, actor)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto, actor)).rejects.toThrow(
        'Reason code is required',
      );
    });

    it('should create a DRAFT adjustment with valid input', async () => {
      const result = await service.create(validDto, actor);

      expect(result.status).toBe(AdjustmentStatus.DRAFT);
      expect(result.reasonCode).toBe('DAMAGED');
      expect(adjustmentRepo.save).toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('should auto-post when below approval threshold', async () => {
      const adjustment = {
        id: 'adj-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        locationId: 'loc-1',
        status: AdjustmentStatus.DRAFT,
        reasonCode: 'DAMAGED',
        lines: [{ itemId: 'item-1', quantity: -3 }],
      };
      adjustmentRepo.findOne.mockResolvedValue(adjustment);

      await service.submit('adj-1', actor);

      expect(ledgerService.recordBatchMovements).toHaveBeenCalled();
      expect(docNumbering.generate).toHaveBeenCalledWith(
        DocumentType.ADJUSTMENT,
        'branch-1',
        actor,
      );
    });

    it('should go to PENDING_APPROVAL when above threshold', async () => {
      const adjustment = {
        id: 'adj-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        locationId: 'loc-1',
        status: AdjustmentStatus.DRAFT,
        reasonCode: 'DAMAGED',
        lines: [{ itemId: 'item-1', quantity: -150 }],
      };
      adjustmentRepo.findOne.mockResolvedValue(adjustment);

      const result = await service.submit('adj-1', actor);

      expect(result.status).toBe(AdjustmentStatus.PENDING_APPROVAL);
      expect(ledgerService.recordBatchMovements).not.toHaveBeenCalled();
      expect(adjustmentRepo.save).toHaveBeenCalled();
    });
  });

  describe('post', () => {
    it('should create ADJUSTMENT_INCREASE ledger entry for positive quantity', async () => {
      const adjustment = {
        id: 'adj-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        locationId: 'loc-1',
        status: AdjustmentStatus.DRAFT,
        reasonCode: 'COUNT',
        lines: [{ itemId: 'item-1', quantity: 10 }],
      };
      adjustmentRepo.findOne.mockResolvedValue(adjustment);

      await service.post('adj-1', actor);

      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            movementType: StockMovementType.ADJUSTMENT_INCREASE,
            quantity: 10,
            // unit_cost snapshot from items.purchase_price (4.00)
            unitCost: 4,
          }),
        ]),
      );
    });

    it('should create ADJUSTMENT_DECREASE ledger entry for negative quantity', async () => {
      const adjustment = {
        id: 'adj-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        locationId: 'loc-1',
        status: AdjustmentStatus.DRAFT,
        reasonCode: 'DAMAGED',
        lines: [{ itemId: 'item-1', quantity: -5 }],
      };
      adjustmentRepo.findOne.mockResolvedValue(adjustment);

      await service.post('adj-1', actor);

      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            movementType: StockMovementType.ADJUSTMENT_DECREASE,
            quantity: -5,
          }),
        ]),
      );
    });
  });
});
