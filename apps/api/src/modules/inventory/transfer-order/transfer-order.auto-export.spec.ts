import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TransferOrderStatus } from '@erp/shared-interfaces';
import { TransferOrderService } from './transfer-order.service';
import { TransferOrderEntity } from './transfer-order.entity';
import { LocationEntity } from '../location/location.entity';
import { StockBalanceEntity } from '../ledger/stock-balance.entity';
import { GoodsIssueEntity } from '../goods-issue/goods-issue.entity';
import { GoodsReceiptEntity } from '../goods-receipt/goods-receipt.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { StorageEntity } from '../location/storage.entity';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { GoodsIssueService } from '../goods-issue/goods-issue.service';
import { GoodsReceiptService } from '../goods-receipt/goods-receipt.service';

/**
 * Regression lock for vouchers the system raises on its own.
 *
 * A goods issue's line price used to be discarded and replaced by the branch
 * moving average, so a caller could put any number in `unitPrice` harmlessly.
 * Since ADR-01 that number *is* the cost that reaches the stock ledger, which
 * turns every such caller into a source of inventory cost overnight — silently,
 * because the voucher still saves and still looks right.
 *
 * `deriveExportLines` is one of those callers: it sends `items.purchase_price`.
 * ADR-04 decided to keep it that way rather than switch it to the moving
 * average. That is a **decision, not a fact of nature** — if it is revisited,
 * change ADR-04 first and this test with it. What must never happen is the
 * behaviour drifting without anyone noticing.
 */
describe('TransferOrderService — system-generated export leg (AC-11, ADR-04)', () => {
  let service: TransferOrderService;
  let toRepo: Record<string, jest.Mock>;
  let goodsIssueService: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-A',
    roles: [],
  };

  /** One order line: 5 units of an item whose catalog purchase price is 12. */
  const order = (overrides: Record<string, unknown> = {}) =>
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
          sourceLocationId: 'loc-A01',
          item: { unit: 'pcs', purchasePrice: 12 },
        },
      ],
      ...overrides,
    }) as unknown as TransferOrderEntity;

  beforeEach(async () => {
    toRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      findOne: jest.fn().mockResolvedValue(order()),
      update: jest.fn().mockResolvedValue(undefined),
      softDelete: jest.fn().mockResolvedValue(undefined),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    goodsIssueService = {
      createAndPost: jest
        .fn()
        .mockResolvedValue({ id: 'gi-1', documentNumber: 'XK000001' }),
      create: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
      getById: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TransferOrderService,
        { provide: getRepositoryToken(TransferOrderEntity), useValue: toRepo },
        {
          provide: getRepositoryToken(LocationEntity),
          useValue: { findOne: jest.fn().mockResolvedValue({ id: 'loc-A01' }) },
        },
        {
          provide: getRepositoryToken(StockBalanceEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(GoodsIssueEntity),
          useValue: { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(GoodsReceiptEntity),
          useValue: { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(BranchEntity),
          useValue: { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(StorageEntity),
          useValue: { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest
              .fn()
              .mockImplementation((cb) =>
                cb({
                  delete: jest.fn().mockResolvedValue(undefined),
                  save: jest.fn().mockResolvedValue(undefined),
                }),
              ),
            manager: { query: jest.fn().mockResolvedValue(undefined) },
          },
        },
        {
          provide: DocumentNumberingService,
          useValue: { generate: jest.fn().mockResolvedValue('LDC000001') },
        },
        { provide: GoodsIssueService, useValue: goodsIssueService },
        {
          provide: GoodsReceiptService,
          useValue: { createAndPost: jest.fn(), getById: jest.fn(), update: jest.fn() },
        },
      ],
    }).compile();

    service = moduleRef.get(TransferOrderService);
  });

  it('prices the derived export leg at items.purchase_price (ADR-04)', async () => {
    await service.confirmExport('to-1', actor);

    const [dto] = goodsIssueService.createAndPost.mock.calls[0];
    expect(dto.lines).toEqual([
      expect.objectContaining({ itemId: 'item-1', quantity: 5, unitPrice: 12 }),
    ]);
  });

  it('lets the export form override that price, line by line', async () => {
    // The form path is the one users drive, and ADR-01 says their number wins.
    await service.confirmExport('to-1', actor, {
      lines: [
        { itemId: 'item-1', locationId: 'loc-A01', quantity: 2, unitPrice: 350000 },
        { itemId: 'item-1', locationId: 'loc-A01', quantity: 3, unitPrice: 340000 },
      ],
    });

    const [dto] = goodsIssueService.createAndPost.mock.calls[0];
    expect(dto.lines).toEqual([
      expect.objectContaining({ quantity: 2, unitPrice: 350000 }),
      expect.objectContaining({ quantity: 3, unitPrice: 340000 }),
    ]);
  });
});
