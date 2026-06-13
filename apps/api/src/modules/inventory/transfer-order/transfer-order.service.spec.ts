import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  GoodsIssuePurpose,
  GoodsIssueReferenceType,
  GoodsReceiptPurpose,
  GoodsReceiptReferenceType,
  TransferOrderStatus,
} from '@erp/shared-interfaces';
import { TransferOrderService } from './transfer-order.service';
import { TransferOrderEntity } from './transfer-order.entity';
import { LocationEntity } from '../location/location.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { GoodsIssueEntity } from '../goods-issue/goods-issue.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { GoodsIssueService } from '../goods-issue/goods-issue.service';
import { GoodsReceiptService } from '../goods-receipt/goods-receipt.service';

describe('TransferOrderService', () => {
  let service: TransferOrderService;
  let toRepo: Record<string, jest.Mock>;
  let locationRepo: Record<string, jest.Mock>;
  let balanceRepo: Record<string, jest.Mock>;
  let balanceQb: Record<string, jest.Mock>;
  let giRepo: Record<string, jest.Mock>;
  let branchRepo: Record<string, jest.Mock>;
  let goodsIssueService: Record<string, jest.Mock>;
  let goodsReceiptService: Record<string, jest.Mock>;

  const actorSource = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-A',
    roles: [],
    permissions: [],
  };
  const actorDest = { ...actorSource, branchId: 'branch-B' };

  const baseOrder = (overrides: Partial<TransferOrderEntity> = {}) =>
    ({
      id: 'to-1',
      organizationId: 'org-1',
      documentNumber: 'LDC000001',
      status: TransferOrderStatus.DRAFT,
      sourceBranchId: 'branch-A',
      destinationBranchId: 'branch-B',
      sourceStorageId: 'storage-A',
      destinationStorageId: 'storage-B',
      attachmentIds: [],
      lines: [
        {
          itemId: 'item-1',
          requestedQty: '5',
          item: { unit: 'pcs', purchasePrice: 12 },
        },
      ],
      ...overrides,
    }) as unknown as TransferOrderEntity;

  beforeEach(async () => {
    toRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      softDelete: jest.fn().mockResolvedValue(undefined),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      find: jest.fn().mockResolvedValue([]),
    };
    locationRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'loc-unassigned' }),
      find: jest.fn().mockResolvedValue([]),
    };
    // Chainable query builder for the stock-balance source-bin resolver.
    balanceQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    balanceRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(balanceQb),
    };
    giRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    branchRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    goodsIssueService = {
      createAndPost: jest.fn().mockResolvedValue({ id: 'gi-1' }),
      cancel: jest.fn().mockResolvedValue({ id: 'gi-1' }),
    };
    goodsReceiptService = {
      createAndPost: jest.fn().mockResolvedValue({ id: 'gr-1' }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TransferOrderService,
        { provide: getRepositoryToken(TransferOrderEntity), useValue: toRepo },
        { provide: getRepositoryToken(LocationEntity), useValue: locationRepo },
        {
          provide: getRepositoryToken(StockBalanceEntity),
          useValue: balanceRepo,
        },
        { provide: getRepositoryToken(GoodsIssueEntity), useValue: giRepo },
        { provide: getRepositoryToken(BranchEntity), useValue: branchRepo },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation((cb) =>
              cb({
                delete: jest.fn().mockResolvedValue(undefined),
                save: jest.fn().mockResolvedValue(undefined),
              }),
            ),
          },
        },
        {
          provide: DocumentNumberingService,
          useValue: { generate: jest.fn().mockResolvedValue('LDC000001') },
        },
        { provide: GoodsIssueService, useValue: goodsIssueService },
        { provide: GoodsReceiptService, useValue: goodsReceiptService },
      ],
    }).compile();

    service = moduleRef.get(TransferOrderService);
  });

  describe('create', () => {
    it('generates an LDC number and persists a DRAFT', async () => {
      toRepo.save.mockResolvedValueOnce({ id: 'to-1' });
      toRepo.findOne.mockResolvedValue(baseOrder());
      await service.create(
        {
          sourceBranchId: 'branch-A',
          destinationBranchId: 'branch-B',
          lines: [{ itemId: 'item-1', requestedQty: 5 }],
        },
        actorSource,
      );
      const saved = toRepo.save.mock.calls[0][0];
      expect(saved.status).toBe(TransferOrderStatus.DRAFT);
      expect(saved.documentNumber).toBe('LDC000001');
    });

    it('rejects empty lines', async () => {
      await expect(
        service.create(
          { sourceBranchId: 'a', destinationBranchId: 'b', lines: [] },
          actorSource,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('forces the source branch to the active branch and rejects the active branch as destination', async () => {
      await expect(
        service.create(
          {
            sourceBranchId: 'branch-other',
            destinationBranchId: actorSource.branchId,
            lines: [{ itemId: 'item-1', requestedQty: 5 }],
          },
          actorSource,
        ),
      ).rejects.toThrow('Cửa hàng đích phải khác cửa hàng hiện tại');

      expect(toRepo.save).not.toHaveBeenCalled();
    });

    it('creates and exports a transfer order from a direct transfer-out request', async () => {
      locationRepo.findOne
        .mockResolvedValueOnce({ id: 'loc-A', storageId: 'storage-A' })
        .mockResolvedValue({ id: 'loc-unassigned', storageId: 'storage-A' });
      toRepo.save.mockResolvedValueOnce({ id: 'to-1' });
      toRepo.findOne
        .mockResolvedValueOnce(baseOrder())
        .mockResolvedValueOnce(baseOrder())
        .mockResolvedValueOnce(
          baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
        );

      const result = await service.createAndConfirmExport(
        {
          locationId: 'loc-A',
          targetBranchId: 'branch-B',
          notes: 'Điều chuyển trực tiếp',
          occurredAt: '2026-06-13T01:00:00.000Z',
          lines: [
            {
              itemId: 'item-1',
              locationId: 'loc-A',
              quantity: 5,
              unitPrice: 12,
            },
          ],
        },
        actorSource,
      );

      expect(toRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceBranchId: actorSource.branchId,
          destinationBranchId: 'branch-B',
          sourceStorageId: 'storage-A',
          status: TransferOrderStatus.DRAFT,
        }),
      );
      expect(goodsIssueService.createAndPost).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: GoodsIssuePurpose.TRANSFER_OUT,
          targetBranchId: 'branch-B',
          referenceType: GoodsIssueReferenceType.TRANSFER_ORDER,
          referenceId: 'to-1',
        }),
        actorSource,
      );
      expect(result.status).toBe(TransferOrderStatus.IN_PROGRESS);
    });

    it('keeps the draft transfer order visible when direct export fails', async () => {
      locationRepo.findOne.mockResolvedValue({
        id: 'loc-A',
        storageId: 'storage-A',
      });
      toRepo.save.mockResolvedValueOnce({ id: 'to-1' });
      toRepo.findOne
        .mockResolvedValueOnce(baseOrder())
        .mockResolvedValueOnce(baseOrder());
      goodsIssueService.createAndPost.mockRejectedValueOnce(
        new Error('posting failed'),
      );

      await expect(
        service.createAndConfirmExport(
          {
            locationId: 'loc-A',
            targetBranchId: 'branch-B',
            lines: [{ itemId: 'item-1', quantity: 5 }],
          },
          actorSource,
        ),
      ).rejects.toThrow('posting failed');

      expect(toRepo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('confirmExport', () => {
    it('spawns a TRANSFER_OUT goods issue and moves to IN_PROGRESS', async () => {
      toRepo.findOne.mockResolvedValueOnce(baseOrder());
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );

      await service.confirmExport('to-1', actorSource);

      const giDto = goodsIssueService.createAndPost.mock.calls[0][0];
      expect(giDto.purpose).toBe(GoodsIssuePurpose.TRANSFER_OUT);
      expect(giDto.targetBranchId).toBe('branch-B');
      expect(giDto.lines[0].locationId).toBe('loc-unassigned');
      expect(toRepo.update).toHaveBeenCalledWith(
        { id: 'to-1', organizationId: 'org-1' },
        expect.objectContaining({
          status: TransferOrderStatus.IN_PROGRESS,
          exportGoodsIssueId: 'gi-1',
        }),
      );
    });

    it('rejects when not DRAFT', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );
      await expect(service.confirmExport('to-1', actorSource)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects when not on the source branch', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder());
      await expect(service.confirmExport('to-1', actorDest)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('stamps a TRANSFER_ORDER reference on the spawned goods issue', async () => {
      toRepo.findOne.mockResolvedValueOnce(baseOrder());
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );

      await service.confirmExport('to-1', actorSource);

      const giDto = goodsIssueService.createAndPost.mock.calls[0][0];
      expect(giDto.referenceType).toBe(GoodsIssueReferenceType.TRANSFER_ORDER);
      expect(giDto.referenceId).toBe('to-1');
    });

    it('uses the form-submitted (edited) lines when provided', async () => {
      toRepo.findOne.mockResolvedValueOnce(baseOrder());
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );

      await service.confirmExport('to-1', actorSource, {
        notes: 'edited',
        lines: [
          { itemId: 'item-1', locationId: 'loc-X', quantity: 3, unitPrice: 9 },
        ],
      });

      const giDto = goodsIssueService.createAndPost.mock.calls[0][0];
      expect(giDto.notes).toBe('edited');
      expect(giDto.lines).toHaveLength(1);
      expect(giDto.lines[0]).toMatchObject({
        itemId: 'item-1',
        locationId: 'loc-X',
        quantity: 3,
        unitPrice: 9,
      });
      // Edited path bypasses the per-line storage→location resolver.
      expect(locationRepo.findOne).not.toHaveBeenCalled();
    });

    it('forwards the goods-issue header fields (đối tượng / người giao / tham chiếu / ngày) onto the spawned issue', async () => {
      toRepo.findOne.mockResolvedValueOnce(baseOrder());
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );

      await service.confirmExport('to-1', actorSource, {
        notes: 'n',
        providerId: 'prov-1',
        deliverer: 'Jack Jack',
        references: ['LDC000004'],
        occurredAt: '2026-06-08T15:24:00.000Z',
        lines: [{ itemId: 'item-1', locationId: 'loc-X', quantity: 1, unitPrice: 9 }],
      });

      const giDto = goodsIssueService.createAndPost.mock.calls[0][0];
      expect(giDto.providerId).toBe('prov-1');
      expect(giDto.deliverer).toBe('Jack Jack');
      expect(giDto.references).toEqual(['LDC000004']);
      expect(giDto.occurredAt).toBe('2026-06-08T15:24:00.000Z');
    });

    it('rejects an edited line whose item is not on the transfer order', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder());
      await expect(
        service.confirmExport('to-1', actorSource, {
          lines: [{ itemId: 'item-99', locationId: 'loc-X', quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reverses the posted issue when updating the transfer order fails', async () => {
      toRepo.findOne.mockResolvedValueOnce(baseOrder());
      toRepo.update.mockRejectedValueOnce(new Error('update failed'));

      await expect(service.confirmExport('to-1', actorSource)).rejects.toThrow(
        'update failed',
      );

      expect(goodsIssueService.cancel).toHaveBeenCalledWith(
        'gi-1',
        actorSource,
      );
    });
  });

  describe('listIssuable', () => {
    it('returns DRAFT source-branch orders with the destination branch name inlined', async () => {
      toRepo.find.mockResolvedValue([baseOrder()]);
      branchRepo.find.mockResolvedValue([{ id: 'branch-B', name: 'Store B' }]);

      const rows = await service.listIssuable(
        { from: '2026-06-01', to: '2026-06-30' },
        actorSource,
      );

      expect(toRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            sourceBranchId: 'branch-A',
            status: TransferOrderStatus.DRAFT,
          }),
        }),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: 'to-1',
        documentNumber: 'LDC000001',
        destinationBranchId: 'branch-B',
        destinationBranchName: 'Store B',
        status: TransferOrderStatus.DRAFT,
      });
    });
  });

  describe('getById', () => {
    const orderWithBin = (sourceLocationId: string | null) =>
      baseOrder({
        lines: [
          {
            itemId: 'item-1',
            requestedQty: '1',
            sourceStorageId: 'storage-A',
            sourceLocationId,
            item: { unit: 'pcs', purchasePrice: 12 },
          },
        ],
      } as unknown as Partial<TransferOrderEntity>);

    it('resolves the display code for the persisted source bin', async () => {
      toRepo.findOne.mockResolvedValue(orderWithBin('loc-A01'));
      locationRepo.find.mockResolvedValue([{ id: 'loc-A01', code: 'A-01' }]);

      const to = await service.getById('to-1', actorSource);

      expect(to.lines[0].sourceLocationId).toBe('loc-A01');
      expect(to.lines[0].sourceLocationCode).toBe('A-01');
      // Persisted bin needs no stock lookup.
      expect(balanceRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('falls back to live stock resolution for legacy null bins', async () => {
      toRepo.findOne.mockResolvedValue(orderWithBin(null));
      balanceQb.getOne.mockResolvedValue({ locationId: 'loc-A01' });
      locationRepo.findOne.mockResolvedValue({ id: 'loc-A01', code: 'A-01' });

      const to = await service.getById('to-1', actorSource);

      expect(balanceRepo.createQueryBuilder).toHaveBeenCalled();
      expect(to.lines[0].sourceLocationId).toBe('loc-A01');
      expect(to.lines[0].sourceLocationCode).toBe('A-01');
    });

    it('hides an order from a branch that is neither source nor destination', async () => {
      toRepo.findOne.mockResolvedValue(orderWithBin('loc-A01'));

      await expect(
        service.getById('to-1', { ...actorSource, branchId: 'branch-C' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create — source bin', () => {
    it('persists each line bin from current stock', async () => {
      toRepo.save.mockResolvedValueOnce({ id: 'to-1' });
      toRepo.findOne.mockResolvedValue(baseOrder());
      balanceQb.getOne.mockResolvedValue({ locationId: 'loc-A01' });

      await service.create(
        {
          sourceBranchId: 'branch-A',
          destinationBranchId: 'branch-B',
          sourceStorageId: 'storage-A',
          lines: [{ itemId: 'item-1', requestedQty: 5 }],
        },
        actorSource,
      );

      const saved = toRepo.create.mock.calls[0][0];
      expect(saved.lines[0].sourceLocationId).toBe('loc-A01');
    });
  });

  describe('confirmImport', () => {
    it('spawns a TRANSFER_IN receipt, stores import_reference and COMPLETES', async () => {
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.COMPLETED }),
      );

      await service.confirmImport('to-1', actorDest, { destinationStorageId: 'storage-B' });

      const grDto = goodsReceiptService.createAndPost.mock.calls[0][0];
      expect(grDto.purpose).toBe(GoodsReceiptPurpose.TRANSFER_IN);
      expect(grDto.referenceType).toBe(GoodsReceiptReferenceType.STOCK_TRANSFER);
      expect(grDto.referenceId).toBe('to-1');
      expect(grDto.sourceBranchId).toBe('branch-A');
      expect(grDto.paymentMethod).toBeUndefined();
      expect(grDto.lines[0].uomCode).toBe('pcs');
      expect(toRepo.update).toHaveBeenCalledWith(
        { id: 'to-1', organizationId: 'org-1' },
        expect.objectContaining({
          status: TransferOrderStatus.COMPLETED,
          importGoodsReceiptId: 'gr-1',
          destinationStorageId: 'storage-B',
        }),
      );
    });

    it('rejects when not on the destination branch', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );
      await expect(service.confirmImport('to-1', actorSource)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('forwards the receipt header fields (đối tượng / người giao / tham chiếu / ngày) onto the spawned receipt', async () => {
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.COMPLETED }),
      );

      await service.confirmImport('to-1', actorDest, {
        destinationStorageId: 'storage-B',
        providerId: 'prov-1',
        deliverer: 'Jack Jack',
        references: ['XK000007'],
        occurredAt: '2026-06-08T15:24:00.000Z',
      });

      const grDto = goodsReceiptService.createAndPost.mock.calls[0][0];
      expect(grDto.providerId).toBe('prov-1');
      expect(grDto.deliveredBy).toBe('Jack Jack');
      expect(grDto.references).toEqual(['XK000007']);
      expect(grDto.receivedAt).toBe('2026-06-08T15:24:00.000Z');
    });

    it('uses the form-submitted per-line Kho/Vị trí when provided', async () => {
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.COMPLETED }),
      );
      locationRepo.findOne.mockResolvedValue({ id: 'loc-X', storageId: 'storage-Z' });

      await service.confirmImport('to-1', actorDest, {
        lines: [{ itemId: 'item-1', locationId: 'loc-X', quantity: 2, unitPrice: 5 }],
      });

      const grDto = goodsReceiptService.createAndPost.mock.calls[0][0];
      expect(grDto.lines).toHaveLength(1);
      expect(grDto.lines[0]).toMatchObject({
        itemId: 'item-1',
        locationId: 'loc-X',
        quantity: 2,
      });
      expect(grDto.locationId).toBe('loc-X');
      expect(toRepo.update).toHaveBeenCalledWith(
        { id: 'to-1', organizationId: 'org-1' },
        expect.objectContaining({ destinationStorageId: 'storage-Z' }),
      );
    });

    it('rejects an imported line whose item is not on the transfer order', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );
      await expect(
        service.confirmImport('to-1', actorDest, {
          lines: [{ itemId: 'item-99', locationId: 'loc-X', quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listImportable', () => {
    it('returns IN_PROGRESS destination-branch orders with source name + export XK number/total inlined', async () => {
      toRepo.find.mockResolvedValue([
        baseOrder({
          status: TransferOrderStatus.IN_PROGRESS,
          exportGoodsIssueId: 'gi-9',
        }),
      ]);
      branchRepo.find.mockResolvedValue([{ id: 'branch-A', name: 'Cà Mau' }]);
      giRepo.find.mockResolvedValue([
        {
          id: 'gi-9',
          documentNumber: 'XK000007',
          lines: [{ lineTotal: '350000' }, { lineTotal: '150000' }],
        },
      ]);

      const rows = await service.listImportable(
        { from: '2026-06-01', to: '2026-06-30' },
        actorDest,
      );

      expect(toRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            destinationBranchId: 'branch-B',
            status: TransferOrderStatus.IN_PROGRESS,
          }),
        }),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: 'to-1',
        sourceBranchId: 'branch-A',
        sourceBranchName: 'Cà Mau',
        exportGoodsIssueDocumentNumber: 'XK000007',
        totalAmount: 500000,
        status: TransferOrderStatus.IN_PROGRESS,
      });
    });
  });

  describe('update', () => {
    it('rejects line edits while IN_PROGRESS', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );
      await expect(
        service.update('to-1', { lines: [{ itemId: 'x', requestedQty: 1 }] }, actorSource),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows description edit while IN_PROGRESS', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );
      await service.update('to-1', { notes: 'updated' }, actorSource);
      expect(toRepo.save).toHaveBeenCalled();
    });

    it('rejects edits from the destination branch', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder());

      await expect(
        service.update('to-1', { notes: 'updated' }, actorDest),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('cancel', () => {
    it('reverses the export when IN_PROGRESS', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({
          status: TransferOrderStatus.IN_PROGRESS,
          exportGoodsIssueId: 'gi-1',
        }),
      );
      await service.cancel('to-1', actorSource);
      expect(goodsIssueService.cancel).toHaveBeenCalledWith('gi-1', actorSource);
      expect(toRepo.softDelete).toHaveBeenCalledWith('to-1');
    });

    it('rejects cancelling a COMPLETED order', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ status: TransferOrderStatus.COMPLETED }),
      );
      await expect(service.cancel('to-1', actorSource)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects cancelling from the destination branch', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder());

      await expect(service.cancel('to-1', actorDest)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
