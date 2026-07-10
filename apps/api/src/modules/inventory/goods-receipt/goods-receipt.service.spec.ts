import { GoodsReceiptPurpose, GoodsReceiptStatus } from '@erp/shared-interfaces';
import { GoodsReceiptService } from './goods-receipt.service';

describe('GoodsReceiptService', () => {
  const receiptRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    manager: { findOne: jest.fn() },
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
      {} as never,
      {} as never,
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
