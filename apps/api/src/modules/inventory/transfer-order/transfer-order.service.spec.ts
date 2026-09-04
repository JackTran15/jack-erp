import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import {
  DocCounterpartyKind,
  GoodsIssuePurpose,
  GoodsIssueReferenceType,
  GoodsReceiptPurpose,
  GoodsReceiptReferenceType,
  TransferOrderStatus,
} from '@erp/shared-interfaces';
import { TransferOrderService } from './transfer-order.service';
import { TransferOrderEntity } from './transfer-order.entity';
import { TransferOrderLineEntity } from './transfer-order-line.entity';
import { LocationEntity } from '../location/location.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { GoodsIssueEntity } from '../goods-issue/goods-issue.entity';
import { StorageEntity } from '../location/storage.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { GoodsReceiptEntity } from '../goods-receipt/goods-receipt.entity';
import { GoodsIssueService } from '../goods-issue/goods-issue.service';
import { GoodsReceiptService } from '../goods-receipt/goods-receipt.service';

describe('TransferOrderService', () => {
  let service: TransferOrderService;
  let toRepo: Record<string, any>;
  let locationRepo: Record<string, jest.Mock>;
  let balanceRepo: Record<string, jest.Mock>;
  let balanceQb: Record<string, jest.Mock>;
  let giRepo: Record<string, jest.Mock>;
  let grRepo: Record<string, jest.Mock>;
  let branchRepo: Record<string, jest.Mock>;
  let storageRepo: Record<string, jest.Mock>;
  let goodsIssueService: Record<string, jest.Mock>;
  let goodsReceiptService: Record<string, jest.Mock>;
  let dataSourceManagerQuery: jest.Mock;
  let dataSourceManagerInsert: jest.Mock;

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
      manager: { findAndCount: jest.fn().mockResolvedValue([[], 0]) },
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
      findOne: jest.fn().mockResolvedValue(null),
    };
    grRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    branchRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    storageRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    goodsIssueService = {
      createAndPost: jest.fn().mockResolvedValue({ id: 'gi-1' }),
      cancel: jest.fn().mockResolvedValue({ id: 'gi-1' }),
      getById: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      buildPrintPayload: jest.fn().mockResolvedValue({ title: 'Phiếu xuất kho' }),
    };
    goodsReceiptService = {
      createAndPost: jest.fn().mockResolvedValue({ id: 'gr-1' }),
      cancel: jest.fn().mockResolvedValue(undefined),
      getById: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      buildPrintPayload: jest.fn().mockResolvedValue({ title: 'Phiếu nhập kho' }),
    };
    // Default: the UPDATE matches an existing transfer_order_lines row. The
    // shape is `[rows, rowCount]`, which is what TypeORM actually returns for
    // UPDATE/DELETE — NOT a bare row array. Mocking it as `[{...}]` (or `[]` for
    // the no-match case) is how the 2026-08-24 fix shipped with a green test
    // over a dead code path for ten days: the mock encoded a misreading of the
    // driver and then vouched for it. The shape is measured, not assumed — see
    // `test/e2e/typeorm-returning-shape.e2e-spec.ts`. Tests exercising the
    // "no matching row" path override this per-call with `[[], 0]`.
    dataSourceManagerQuery = jest
      .fn()
      .mockResolvedValue([[{ id: 'line-1' }], 1]);
    dataSourceManagerInsert = jest.fn().mockResolvedValue(undefined);

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
        { provide: getRepositoryToken(GoodsReceiptEntity), useValue: grRepo },
        { provide: getRepositoryToken(BranchEntity), useValue: branchRepo },
        { provide: getRepositoryToken(StorageEntity), useValue: storageRepo },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation((cb) =>
              cb({
                delete: jest.fn().mockResolvedValue(undefined),
                save: jest.fn().mockResolvedValue(undefined),
              }),
            ),
            manager: {
              query: dataSourceManagerQuery,
              insert: dataSourceManagerInsert,
            },
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
        counterpartyKind: DocCounterpartyKind.CUSTOMER,
        counterpartyId: 'cust-1',
        deliverer: 'Jack Jack',
        references: ['LDC000004'],
        occurredAt: '2026-06-08T15:24:00.000Z',
        lines: [{ itemId: 'item-1', locationId: 'loc-X', quantity: 1, unitPrice: 9 }],
      });

      const giDto = goodsIssueService.createAndPost.mock.calls[0][0];
      expect(giDto.providerId).toBeUndefined();
      expect(giDto.counterpartyKind).toBe(DocCounterpartyKind.CUSTOMER);
      expect(giDto.counterpartyId).toBe('cust-1');
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
      locationRepo.find.mockResolvedValue([
        {
          id: 'loc-unassigned',
          isActive: true,
          storageId: 'storage-B',
          storage: { branchId: 'branch-B' },
        },
      ]);

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

      locationRepo.find.mockResolvedValue([
        {
          id: 'loc-unassigned',
          isActive: true,
          storageId: 'storage-B',
          storage: { branchId: 'branch-B' },
        },
      ]);

      await service.confirmImport('to-1', actorDest, {
        destinationStorageId: 'storage-B',
        counterpartyKind: DocCounterpartyKind.SUPPLIER,
        counterpartyId: 'prov-1',
        deliverer: 'Jack Jack',
        references: ['XK000007'],
        occurredAt: '2026-06-08T15:24:00.000Z',
      });

      const grDto = goodsReceiptService.createAndPost.mock.calls[0][0];
      // Đối tượng is routed through the validated counterparty path, not a raw
      // providerId (which would bypass validation and can violate the FK).
      expect(grDto.counterpartyKind).toBe(DocCounterpartyKind.SUPPLIER);
      expect(grDto.counterpartyId).toBe('prov-1');
      expect(grDto.deliveredBy).toBe('Jack Jack');
      expect(grDto.references).toEqual(['XK000007']);
      expect(grDto.receivedAt).toBe('2026-06-08T15:24:00.000Z');
    });

    it('forwards Diễn giải onto the spawned receipt', async () => {
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.COMPLETED }),
      );
      locationRepo.find.mockResolvedValue([
        {
          id: 'loc-unassigned',
          isActive: true,
          storageId: 'storage-B',
          storage: { branchId: 'branch-B' },
        },
      ]);

      await service.confirmImport('to-1', actorDest, {
        destinationStorageId: 'storage-B',
        description: 'Nhập kho hàng hóa điều chuyển từ cửa hàng A',
      });

      expect(goodsReceiptService.createAndPost.mock.calls[0][0].description).toBe(
        'Nhập kho hàng hóa điều chuyển từ cửa hàng A',
      );
    });

    it('falls back to the order notes when Diễn giải is omitted', async () => {
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({
          status: TransferOrderStatus.IN_PROGRESS,
          notes: 'Điều chuyển bù hàng tồn',
        }),
      );
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.COMPLETED }),
      );
      locationRepo.find.mockResolvedValue([
        {
          id: 'loc-unassigned',
          isActive: true,
          storageId: 'storage-B',
          storage: { branchId: 'branch-B' },
        },
      ]);

      await service.confirmImport('to-1', actorDest, {
        destinationStorageId: 'storage-B',
      });

      expect(goodsReceiptService.createAndPost.mock.calls[0][0].description).toBe(
        'Điều chuyển bù hàng tồn',
      );
    });

    it('inherits đối tượng and người giao from the linked export issue', async () => {
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({
          status: TransferOrderStatus.IN_PROGRESS,
          exportGoodsIssueId: 'gi-1',
        }),
      );
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.COMPLETED }),
      );
      giRepo.findOne.mockResolvedValueOnce({
        id: 'gi-1',
        counterpartyKind: DocCounterpartyKind.EMPLOYEE,
        counterpartyId: 'emp-1',
        deliverer: 'Nguyễn Văn A',
      });
      locationRepo.find.mockResolvedValue([
        {
          id: 'loc-unassigned',
          isActive: true,
          storageId: 'storage-B',
          storage: { branchId: 'branch-B' },
        },
      ]);

      await service.confirmImport('to-1', actorDest, {
        destinationStorageId: 'storage-B',
      });

      const grDto = goodsReceiptService.createAndPost.mock.calls[0][0];
      expect(grDto.counterpartyKind).toBe(DocCounterpartyKind.EMPLOYEE);
      expect(grDto.counterpartyId).toBe('emp-1');
      expect(grDto.deliveredBy).toBe('Nguyễn Văn A');
    });

    it('uses the form-submitted per-line Kho/Vị trí when provided', async () => {
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );
      toRepo.findOne.mockResolvedValueOnce(
        baseOrder({ status: TransferOrderStatus.COMPLETED }),
      );
      locationRepo.findOne.mockResolvedValue({ id: 'loc-X', storageId: 'storage-Z' });
      locationRepo.find.mockResolvedValue([
        {
          id: 'loc-X',
          isActive: true,
          storageId: 'storage-Z',
          storage: { branchId: 'branch-B' },
        },
      ]);

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
            status: In([
              TransferOrderStatus.IN_PROGRESS,
              TransferOrderStatus.COMPLETED,
            ]),
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

  describe('listImportable — grid rows mirror the export issue (AC-09)', () => {
    /** DD780 issued twice from one order line, at two prices. */
    const twoPriceIssue = {
      id: 'gi-9',
      documentNumber: 'XK000176',
      lines: [
        {
          id: 'gil-1',
          itemId: 'item-1',
          quantity: 30,
          unitPrice: '350000.00',
          lineTotal: '10500000.00',
          item: { code: 'DD780', name: 'Dây thắt lưng DD780', unit: 'Đôi' },
          location: { code: 'A01.01', name: 'A01.01', storage: { name: 'KHO SG' } },
        },
        {
          id: 'gil-2',
          itemId: 'item-1',
          quantity: 60,
          unitPrice: '340000.00',
          lineTotal: '20400000.00',
          item: { code: 'DD780', name: 'Dây thắt lưng DD780', unit: 'Đôi' },
          location: { code: 'A01.01', name: 'A01.01', storage: { name: 'KHO SG' } },
        },
      ],
    };

    beforeEach(() => {
      branchRepo.find.mockResolvedValue([{ id: 'branch-A', name: 'Cà Mau' }]);
    });

    it('returns one row per issue line, keeping both prices (AC-09)', async () => {
      toRepo.find.mockResolvedValue([
        baseOrder({
          status: TransferOrderStatus.IN_PROGRESS,
          exportGoodsIssueId: 'gi-9',
        }),
      ]);
      giRepo.find.mockResolvedValue([twoPriceIssue]);

      const rows = await service.listImportable({}, actorDest);

      // The order carries ONE line for item-1; the issue carries two. Matching
      // them back by itemId (the old behaviour) could only surface the first.
      expect(rows[0].lines).toEqual([
        expect.objectContaining({ id: 'gil-1', quantity: 30, unitPrice: 350000, lineTotal: 10500000 }),
        expect.objectContaining({ id: 'gil-2', quantity: 60, unitPrice: 340000, lineTotal: 20400000 }),
      ]);
      expect(rows[0].totalAmount).toBe(30900000);
    });

    it('keys rows on the issue line id, so two rows from one order line stay distinct', async () => {
      toRepo.find.mockResolvedValue([
        baseOrder({
          status: TransferOrderStatus.IN_PROGRESS,
          exportGoodsIssueId: 'gi-9',
        }),
      ]);
      giRepo.find.mockResolvedValue([twoPriceIssue]);

      const rows = await service.listImportable({}, actorDest);

      // TransferInPage keys its detail grid on `id`; duplicates would collide.
      const ids = rows[0].lines.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('falls back to the order lines when nothing has been issued yet', async () => {
      toRepo.find.mockResolvedValue([
        baseOrder({
          status: TransferOrderStatus.IN_PROGRESS,
          exportGoodsIssueId: undefined,
        } as Partial<TransferOrderEntity>),
      ]);
      giRepo.find.mockResolvedValue([]);

      const rows = await service.listImportable({}, actorDest);

      // One line, requestedQty 5 at the catalog price 12 — unchanged behaviour.
      expect(rows[0].lines).toEqual([
        expect.objectContaining({ itemId: 'item-1', quantity: 5, unitPrice: 12, lineTotal: 60 }),
      ]);
    });
  });

  describe('applyLegRevision — deltas across duplicate SKU lines (AC-10)', () => {
    const importReceipt = (lines: unknown[]) => ({ id: 'gr-1', lines });
    const receiptLine = (quantity: string, unitPrice: string) => ({
      itemId: 'item-1',
      locationId: 'loc-B01',
      uomCode: 'pcs',
      quantity,
      unitPrice,
    });

    const savedLines = () =>
      goodsReceiptService.update.mock.calls[0][1].lines as {
        quantity: number;
        unitPrice: number;
      }[];

    it('pours a decrease through the lines instead of applying it to each (AC-10)', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder({ importGoodsReceiptId: 'gr-1' }));
      goodsReceiptService.getById.mockResolvedValue(
        importReceipt([receiptLine('30', '350000'), receiptLine('60', '340000')]),
      );

      await service.applyLegRevision(
        'to-1',
        [{ itemId: 'item-1', quantityDelta: -10 }],
        actorSource,
        'export',
      );

      // Total drops by exactly 10, not 20. The first line absorbs it; prices stay put.
      const lines = savedLines();
      expect(lines.reduce((sum, l) => sum + l.quantity, 0)).toBe(80);
      expect(lines).toEqual([
        expect.objectContaining({ quantity: 20, unitPrice: 350000 }),
        expect.objectContaining({ quantity: 60, unitPrice: 340000 }),
      ]);
    });

    it('overflows onto the next line and drops the emptied one', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder({ importGoodsReceiptId: 'gr-1' }));
      goodsReceiptService.getById.mockResolvedValue(
        importReceipt([receiptLine('30', '350000'), receiptLine('60', '340000')]),
      );

      await service.applyLegRevision(
        'to-1',
        [{ itemId: 'item-1', quantityDelta: -40 }],
        actorSource,
        'export',
      );

      // First line empties (and is filtered out), the remaining 10 hits the second.
      expect(savedLines()).toEqual([
        expect.objectContaining({ quantity: 50, unitPrice: 340000 }),
      ]);
    });

    it('lands an increase whole on the first line of the item', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder({ importGoodsReceiptId: 'gr-1' }));
      goodsReceiptService.getById.mockResolvedValue(
        importReceipt([receiptLine('30', '350000'), receiptLine('60', '340000')]),
      );

      await service.applyLegRevision(
        'to-1',
        [{ itemId: 'item-1', quantityDelta: 5 }],
        actorSource,
        'export',
      );

      expect(savedLines()).toEqual([
        expect.objectContaining({ quantity: 35, unitPrice: 350000 }),
        expect.objectContaining({ quantity: 60, unitPrice: 340000 }),
      ]);
    });

    it('refuses a decrease the counterpart voucher cannot cover', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder({ importGoodsReceiptId: 'gr-1' }));
      goodsReceiptService.getById.mockResolvedValue(
        importReceipt([receiptLine('30', '350000'), receiptLine('60', '340000')]),
      );

      await expect(
        service.applyLegRevision(
          'to-1',
          [{ itemId: 'item-1', quantityDelta: -100 }],
          actorSource,
          'export',
        ),
      ).rejects.toThrow('does not carry that much');
      expect(goodsReceiptService.update).not.toHaveBeenCalled();
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
      expect(goodsIssueService.cancel).toHaveBeenCalledWith('gi-1', actorSource, {
        cascadeTransferOrder: false,
      });
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

  describe('cancelFromExportIssue', () => {
    it('rejects deleting an export issue after the destination receipt exists', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({
          status: TransferOrderStatus.COMPLETED,
          importGoodsReceiptId: 'gr-1',
        }),
      );

      await expect(
        service.cancelFromExportIssue('to-1', actorSource),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(goodsReceiptService.cancel).not.toHaveBeenCalled();
      expect(toRepo.softDelete).not.toHaveBeenCalled();
    });

    it('soft-deletes an IN_PROGRESS order without reversing a receipt', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ status: TransferOrderStatus.IN_PROGRESS }),
      );

      await service.cancelFromExportIssue('to-1', actorSource);

      expect(goodsReceiptService.cancel).not.toHaveBeenCalled();
      expect(toRepo.softDelete).toHaveBeenCalledWith('to-1');
    });

    it('is a no-op for an already-cancelled order (idempotent guard)', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ status: TransferOrderStatus.CANCELLED }),
      );

      await service.cancelFromExportIssue('to-1', actorSource);

      expect(goodsReceiptService.cancel).not.toHaveBeenCalled();
      expect(toRepo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('applyLegRevision (T-05-01)', () => {
    it('updates requested_qty when the destination has not imported yet (AC-16)', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ importGoodsReceiptId: null }),
      );

      await service.applyLegRevision(
        'to-1',
        [{ itemId: 'item-1', quantityDelta: -4 }],
        actorSource,
        'export',
      );

      expect(dataSourceManagerQuery).toHaveBeenCalledWith(
        expect.stringContaining('requested_qty'),
        [-4, 'to-1', 'item-1'],
      );
      expect(goodsReceiptService.update).not.toHaveBeenCalled();
      expect(dataSourceManagerInsert).not.toHaveBeenCalled();
    });

    it('inserts a new transfer_order_lines row when the export issue picked up an item the order never carried', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ importGoodsReceiptId: null }),
      );
      // No existing transfer_order_lines row for item-2 — the UPDATE matches
      // nothing, which the driver reports as `[[], 0]`, NOT as `[]`. The
      // distinction is the entire bug: `[[], 0].length` is 2.
      dataSourceManagerQuery.mockResolvedValueOnce([[], 0]);

      await service.applyLegRevision(
        'to-1',
        [{ itemId: 'item-2', quantityDelta: 6 }],
        actorSource,
        'export',
      );

      expect(dataSourceManagerQuery).toHaveBeenCalledWith(
        expect.stringContaining('requested_qty'),
        [6, 'to-1', 'item-2'],
      );
      expect(dataSourceManagerInsert).toHaveBeenCalledWith(
        TransferOrderLineEntity,
        expect.objectContaining({
          organizationId: 'org-1',
          transferOrderId: 'to-1',
          itemId: 'item-2',
          requestedQty: '6',
          sourceStorageId: 'storage-A',
          createdBy: 'user-1',
        }),
      );
    });

    it('skips (and logs) a decrease for an item the order never carried, without inserting', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ importGoodsReceiptId: null }),
      );
      dataSourceManagerQuery.mockResolvedValueOnce([[], 0]);

      await service.applyLegRevision(
        'to-1',
        [{ itemId: 'item-2', quantityDelta: -3 }],
        actorSource,
        'export',
      );

      expect(dataSourceManagerInsert).not.toHaveBeenCalled();
    });

    it('applies the delta to the import receipt at the destination branch (AC-17)', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ importGoodsReceiptId: 'gr-1' }),
      );
      goodsReceiptService.getById.mockResolvedValue({
        id: 'gr-1',
        lines: [
          { itemId: 'item-1', locationId: 'loc-B01', uomCode: 'pcs', quantity: '10', unitPrice: '50' },
        ],
      });

      await service.applyLegRevision(
        'to-1',
        [{ itemId: 'item-1', quantityDelta: -4 }],
        actorSource, // called from the source branch (export was edited)
        'export',
      );

      // The receipt's own branch (destination), not the caller's, drives the lookup.
      expect(goodsReceiptService.getById).toHaveBeenCalledWith(
        'gr-1',
        expect.objectContaining({ branchId: 'branch-B' }),
      );
      expect(goodsReceiptService.update).toHaveBeenCalledWith(
        'gr-1',
        {
          lines: [
            expect.objectContaining({ itemId: 'item-1', quantity: 6 }),
          ],
        },
        expect.objectContaining({ branchId: 'branch-B' }),
        // Suppresses the ping-pong back into applyLegRevision (T-05-02).
        { cascadeTransferOrder: false },
      );
    });

    it('applies the delta back to the export issue when the import leg was edited (T-05-03 direction)', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ exportGoodsIssueId: 'gi-1', importGoodsReceiptId: 'gr-1' }),
      );
      goodsIssueService.getById.mockResolvedValue({
        id: 'gi-1',
        lines: [
          { itemId: 'item-1', locationId: 'loc-A01', quantity: '10', unitPrice: '50' },
        ],
      });

      await service.applyLegRevision(
        'to-1',
        [{ itemId: 'item-1', quantityDelta: 3 }],
        actorDest,
        'import',
      );

      expect(goodsIssueService.getById).toHaveBeenCalledWith(
        'gi-1',
        expect.objectContaining({ branchId: 'branch-A' }),
      );
      expect(goodsIssueService.update).toHaveBeenCalledWith(
        'gi-1',
        { lines: [expect.objectContaining({ itemId: 'item-1', quantity: 13 })] },
        expect.objectContaining({ branchId: 'branch-A' }),
        { cascadeTransferOrder: false },
      );
    });

    it('rejects when the order has already been cancelled', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ status: TransferOrderStatus.CANCELLED }),
      );

      await expect(
        service.applyLegRevision(
          'to-1',
          [{ itemId: 'item-1', quantityDelta: -1 }],
          actorSource,
          'export',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(goodsReceiptService.update).not.toHaveBeenCalled();
    });

    it('rejects an import-side edit when the order has not been exported yet', async () => {
      toRepo.findOne.mockResolvedValue(
        baseOrder({ exportGoodsIssueId: undefined }),
      );

      await expect(
        service.applyLegRevision(
          'to-1',
          [{ itemId: 'item-1', quantityDelta: -1 }],
          actorDest,
          'import',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('is a no-op when the delta list is empty', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder());

      await service.applyLegRevision('to-1', [], actorSource, 'export');

      expect(toRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('two-branch synchronization through a full lifecycle (T-05-03)', () => {
    // Each branch's on-hand stock is modelled as a plain map of itemId ->
    // quantity. What's exported but not yet received sits in neither map —
    // it's "in transit", tracked as issueLines - receiptLines — so the real
    // invariant under test is stockA + stockB + inTransit staying constant,
    // the same identity a physical shipment satisfies at every point along
    // its journey. GoodsIssueService/GoodsReceiptService are mocked, but their
    // `getById`/`update` mocks read and write this shared model exactly the
    // way the real services' own ledger writes would — this isolates
    // applyLegRevision's orchestration (does it move the counterpart leg by
    // the right amount, in both directions) from ledger-writing mechanics
    // already covered by each service's own spec.
    let stockA: Record<string, number>;
    let stockB: Record<string, number>;
    let issueLines: { itemId: string; locationId: string; quantity: number; unitPrice: number }[];
    let receiptLines: { itemId: string; locationId: string; quantity: number; unitPrice: number }[];

    beforeEach(() => {
      // Starting point: A held 20 before the transfer, exported 10 of it —
      // 10 remain at A, 10 are in transit, nothing yet received at B.
      stockA = { 'item-1': 10 };
      stockB = { 'item-1': 0 };
      issueLines = [{ itemId: 'item-1', locationId: 'loc-A01', quantity: 10, unitPrice: 100 }];
      receiptLines = [];

      goodsIssueService.getById.mockImplementation(() =>
        Promise.resolve({ id: 'gi-1', lines: [...issueLines] }),
      );
      goodsReceiptService.getById.mockImplementation(() =>
        Promise.resolve({ id: 'gr-1', lines: [...receiptLines] }),
      );
    });

    function inTransit(itemId: string): number {
      const issued = issueLines.find((l) => l.itemId === itemId)?.quantity ?? 0;
      const received = receiptLines.find((l) => l.itemId === itemId)?.quantity ?? 0;
      return issued - received;
    }

    function total(itemId: string): number {
      return (stockA[itemId] ?? 0) + (stockB[itemId] ?? 0) + inTransit(itemId);
    }

    /** Simulates the export leg's own ledger write, the part applyLegRevision never does itself. */
    function applyOwnExportDelta(quantityDelta: number) {
      stockA['item-1'] += -quantityDelta; // issuing more drains A; issuing less returns stock to A
      issueLines = issueLines.map((l) => ({ ...l, quantity: l.quantity + quantityDelta }));
    }

    /** Simulates the import leg's own ledger write. */
    function applyOwnImportDelta(quantityDelta: number) {
      stockB['item-1'] = (stockB['item-1'] ?? 0) + quantityDelta;
      receiptLines = receiptLines.map((l) => ({ ...l, quantity: l.quantity + quantityDelta }));
    }

    it('holds stockA + stockB + inTransit constant through export-edit, import, import-edit and the reverse direction', async () => {
      const startTotal = total('item-1');
      expect(startTotal).toBe(20);

      // 1. Destination has not imported yet: sửa xuất giảm 10 -> 6. Only
      //    requested_qty moves (AC-16) — nothing is posted at B to adjust.
      applyOwnExportDelta(-4);
      toRepo.findOne.mockResolvedValue(
        baseOrder({ exportGoodsIssueId: 'gi-1', importGoodsReceiptId: null }),
      );
      await service.applyLegRevision(
        'to-1',
        [{ itemId: 'item-1', quantityDelta: -4 }],
        actorSource,
        'export',
      );
      expect(goodsReceiptService.update).not.toHaveBeenCalled();
      expect(total('item-1')).toBe(startTotal);

      // 2. Destination now imports 6 (matches the edited export) — modelled
      //    directly, the way confirmImport would.
      receiptLines = [{ itemId: 'item-1', locationId: 'loc-B01', quantity: 6, unitPrice: 100 }];
      stockB['item-1'] = 6;
      expect(total('item-1')).toBe(startTotal);

      // 3. Destination has imported: sửa xuất further, 6 -> 4 (AC-17). Now the
      //    import leg's stock must move too, by the same delta.
      applyOwnExportDelta(-2);
      toRepo.findOne.mockResolvedValue(
        baseOrder({ exportGoodsIssueId: 'gi-1', importGoodsReceiptId: 'gr-1' }),
      );
      await service.applyLegRevision(
        'to-1',
        [{ itemId: 'item-1', quantityDelta: -2 }],
        actorSource,
        'export',
      );
      expect(goodsReceiptService.update).toHaveBeenCalledWith(
        'gr-1',
        { lines: [expect.objectContaining({ quantity: 4 })] },
        expect.objectContaining({ branchId: 'branch-B' }),
        { cascadeTransferOrder: false },
      );
      // The mock only asserts the call shape; apply its effect to the shared
      // model the same way the real GoodsReceiptService.update() would.
      receiptLines = [{ itemId: 'item-1', locationId: 'loc-B01', quantity: 4, unitPrice: 100 }];
      stockB['item-1'] = 4;
      expect(total('item-1')).toBe(startTotal);

      // 4. The reverse direction: destination edits its receipt up, 4 -> 5 —
      //    the export leg must absorb the same +1 (T-05-03's "chiều ngược lại").
      applyOwnImportDelta(1);
      await service.applyLegRevision(
        'to-1',
        [{ itemId: 'item-1', quantityDelta: 1 }],
        actorDest,
        'import',
      );
      expect(goodsIssueService.update).toHaveBeenCalledWith(
        'gi-1',
        { lines: [expect.objectContaining({ quantity: 5 })] },
        expect.objectContaining({ branchId: 'branch-A' }),
        { cascadeTransferOrder: false },
      );
      issueLines = [{ itemId: 'item-1', locationId: 'loc-A01', quantity: 5, unitPrice: 100 }];
      stockA['item-1'] -= 1;
      expect(total('item-1')).toBe(startTotal);
    });
  });

  describe('list (T-03-01)', () => {
    it('bypasses eager lines/item via loadEagerRelations: false, without changing where/skip/take/order', async () => {
      toRepo.findAndCount.mockResolvedValue([[{ id: 'to-1', documentNumber: 'LDC000001' }], 1]);

      const result = await service.list({
        organizationId: 'org-1',
        page: 2,
        pageSize: 10,
      });

      expect(toRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1' },
          skip: 10,
          take: 10,
          order: { createdAt: 'DESC' },
          loadEagerRelations: false,
        }),
      );
      expect(result.data[0]).not.toHaveProperty('lines');
      expect(result.total).toBe(1);
    });
  });

  describe('getLines (T-03-02)', () => {
    it('returns a paginated page of lines with hasMore=true when more remain', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder());
      const items = [{ id: 'line-1' }, { id: 'line-2' }];
      toRepo.manager.findAndCount.mockResolvedValue([items, 5]);

      const result = await service.getLines('to-1', actorSource, 1, 2);

      expect(toRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'to-1', organizationId: 'org-1' },
        loadEagerRelations: false,
      });
      expect(toRepo.manager.findAndCount).toHaveBeenCalledWith(TransferOrderLineEntity, {
        where: { transferOrderId: 'to-1', organizationId: 'org-1' },
        order: { createdAt: 'ASC' },
        skip: 0,
        take: 2,
      });
      expect(result).toEqual({ items, page: 1, pageSize: 2, hasMore: true, total: 5 });
    });

    it('reports hasMore=false on the last page', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder());
      toRepo.manager.findAndCount.mockResolvedValue([[{ id: 'line-5' }], 5]);

      const result = await service.getLines('to-1', actorSource, 3, 2);

      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(5);
    });

    it('returns an empty page for an order with zero lines, not an error', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder());
      toRepo.manager.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getLines('to-1', actorSource, 1, 20);

      expect(result).toEqual({ items: [], page: 1, pageSize: 20, hasMore: false, total: 0 });
    });

    it('404s for a nonexistent id, without touching the line query', async () => {
      toRepo.findOne.mockResolvedValue(null);

      await expect(service.getLines('missing', actorSource, 1, 20)).rejects.toThrow();
      expect(toRepo.manager.findAndCount).not.toHaveBeenCalled();
    });

    it('404s (not-found, not forbidden) when the actor participates in neither branch', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder());
      const outsider = { ...actorSource, branchId: 'branch-C' };

      await expect(service.getLines('to-1', outsider, 1, 20)).rejects.toThrow(NotFoundException);
      expect(toRepo.manager.findAndCount).not.toHaveBeenCalled();
    });
  });

  describe('getExportGoodsIssuePrintPayload', () => {
    const orderWithExport = () =>
      baseOrder({
        status: TransferOrderStatus.IN_PROGRESS,
        exportGoodsIssueId: 'gi-1',
      } as Partial<TransferOrderEntity>);

    it('resolves the source branch XK for the destination branch (org-scoped)', async () => {
      toRepo.findOne.mockResolvedValue(orderWithExport());
      const issue = { id: 'gi-1', branchId: 'branch-A' };
      giRepo.findOne.mockResolvedValue(issue);

      const payload = await service.getExportGoodsIssuePrintPayload('to-1', actorDest);

      // No branchId in the where clause: the XK belongs to branch-A, the actor is branch-B.
      expect(giRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'gi-1', organizationId: 'org-1' },
      });
      expect(goodsIssueService.buildPrintPayload).toHaveBeenCalledWith(issue, 'org-1');
      expect(payload).toEqual({ title: 'Phiếu xuất kho' });
    });

    it('404s when the actor participates in neither branch', async () => {
      toRepo.findOne.mockResolvedValue(orderWithExport());
      const outsider = { ...actorSource, branchId: 'branch-C' };

      await expect(
        service.getExportGoodsIssuePrintPayload('to-1', outsider),
      ).rejects.toThrow(NotFoundException);
      expect(giRepo.findOne).not.toHaveBeenCalled();
      expect(goodsIssueService.buildPrintPayload).not.toHaveBeenCalled();
    });

    it('404s when the transfer has no export issue yet', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder());

      await expect(
        service.getExportGoodsIssuePrintPayload('to-1', actorDest),
      ).rejects.toThrow(NotFoundException);
      expect(goodsIssueService.buildPrintPayload).not.toHaveBeenCalled();
    });
  });

  describe('getImportGoodsReceiptPrintPayload', () => {
    const orderWithImport = () =>
      baseOrder({
        status: TransferOrderStatus.COMPLETED,
        importGoodsReceiptId: 'gr-1',
      } as Partial<TransferOrderEntity>);

    it('resolves the destination branch NK for the source branch (org-scoped)', async () => {
      toRepo.findOne.mockResolvedValue(orderWithImport());
      const receipt = { id: 'gr-1', branchId: 'branch-B' };
      grRepo.findOne.mockResolvedValue(receipt);

      const payload = await service.getImportGoodsReceiptPrintPayload('to-1', actorSource);

      // No branchId in the where clause: the NK belongs to branch-B, the actor is branch-A.
      expect(grRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'gr-1', organizationId: 'org-1' },
      });
      expect(goodsReceiptService.buildPrintPayload).toHaveBeenCalledWith(receipt, 'org-1');
      expect(payload).toEqual({ title: 'Phiếu nhập kho' });
    });

    it('404s when the actor participates in neither branch', async () => {
      toRepo.findOne.mockResolvedValue(orderWithImport());
      const outsider = { ...actorSource, branchId: 'branch-C' };

      await expect(
        service.getImportGoodsReceiptPrintPayload('to-1', outsider),
      ).rejects.toThrow(NotFoundException);
      expect(grRepo.findOne).not.toHaveBeenCalled();
    });

    it('404s while the destination has not confirmed import yet', async () => {
      toRepo.findOne.mockResolvedValue(baseOrder());

      await expect(
        service.getImportGoodsReceipt('to-1', actorSource),
      ).rejects.toThrow(NotFoundException);
      expect(goodsReceiptService.buildPrintPayload).not.toHaveBeenCalled();
    });
  });
});
