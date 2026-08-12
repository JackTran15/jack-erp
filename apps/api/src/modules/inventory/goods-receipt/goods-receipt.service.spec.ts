import {
  GoodsReceiptPurpose,
  GoodsReceiptReferenceType,
  GoodsReceiptStatus,
  TransferOrderStatus,
} from '@erp/shared-interfaces';
import { GoodsReceiptService } from './goods-receipt.service';
import { GoodsReceiptEntity } from './goods-receipt.entity';
import { TransferOrderEntity } from '../transfer-order/transfer-order.entity';

describe('GoodsReceiptService', () => {
  const receiptRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
    manager: { findOne: jest.fn(), update: jest.fn() },
  };
  // Manager handed to the `dataSource.transaction(...)` callback in `cancel()`
  // — row-lock query + status flip both happen through this, inside the tx.
  const txManager = {
    query: jest.fn().mockResolvedValue([{ status: GoodsReceiptStatus.POSTED }]),
    update: jest.fn(),
    softDelete: jest.fn(),
    delete: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn((cb: (manager: unknown) => Promise<unknown>) => cb(txManager)),
  };
  const stockLedger = {
    recordBatchMovements: jest.fn().mockResolvedValue([]),
    publishMovementEvents: jest.fn().mockResolvedValue(undefined),
  };
  const documentNumberingService = {
    generate: jest.fn(),
  };
  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-A',
    roles: [],
    permissions: [],
  };

  let service: GoodsReceiptService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GoodsReceiptService(
      receiptRepo as never,
      {} as never,
      dataSource as never,
      stockLedger as never,
      documentNumberingService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('rejects a transfer from the active branch', async () => {
    await expect(
      service.create(
        {
          purpose: GoodsReceiptPurpose.TRANSFER_IN,
          sourceBranchId: actor.branchId,
          receivedAt: '2026-06-10T00:00:00.000Z',
          locationId: 'loc-A01',
          lines: [
            {
              itemId: 'item-1',
              locationId: 'loc-A01',
              uomCode: 'pcs',
              quantity: 1,
              unitPrice: 100,
            },
          ],
        },
        actor,
      ),
    ).rejects.toThrow('Cửa hàng nguồn phải khác cửa hàng hiện tại');

    expect(documentNumberingService.generate).not.toHaveBeenCalled();
    expect(receiptRepo.save).not.toHaveBeenCalled();
  });

  it('rejects updating a draft transfer source to the active branch', async () => {
    receiptRepo.findOne.mockResolvedValue({
      id: 'receipt-1',
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      status: GoodsReceiptStatus.DRAFT,
      purpose: GoodsReceiptPurpose.TRANSFER_IN,
      sourceBranchId: 'branch-B',
      lines: [
        {
          itemId: 'item-1',
          locationId: 'loc-A01',
          uomCode: 'pcs',
          quantity: 1,
          unitPrice: 100,
        },
      ],
    });

    await expect(
      service.update(
        'receipt-1',
        { sourceBranchId: actor.branchId },
        actor,
      ),
    ).rejects.toThrow('Cửa hàng nguồn phải khác cửa hàng hiện tại');

    expect(receiptRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a purchasing employee not in the organization', async () => {
    receiptRepo.manager.findOne.mockResolvedValue(null);

    await expect(
      service.create(
        {
          purpose: GoodsReceiptPurpose.OTHER,
          purchasingEmployeeId: 'nv-x',
          receivedAt: '2026-06-10T00:00:00.000Z',
          locationId: 'loc-A01',
          lines: [
            {
              itemId: 'item-1',
              locationId: 'loc-A01',
              uomCode: 'pcs',
              quantity: 1,
              unitPrice: 100,
            },
          ],
        },
        actor,
      ),
    ).rejects.toThrow('Purchasing employee not found in organization');

    expect(documentNumberingService.generate).not.toHaveBeenCalled();
    expect(receiptRepo.save).not.toHaveBeenCalled();
  });

  it('reopens the transfer order when its import leg is deleted', async () => {
    receiptRepo.findOne.mockResolvedValue({
      id: 'receipt-1',
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      status: GoodsReceiptStatus.POSTED,
      purpose: GoodsReceiptPurpose.TRANSFER_IN,
      referenceType: GoodsReceiptReferenceType.STOCK_TRANSFER,
      referenceId: 'to-1',
      documentNumber: 'PN0001',
      lines: [
        {
          itemId: 'item-1',
          locationId: 'loc-A01',
          quantity: 3,
          unitPrice: 100,
        },
      ],
    });

    await service.cancel('receipt-1', actor);

    // Row is locked (FOR UPDATE) and its status re-checked inside the
    // transaction, so a concurrent duplicate cancel can't post a second
    // reversal batch.
    expect(txManager.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      ['receipt-1', actor.organizationId],
    );
    // Stock reversed, status flipped + soft-deleted inside the same
    // transaction, then the order is unlinked so the source phiếu xuất is
    // no longer referenced and becomes deletable.
    expect(stockLedger.recordBatchMovements).toHaveBeenCalled();
    expect(txManager.update).toHaveBeenCalledWith(
      GoodsReceiptEntity,
      'receipt-1',
      { status: GoodsReceiptStatus.CANCELLED },
    );
    expect(txManager.softDelete).toHaveBeenCalledWith(
      GoodsReceiptEntity,
      'receipt-1',
    );
    expect(receiptRepo.manager.update).toHaveBeenCalledWith(
      TransferOrderEntity,
      {
        id: 'to-1',
        organizationId: actor.organizationId,
        importGoodsReceiptId: 'receipt-1',
      },
      {
        status: TransferOrderStatus.IN_PROGRESS,
        importGoodsReceiptId: null,
        completedAt: null,
        completedBy: null,
      },
    );
  });

  it('does not touch transfer orders when a plain receipt is deleted', async () => {
    receiptRepo.findOne.mockResolvedValue({
      id: 'receipt-2',
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      status: GoodsReceiptStatus.DRAFT,
      purpose: GoodsReceiptPurpose.OTHER,
      lines: [],
    });

    await service.cancel('receipt-2', actor);

    expect(stockLedger.recordBatchMovements).not.toHaveBeenCalled();
    expect(txManager.softDelete).toHaveBeenCalledWith(
      GoodsReceiptEntity,
      'receipt-2',
    );
    expect(receiptRepo.manager.update).not.toHaveBeenCalled();
  });

  it('scopes detail lookup to the active branch', async () => {
    receiptRepo.findOne.mockResolvedValue(null);

    await expect(service.getById('receipt-1', actor)).rejects.toThrow();

    expect(receiptRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: 'receipt-1',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
      },
    });
  });
});
