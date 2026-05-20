import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StockTakeStatus } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { GoodsIssueEntity } from '../goods-issue/goods-issue.entity';
import { GoodsReceiptEntity } from '../goods-receipt/goods-receipt.entity';
import { LocationEntity } from '../location/location.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { StockTakeEntity } from './stock-take.entity';
import { StockTakeLineEntity } from './stock-take-line.entity';
import { StockTakeService } from './stock-take.service';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

describe('StockTakeService', () => {
  let service: StockTakeService;
  let stRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    softDelete: jest.Mock;
  };
  let lineRepo: {
    save: jest.Mock;
    delete: jest.Mock;
    findOne: jest.Mock;
  };
  let balanceRepo: {
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let locationRepo: { findOne: jest.Mock };
  let receiptRepo: object;
  let issueRepo: object;
  let documentNumbering: { generate: jest.Mock };
  let stockLedger: { recordBatchMovements: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  const buildQb = (rows: unknown[]) => {
    const qb: Record<string, jest.Mock> = {
      innerJoin: jest.fn(),
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      getMany: jest.fn().mockResolvedValue(rows),
      getOne: jest.fn().mockResolvedValue(rows[0] ?? null),
    };
    for (const k of Object.keys(qb)) {
      if (!['getMany', 'getOne'].includes(k)) qb[k].mockReturnValue(qb);
    }
    return qb;
  };

  beforeEach(async () => {
    stRepo = {
      create: jest.fn((dto) => ({ id: 'st-new', lines: [], ...dto })),
      save: jest.fn((e) => Promise.resolve({ id: 'st-new', ...e })),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      softDelete: jest.fn(),
    };
    lineRepo = {
      save: jest.fn((e) => Promise.resolve({ id: 'line-new', ...e })),
      delete: jest.fn(),
      findOne: jest.fn((args) =>
        Promise.resolve({ id: args?.where?.id ?? 'line-new' }),
      ),
    };
    balanceRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    locationRepo = { findOne: jest.fn() };
    receiptRepo = {};
    issueRepo = {};
    documentNumbering = { generate: jest.fn().mockResolvedValue('KK000001') };
    stockLedger = { recordBatchMovements: jest.fn() };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockTakeService,
        { provide: getRepositoryToken(StockTakeEntity), useValue: stRepo },
        { provide: getRepositoryToken(StockTakeLineEntity), useValue: lineRepo },
        { provide: getRepositoryToken(StockBalanceEntity), useValue: balanceRepo },
        { provide: getRepositoryToken(LocationEntity), useValue: locationRepo },
        { provide: getRepositoryToken(GoodsReceiptEntity), useValue: receiptRepo },
        { provide: getRepositoryToken(GoodsIssueEntity), useValue: issueRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: StockLedgerService, useValue: stockLedger },
        { provide: DocumentNumberingService, useValue: documentNumbering },
      ],
    }).compile();

    service = module.get(StockTakeService);
  });

  describe('create', () => {
    it('rejects when neither storageId nor locationId is given', async () => {
      await expect(service.create({}, actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('creates empty stock-take (no auto-snapshot) when no lines are passed', async () => {
      stRepo.findOne.mockResolvedValue({
        id: 'st-new',
        organizationId: actor.organizationId,
        status: StockTakeStatus.DRAFT,
        lines: [],
        documentNumber: 'KK000001',
      } as unknown as StockTakeEntity);

      const result = await service.create({ storageId: 'storage-1' }, actor);

      expect(documentNumbering.generate).toHaveBeenCalledWith(
        'STOCK_TAKE',
        'branch-1',
        actor,
      );
      // CRITICAL: no balance query — auto-snapshot is gone. Form dialog is the
      // only path that brings rows in, via the bundled `lines` payload.
      expect(balanceRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(stRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          documentNumber: 'KK000001',
          status: StockTakeStatus.DRAFT,
          storageId: 'storage-1',
          lines: [],
        }),
      );
      expect(result.documentNumber).toBe('KK000001');
    });

    it('resolves expected_qty for each bundled line via stock_balances lookup', async () => {
      // Service resolves location/qty per line via the same query-builder helper
      // as addLine — return a positive balance for item-1, none for item-2.
      let call = 0;
      balanceRepo.createQueryBuilder.mockImplementation(() => {
        call += 1;
        return call === 1
          ? buildQb([{ itemId: 'item-1', locationId: 'loc-A', quantity: 7 }])
          : buildQb([]);
      });
      // item-2 has no balance → fallback location lookup.
      locationRepo.findOne.mockResolvedValue({ id: 'loc-fallback' });
      stRepo.findOne.mockResolvedValue({
        id: 'st-new',
        organizationId: actor.organizationId,
        status: StockTakeStatus.DRAFT,
        lines: [],
        documentNumber: 'KK000001',
      } as unknown as StockTakeEntity);

      await service.create(
        {
          storageId: 'storage-1',
          lines: [
            { itemId: 'item-1', countedQty: 5, reason: 'thừa 2' },
            { itemId: 'item-2' },
          ],
        },
        actor,
      );

      expect(stRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({
              itemId: 'item-1',
              locationId: 'loc-A',
              expectedQty: '7',
              countedQty: '5',
              reason: 'thừa 2',
            }),
            expect.objectContaining({
              itemId: 'item-2',
              locationId: 'loc-fallback',
              expectedQty: '0',
              countedQty: null,
            }),
          ]),
        }),
      );
    });
  });

  describe('addLine', () => {
    const draftSt = {
      id: 'st-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
      status: StockTakeStatus.DRAFT,
      storageId: 'storage-1',
      locationId: undefined,
      lines: [],
    } as unknown as StockTakeEntity;

    it('seeds expectedQty from stock_balance when an item is found in scope', async () => {
      stRepo.findOne.mockResolvedValue(draftSt);
      balanceRepo.createQueryBuilder.mockReturnValue(
        buildQb([{ itemId: 'item-1', locationId: 'loc-A', quantity: 7 }]),
      );

      await service.addLine('st-1', { itemId: 'item-1' }, actor);

      expect(lineRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          locationId: 'loc-A',
          expectedQty: '7',
          countedQty: null,
          stockTakeId: 'st-1',
        }),
      );
    });

    it('falls back to first location in storage when item has no balance', async () => {
      stRepo.findOne.mockResolvedValue(draftSt);
      balanceRepo.createQueryBuilder.mockReturnValue(buildQb([]));
      locationRepo.findOne.mockResolvedValue({ id: 'loc-X' });

      await service.addLine('st-1', { itemId: 'item-99' }, actor);

      expect(lineRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-99',
          locationId: 'loc-X',
          expectedQty: '0',
        }),
      );
    });

    it('rejects when stock-take is not DRAFT', async () => {
      stRepo.findOne.mockResolvedValue({
        ...draftSt,
        status: StockTakeStatus.POSTED,
      });
      await expect(
        service.addLine('st-1', { itemId: 'item-1' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('process', () => {
    it('rejects when stock-take has no lines', async () => {
      stRepo.findOne.mockResolvedValue({
        id: 'st-1',
        organizationId: 'org-1',
        status: StockTakeStatus.DRAFT,
        lines: [],
      } as unknown as StockTakeEntity);
      await expect(service.process('st-1', actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('records balanced positive & negative variances and marks POSTED', async () => {
      const lines = [
        {
          id: 'l-1',
          itemId: 'item-1',
          locationId: 'loc-1',
          expectedQty: '10',
          countedQty: '12',
        },
        {
          id: 'l-2',
          itemId: 'item-2',
          locationId: 'loc-1',
          expectedQty: '5',
          countedQty: '5',
        },
        {
          id: 'l-3',
          itemId: 'item-3',
          locationId: 'loc-1',
          expectedQty: '8',
          countedQty: '3',
        },
      ] as unknown as StockTakeLineEntity[];

      const stRow = {
        id: 'st-1',
        organizationId: 'org-1',
        branchId: 'branch-1',
        status: StockTakeStatus.DRAFT,
        documentNumber: 'KK000001',
        lines,
      } as unknown as StockTakeEntity;
      stRepo.findOne.mockResolvedValue(stRow);

      // Mock the transaction manager so process() runs the inner callback.
      const managerSave = jest.fn((e) => Promise.resolve({ id: 'fake-id', ...e }));
      const managerCreate = jest.fn((_entity, dto) => ({ id: 'fake-id', ...dto }));
      const managerUpdate = jest.fn();
      const fakeManager = {
        save: managerSave,
        create: managerCreate,
        update: managerUpdate,
      };
      dataSource.transaction.mockImplementation(
        async (cb: (m: typeof fakeManager) => unknown) => cb(fakeManager),
      );

      await service.process('st-1', actor);

      // Ledger should see exactly the 2 non-zero variances.
      const movementsArg = stockLedger.recordBatchMovements.mock.calls[0][0];
      expect(movementsArg).toHaveLength(2);
      const variances = movementsArg.map((m: { quantity: number }) => m.quantity);
      expect(variances).toEqual(expect.arrayContaining([2, -5]));

      // Status must flip to POSTED via manager.update (not a separate save call).
      expect(managerUpdate).toHaveBeenCalledWith(
        StockTakeEntity,
        'st-1',
        expect.objectContaining({ status: StockTakeStatus.POSTED }),
      );
    });
  });

  describe('list with date range', () => {
    it('applies Between filter when fromDate + toDate provided', async () => {
      stRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.list({
        organizationId: 'org-1',
        page: 1,
        pageSize: 20,
        fromDate: '2026-05-01',
        toDate: '2026-05-31',
      });
      const whereArg = stRepo.findAndCount.mock.calls[0][0].where;
      expect(whereArg.createdAt).toBeDefined();
    });
  });

  describe('getById', () => {
    it('throws NotFoundException when missing', async () => {
      stRepo.findOne.mockResolvedValue(null);
      await expect(service.getById('missing', 'org-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('enforces organizationId in lookup (cross-org isolation)', async () => {
      stRepo.findOne.mockResolvedValue(null);
      await expect(service.getById('st-1', 'org-foreign')).rejects.toThrow();
      expect(stRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'st-1', organizationId: 'org-foreign' },
      });
    });
  });
});
