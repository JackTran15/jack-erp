import {
  GoodsReceiptPurpose,
  GoodsReceiptReferenceType,
  GoodsReceiptStatus,
  TransferOrderStatus,
} from '@erp/shared-interfaces';
import { BadRequestException } from '@nestjs/common';
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
  const lineRepo = {
    findAndCount: jest.fn(),
  };
  // Manager handed to the `dataSource.transaction(...)` callback in `cancel()`
  // — row-lock query + status flip both happen through this, inside the tx.
  const txManager = {
    query: jest.fn().mockResolvedValue([{ status: GoodsReceiptStatus.POSTED }]),
    update: jest.fn(),
    softDelete: jest.fn(),
    delete: jest.fn(),
    save: jest.fn().mockImplementation((_entity, rows) => Promise.resolve(rows)),
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
  const journalService = {
    post: jest.fn().mockResolvedValue({ id: 'je-1' }),
  };
  const cashFundResolver = {
    resolveOrDefault: jest.fn().mockResolvedValue('cash-acct-1'),
  };
  const cashPaymentsService = {
    createAndPostInternal: jest.fn().mockResolvedValue({
      voucherId: 'cp-1',
      voucherNumber: 'PC0001',
      cashMovementId: 'cm-1',
      journalEntryId: 'je-cp-1',
    }),
  };
  const cashReceiptsService = {
    createAndPostInternal: jest.fn().mockResolvedValue({
      voucherId: 'cr-1',
      voucherNumber: 'PT0001',
      cashMovementId: 'cm-2',
      journalEntryId: 'je-cr-1',
    }),
  };
  const transferOrderService = {
    applyLegRevision: jest.fn().mockResolvedValue(undefined),
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
      lineRepo as never,
      dataSource as never,
      stockLedger as never,
      documentNumberingService as never,
      {} as never,
      cashFundResolver as never,
      journalService as never,
      {} as never,
      {} as never,
      cashPaymentsService as never,
      cashReceiptsService as never,
      transferOrderService as never,
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
      { status: GoodsReceiptStatus.CANCELLED, revision: 1 },
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

  describe('cancelling a posted credit receipt (T-02-03)', () => {
    function creditReceipt(overrides: Record<string, unknown> = {}) {
      return {
        id: 'receipt-cc',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        status: GoodsReceiptStatus.POSTED,
        purpose: GoodsReceiptPurpose.PURCHASE,
        paymentMethod: 'CREDIT',
        providerId: 'provider-1',
        documentNumber: 'PN0030',
        revision: 0,
        lines: [
          {
            itemId: 'item-1',
            locationId: 'loc-A01',
            quantity: '10.000',
            unitPrice: '100.00',
          },
        ],
        ...overrides,
      };
    }

    function mockQueryDispatch(opts: {
      revision?: number;
      debt: { id: string; paid_amount: number } | null;
    }) {
      txManager.query.mockImplementation((sql: string) => {
        if (sql.includes('FOR UPDATE')) {
          return Promise.resolve([
            { status: GoodsReceiptStatus.POSTED, revision: opts.revision ?? 0 },
          ]);
        }
        if (sql.includes('FROM "accounts"')) {
          return Promise.resolve([{ id: 'acct-x' }]);
        }
        if (sql.includes('FROM supplier_debts')) {
          return Promise.resolve(opts.debt ? [opts.debt] : []);
        }
        throw new Error(`Unexpected query in test: ${sql}`);
      });
    }

    beforeEach(() => {
      journalService.post.mockClear();
    });

    it('reverses stock and drops an unpaid debt row entirely', async () => {
      receiptRepo.findOne.mockResolvedValue(creditReceipt());
      mockQueryDispatch({ debt: { id: 'debt-1', paid_amount: 0 } });

      await service.cancel('receipt-cc', actor);

      expect(stockLedger.recordBatchMovements).toHaveBeenCalledWith(
        [expect.objectContaining({ quantity: -10, lineValue: -1000 })],
        txManager,
      );
      // DR331/CR156 for the full 1,000,000 reversal.
      expect(journalService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({ debitAmount: 1000, creditAmount: 0 }),
            expect.objectContaining({ debitAmount: 0, creditAmount: 1000 }),
          ],
        }),
        actor,
        txManager,
      );
      expect(txManager.delete).toHaveBeenCalledWith(
        expect.anything(), // SupplierDebtEntity
        'debt-1',
      );
    });

    it('leaves a partially paid debt row as overpaid instead of deleting it (A-02, A-03)', async () => {
      receiptRepo.findOne.mockResolvedValue(creditReceipt());
      mockQueryDispatch({ debt: { id: 'debt-1', paid_amount: 400 } });

      // No guard blocks this — the old "refuse if already paid" check is gone.
      await expect(service.cancel('receipt-cc', actor)).resolves.toBeUndefined();

      expect(txManager.update).toHaveBeenCalledWith(
        expect.anything(),
        'debt-1',
        { originalAmount: 0, remainingAmount: -400, status: 'overpaid' },
      );
      expect(txManager.delete).not.toHaveBeenCalledWith(
        expect.anything(),
        'debt-1',
      );
    });

    it('rejects a second concurrent cancel once the first has revised the row', async () => {
      receiptRepo.findOne.mockResolvedValue(creditReceipt());
      // The first cancel already committed and bumped revision to 1.
      mockQueryDispatch({ revision: 1, debt: { id: 'debt-1', paid_amount: 0 } });

      await expect(service.cancel('receipt-cc', actor)).rejects.toThrow(
        'modified by another request',
      );
      expect(stockLedger.recordBatchMovements).not.toHaveBeenCalled();
    });
  });

  describe('cancelling a posted cash receipt (T-03-02)', () => {
    function cashReceipt(overrides: Record<string, unknown> = {}) {
      return {
        id: 'receipt-cash-cc',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        status: GoodsReceiptStatus.POSTED,
        purpose: GoodsReceiptPurpose.PURCHASE,
        paymentMethod: 'CASH',
        documentNumber: 'PN0050',
        revision: 0,
        lines: [
          { itemId: 'item-1', locationId: 'loc-A01', quantity: '10.000', unitPrice: '100.00' },
        ],
        ...overrides,
      };
    }

    beforeEach(() => {
      cashPaymentsService.createAndPostInternal.mockClear();
      cashReceiptsService.createAndPostInternal.mockClear();
      txManager.query.mockImplementation((sql: string) => {
        if (sql.includes('FOR UPDATE')) {
          return Promise.resolve([{ status: GoodsReceiptStatus.POSTED, revision: 0 }]);
        }
        if (sql.includes('FROM "accounts"')) {
          return Promise.resolve([{ id: 'acct-156' }]);
        }
        throw new Error(`Unexpected query in test: ${sql}`);
      });
    });

    it('refunds the fund the full receipt value and reverses stock', async () => {
      receiptRepo.findOne.mockResolvedValue(cashReceipt());

      await service.cancel('receipt-cash-cc', actor);

      expect(stockLedger.recordBatchMovements).toHaveBeenCalledWith(
        [expect.objectContaining({ quantity: -10, lineValue: -1000 })],
        txManager,
      );
      expect(cashReceiptsService.createAndPostInternal).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1000 }),
        txManager,
      );
      expect(cashPaymentsService.createAndPostInternal).not.toHaveBeenCalled();
    });

    it('rejects a second concurrent cancel and refunds the fund exactly once', async () => {
      const receipt = cashReceipt();
      receiptRepo.findOne.mockResolvedValue(receipt);
      // A row lock serialises the two transactions; the second sees revision 1,
      // already bumped by the first.
      let calls = 0;
      txManager.query.mockImplementation((sql: string) => {
        if (sql.includes('FOR UPDATE')) {
          calls += 1;
          return Promise.resolve([
            { status: GoodsReceiptStatus.POSTED, revision: calls === 1 ? 0 : 1 },
          ]);
        }
        if (sql.includes('FROM "accounts"')) {
          return Promise.resolve([{ id: 'acct-156' }]);
        }
        throw new Error(`Unexpected query in test: ${sql}`);
      });

      const outcomes = await Promise.allSettled([
        service.cancel('receipt-cash-cc', actor),
        service.cancel('receipt-cash-cc', actor),
      ]);

      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1);
      expect(cashReceiptsService.createAndPostInternal).toHaveBeenCalledTimes(1);
    });

    it('leaves an unsettled (no paymentMethod) receipt cancel untouched by cash logic', async () => {
      receiptRepo.findOne.mockResolvedValue(
        cashReceipt({ paymentMethod: undefined }),
      );

      await service.cancel('receipt-cash-cc', actor);

      expect(cashPaymentsService.createAndPostInternal).not.toHaveBeenCalled();
      expect(cashReceiptsService.createAndPostInternal).not.toHaveBeenCalled();
    });
  });

  describe('update on a posted receipt', () => {
    /** A posted, unsettled receipt: one line, 10 units at 100. */
    function postedReceipt(overrides: Record<string, unknown> = {}) {
      return {
        id: 'receipt-9',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        status: GoodsReceiptStatus.POSTED,
        purpose: GoodsReceiptPurpose.OTHER,
        documentNumber: 'PN0009',
        revision: 0,
        receivedAt: new Date('2026-06-10T00:00:00.000Z'),
        locationId: 'loc-A01',
        attachmentIds: [],
        lines: [
          {
            itemId: 'item-1',
            locationId: 'loc-A01',
            uomCode: 'pcs',
            quantity: '10.000',
            unitPrice: '100.00',
          },
        ],
        ...overrides,
      };
    }

    const editedLines = [
      {
        itemId: 'item-1',
        locationId: 'loc-A01',
        uomCode: 'pcs',
        quantity: 7,
        unitPrice: 100,
      },
    ];

    it('writes one ledger adjustment per changed pair and bumps the revision', async () => {
      receiptRepo.findOne.mockResolvedValue(postedReceipt());
      txManager.query.mockResolvedValue([
        { status: GoodsReceiptStatus.POSTED, revision: 0 },
      ]);

      await service.update('receipt-9', { lines: editedLines }, actor);

      expect(txManager.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        ['receipt-9', actor.organizationId],
      );
      expect(stockLedger.recordBatchMovements).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            itemId: 'item-1',
            locationId: 'loc-A01',
            quantity: -3,
            unitCost: 100,
            lineValue: -300,
            referenceType: 'GOODS_RECEIPT',
            referenceId: 'receipt-9',
            skipInactiveStorageGuard: true,
          }),
        ],
        txManager,
      );
      expect(txManager.update).toHaveBeenCalledWith(
        GoodsReceiptEntity,
        'receipt-9',
        expect.objectContaining({ revision: 1 }),
      );
    });

    it('reverses a removed line and posts an added one', async () => {
      receiptRepo.findOne.mockResolvedValue(postedReceipt());
      txManager.query.mockResolvedValue([
        { status: GoodsReceiptStatus.POSTED, revision: 0 },
      ]);

      await service.update(
        'receipt-9',
        {
          lines: [
            {
              itemId: 'item-2',
              locationId: 'loc-A01',
              uomCode: 'pcs',
              quantity: 4,
              unitPrice: 25,
            },
          ],
        },
        actor,
      );

      expect(stockLedger.recordBatchMovements).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            itemId: 'item-1',
            quantity: -10,
            lineValue: -1000,
          }),
          expect.objectContaining({
            itemId: 'item-2',
            quantity: 4,
            lineValue: 100,
          }),
        ],
        txManager,
      );
    });

    it('leaves the ledger alone when only header fields change', async () => {
      receiptRepo.findOne.mockResolvedValue(postedReceipt());
      txManager.query.mockResolvedValue([
        { status: GoodsReceiptStatus.POSTED, revision: 0 },
      ]);

      await service.update('receipt-9', { description: 'ghi chú mới' }, actor);

      expect(stockLedger.recordBatchMovements).not.toHaveBeenCalled();
      expect(txManager.update).toHaveBeenCalledWith(
        GoodsReceiptEntity,
        'receipt-9',
        expect.objectContaining({ description: 'ghi chú mới' }),
      );
    });

    it('rejects the edit when another request already revised the receipt', async () => {
      receiptRepo.findOne.mockResolvedValue(postedReceipt());
      // The competing request committed first and left revision at 1.
      txManager.query.mockResolvedValue([
        { status: GoodsReceiptStatus.POSTED, revision: 1 },
      ]);

      await expect(
        service.update('receipt-9', { lines: editedLines }, actor),
      ).rejects.toThrow('modified by another request');

      expect(stockLedger.recordBatchMovements).not.toHaveBeenCalled();
    });

    it('rejects an edit on a cancelled receipt', async () => {
      receiptRepo.findOne.mockResolvedValue(
        postedReceipt({ status: GoodsReceiptStatus.CANCELLED }),
      );

      await expect(
        service.update('receipt-9', { lines: editedLines }, actor),
      ).rejects.toThrow('can no longer be edited');
    });

    it('allows an edit that drives stock negative', async () => {
      receiptRepo.findOne.mockResolvedValue(postedReceipt());
      txManager.query.mockResolvedValue([
        { status: GoodsReceiptStatus.POSTED, revision: 0 },
      ]);

      await service.update(
        'receipt-9',
        {
          lines: [{ ...editedLines[0], quantity: 1 }],
        },
        actor,
      );

      // -9 against whatever is on hand: no stock guard stands in the way.
      expect(stockLedger.recordBatchMovements).toHaveBeenCalledWith(
        [expect.objectContaining({ quantity: -9, lineValue: -900 })],
        txManager,
      );
    });

    it('refuses to change the settlement method', async () => {
      receiptRepo.findOne.mockResolvedValue(
        postedReceipt({ status: GoodsReceiptStatus.DRAFT, paymentMethod: 'CASH' }),
      );

      await expect(
        service.update(
          'receipt-9',
          { paymentMethod: 'CREDIT' as never, lines: editedLines },
          actor,
        ),
      ).rejects.toThrow('settlement method');
    });

    it('pays the fund the difference when a cash receipt is edited up (T-03-01)', async () => {
      receiptRepo.findOne.mockResolvedValue(postedReceipt({ paymentMethod: 'CASH' }));
      txManager.query.mockResolvedValue([
        { status: GoodsReceiptStatus.POSTED, revision: 0 },
      ]);

      await service.update(
        'receipt-9',
        { lines: [{ ...editedLines[0], quantity: 13 }] }, // 10 -> 13 @ 100: +300
        actor,
      );

      expect(cashPaymentsService.createAndPostInternal).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 300 }),
        txManager,
      );
      expect(cashReceiptsService.createAndPostInternal).not.toHaveBeenCalled();
    });

    it('refunds the fund the difference when a cash receipt is edited down (T-03-01)', async () => {
      receiptRepo.findOne.mockResolvedValue(postedReceipt({ paymentMethod: 'CASH' }));
      txManager.query.mockResolvedValue([
        { status: GoodsReceiptStatus.POSTED, revision: 0 },
      ]);

      await service.update('receipt-9', { lines: editedLines }, actor); // 10 -> 7: -300

      expect(cashReceiptsService.createAndPostInternal).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 300 }),
        txManager,
      );
      expect(cashPaymentsService.createAndPostInternal).not.toHaveBeenCalled();
    });

    it('retrying the same revision reuses the same deterministic reference', async () => {
      receiptRepo.findOne.mockResolvedValue(postedReceipt({ paymentMethod: 'CASH' }));
      txManager.query.mockResolvedValue([
        { status: GoodsReceiptStatus.POSTED, revision: 0 },
      ]);

      await service.update(
        'receipt-9',
        { lines: [{ ...editedLines[0], quantity: 13 }] },
        actor,
      );
      const firstCallRef = cashPaymentsService.createAndPostInternal.mock.calls[0][0]
        .referenceId as string;

      cashPaymentsService.createAndPostInternal.mockClear();
      // Same starting state, same edit — a client retry after a dropped response.
      await service.update(
        'receipt-9',
        { lines: [{ ...editedLines[0], quantity: 13 }] },
        actor,
      );
      const secondCallRef = cashPaymentsService.createAndPostInternal.mock.calls[0][0]
        .referenceId as string;

      expect(secondCallRef).toBe(firstCallRef);
    });

    it('two different edits get two different references, so neither swallows the other', async () => {
      // `receiptRepo.findOne` always resolves this same object — mutating its
      // `revision` between the two calls stands in for what a real re-fetch
      // would see once the first edit has committed.
      const receipt = postedReceipt({ paymentMethod: 'CASH' });
      receiptRepo.findOne.mockResolvedValue(receipt);
      txManager.query.mockResolvedValueOnce([
        { status: GoodsReceiptStatus.POSTED, revision: 0 },
      ]);
      await service.update(
        'receipt-9',
        { lines: [{ ...editedLines[0], quantity: 13 }] },
        actor,
      );
      const firstRef = cashPaymentsService.createAndPostInternal.mock.calls[0][0]
        .referenceId as string;

      receipt.revision = 1;
      receipt.lines = [{ ...postedReceipt().lines[0], quantity: '13.000' }];
      txManager.query.mockResolvedValueOnce([
        { status: GoodsReceiptStatus.POSTED, revision: 1 },
      ]);
      await service.update(
        'receipt-9',
        { lines: [{ ...editedLines[0], quantity: 15 }] },
        actor,
      );
      const secondRef = cashPaymentsService.createAndPostInternal.mock.calls[1][0]
        .referenceId as string;

      expect(secondRef).not.toBe(firstRef);
      expect(cashPaymentsService.createAndPostInternal).toHaveBeenCalledTimes(2);
    });

    it('rolls back the whole edit when the fund does not have enough to cover an increase', async () => {
      receiptRepo.findOne.mockResolvedValue(postedReceipt({ paymentMethod: 'CASH' }));
      txManager.query.mockResolvedValue([
        { status: GoodsReceiptStatus.POSTED, revision: 0 },
      ]);
      cashPaymentsService.createAndPostInternal.mockRejectedValueOnce(
        new BadRequestException('Insufficient balance'),
      );

      await expect(
        service.update(
          'receipt-9',
          { lines: [{ ...editedLines[0], quantity: 13 }] },
          actor,
        ),
      ).rejects.toThrow('Insufficient balance');

      // The transaction callback threw before touching the ledger or the lines.
      expect(stockLedger.recordBatchMovements).not.toHaveBeenCalled();
      expect(txManager.save).not.toHaveBeenCalled();
    });

    it('cascades an edit to the linked transfer order (T-05-02)', async () => {
      receiptRepo.findOne.mockResolvedValue(
        postedReceipt({
          referenceType: GoodsReceiptReferenceType.STOCK_TRANSFER,
          referenceId: 'to-1',
        }),
      );
      txManager.query.mockResolvedValue([
        { status: GoodsReceiptStatus.POSTED, revision: 0 },
      ]);

      await service.update('receipt-9', { lines: editedLines }, actor); // 10 -> 7

      expect(transferOrderService.applyLegRevision).toHaveBeenCalledWith(
        'to-1',
        [expect.objectContaining({ itemId: 'item-1', quantityDelta: -3 })],
        actor,
        'import',
      );
    });

    it('does not cascade when cascadeTransferOrder is false — the loop-breaker (T-05-02)', async () => {
      receiptRepo.findOne.mockResolvedValue(
        postedReceipt({
          referenceType: GoodsReceiptReferenceType.STOCK_TRANSFER,
          referenceId: 'to-1',
        }),
      );
      txManager.query.mockResolvedValue([
        { status: GoodsReceiptStatus.POSTED, revision: 0 },
      ]);

      await service.update(
        'receipt-9',
        { lines: editedLines },
        actor,
        { cascadeTransferOrder: false },
      );

      expect(transferOrderService.applyLegRevision).not.toHaveBeenCalled();
    });

    it('does not cascade when the receipt is not linked to a transfer order', async () => {
      receiptRepo.findOne.mockResolvedValue(postedReceipt());
      txManager.query.mockResolvedValue([
        { status: GoodsReceiptStatus.POSTED, revision: 0 },
      ]);

      await service.update('receipt-9', { lines: editedLines }, actor);

      expect(transferOrderService.applyLegRevision).not.toHaveBeenCalled();
    });
  });

  describe('ledger invariants across consecutive edits', () => {
    // The books, as far as this test is concerned: every movement the service
    // hands to the ledger, kept in insertion order.
    type Movement = {
      itemId: string;
      locationId: string;
      quantity: number;
      lineValue?: number;
    };
    let ledger: Movement[];
    let receipt: Record<string, unknown>;

    /**
     * INV-1 and INV-2: for every (item, location) pair, what the ledger holds for
     * this voucher equals what the voucher's lines currently say — quantity and
     * value alike. This is the contract the whole feature rests on (ADR-03).
     */
    function assertVoucherInvariants() {
      const lines = receipt.lines as {
        itemId: string;
        locationId: string;
        quantity: string | number;
        unitPrice: string | number;
      }[];
      const pairs = new Set([
        ...ledger.map((m) => `${m.itemId}::${m.locationId}`),
        ...lines.map((l) => `${l.itemId}::${l.locationId}`),
      ]);

      for (const pair of pairs) {
        const ledgerQty = ledger
          .filter((m) => `${m.itemId}::${m.locationId}` === pair)
          .reduce((sum, m) => sum + m.quantity, 0);
        const ledgerValue = ledger
          .filter((m) => `${m.itemId}::${m.locationId}` === pair)
          .reduce((sum, m) => sum + (m.lineValue ?? 0), 0);
        const lineQty = lines
          .filter((l) => `${l.itemId}::${l.locationId}` === pair)
          .reduce((sum, l) => sum + Number(l.quantity), 0);
        const lineValue = lines
          .filter((l) => `${l.itemId}::${l.locationId}` === pair)
          .reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice), 0);

        expect({ pair, qty: ledgerQty, value: Number(ledgerValue.toFixed(2)) }).toEqual({
          pair,
          qty: lineQty,
          value: Number(lineValue.toFixed(2)),
        });
      }
    }

    async function edit(quantity: number, unitPrice: number) {
      await service.update(
        receipt.id as string,
        {
          lines: [
            {
              itemId: 'item-1',
              locationId: 'loc-A01',
              uomCode: 'pcs',
              quantity,
              unitPrice,
            },
          ],
        },
        actor,
      );
    }

    beforeEach(() => {
      // Posted once as 10 @ 100 — that first posting is already on the books.
      ledger = [
        { itemId: 'item-1', locationId: 'loc-A01', quantity: 10, lineValue: 1000 },
      ];
      receipt = {
        id: 'receipt-inv',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        status: GoodsReceiptStatus.POSTED,
        purpose: GoodsReceiptPurpose.OTHER,
        documentNumber: 'PN0010',
        revision: 0,
        receivedAt: new Date('2026-06-10T00:00:00.000Z'),
        locationId: 'loc-A01',
        attachmentIds: [],
        lines: [
          {
            itemId: 'item-1',
            locationId: 'loc-A01',
            uomCode: 'pcs',
            quantity: '10.000',
            unitPrice: '100.00',
          },
        ],
      };

      // Each request gets its own snapshot, as a real query would hand back —
      // sharing one mutable object would hide exactly the race under test.
      receiptRepo.findOne.mockImplementation(() =>
        Promise.resolve({
          ...receipt,
          lines: (receipt.lines as unknown[]).map((l) => ({ ...(l as object) })),
        }),
      );
      // `FOR UPDATE` on the voucher row means one transaction touches it at a
      // time; the fake serialises them so the guard is tested, not the mock.
      let txChain: Promise<unknown> = Promise.resolve();
      dataSource.transaction.mockImplementation(
        (cb: (manager: unknown) => Promise<unknown>) => {
          const run = txChain.then(
            () => cb(txManager),
            () => cb(txManager),
          );
          txChain = run.catch(() => undefined);
          return run;
        },
      );
      txManager.query.mockImplementation(() =>
        Promise.resolve([
          { status: receipt.status, revision: receipt.revision },
        ]),
      );
      stockLedger.recordBatchMovements.mockImplementation(
        (movements: Movement[]) => {
          ledger.push(...movements);
          return Promise.resolve([]);
        },
      );
      txManager.save.mockImplementation((_entity: unknown, rows: unknown) => {
        receipt.lines = rows as typeof receipt.lines;
        return Promise.resolve(rows);
      });
      txManager.update.mockImplementation(
        (_entity: unknown, _id: string, patch: Record<string, unknown>) => {
          Object.assign(receipt, patch);
          return Promise.resolve(undefined);
        },
      );
    });

    it('holds INV-1 and INV-2 after each of three consecutive edits', async () => {
      assertVoucherInvariants();

      await edit(7, 100); // quantity down
      assertVoucherInvariants();
      expect(receipt.revision).toBe(1);

      await edit(7, 120); // price only — the value-only adjustment
      assertVoucherInvariants();

      await edit(9, 120); // quantity back up
      assertVoucherInvariants();
      expect(receipt.revision).toBe(3);
    });

    it('records the price-only edit as a zero-quantity, non-zero-value row', async () => {
      await edit(10, 120);

      expect(ledger.at(-1)).toEqual(
        expect.objectContaining({ quantity: 0, lineValue: 200 }),
      );
    });

    it('lets only one of two concurrent edits reach the ledger', async () => {
      // Both requests read revision 0; the row lock serialises them, so the
      // second one finds a revision it did not expect and is turned away.
      const first = service.update(
        'receipt-inv',
        {
          lines: [
            {
              itemId: 'item-1',
              locationId: 'loc-A01',
              uomCode: 'pcs',
              quantity: 7,
              unitPrice: 100,
            },
          ],
        },
        actor,
      );
      const second = service.update(
        'receipt-inv',
        {
          lines: [
            {
              itemId: 'item-1',
              locationId: 'loc-A01',
              uomCode: 'pcs',
              quantity: 4,
              unitPrice: 100,
            },
          ],
        },
        actor,
      );

      const outcomes = await Promise.allSettled([first, second]);

      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1);
      // One original posting + exactly one adjustment.
      expect(ledger).toHaveLength(2);
      assertVoucherInvariants();
    });
  });

  describe('update on a posted credit receipt', () => {
    /** Posted CREDIT receipt: 10 @ 100 = 1,000,000 owed to the supplier. */
    function creditReceipt(overrides: Record<string, unknown> = {}) {
      return {
        id: 'receipt-credit',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        status: GoodsReceiptStatus.POSTED,
        purpose: GoodsReceiptPurpose.PURCHASE,
        paymentMethod: 'CREDIT',
        providerId: 'provider-1',
        documentNumber: 'PN0020',
        revision: 0,
        receivedAt: new Date('2026-06-10T00:00:00.000Z'),
        locationId: 'loc-A01',
        attachmentIds: [],
        lines: [
          {
            itemId: 'item-1',
            locationId: 'loc-A01',
            uomCode: 'pcs',
            quantity: '10.000',
            unitPrice: '100.00',
          },
        ],
        ...overrides,
      };
    }

    function mockQueryDispatch(opts: {
      revision?: number;
      debt?: { id: string; paid_amount: number } | null;
    }) {
      txManager.query.mockImplementation((sql: string) => {
        if (sql.includes('FOR UPDATE')) {
          return Promise.resolve([
            { status: GoodsReceiptStatus.POSTED, revision: opts.revision ?? 0 },
          ]);
        }
        if (sql.includes('FROM "accounts"')) {
          return Promise.resolve([{ id: 'acct-156-or-331' }]);
        }
        if (sql.includes('FROM supplier_debts')) {
          return Promise.resolve(opts.debt ? [opts.debt] : []);
        }
        throw new Error(`Unexpected query in test: ${sql}`);
      });
    }

    it('posts DR156/CR331 and raises the debt when the total goes up', async () => {
      receiptRepo.findOne.mockResolvedValue(creditReceipt());
      mockQueryDispatch({ debt: { id: 'debt-1', paid_amount: 0 } });

      await service.update(
        'receipt-credit',
        {
          lines: [
            {
              itemId: 'item-1',
              locationId: 'loc-A01',
              uomCode: 'pcs',
              quantity: 12,
              unitPrice: 100,
            },
          ],
        },
        actor,
      );

      // Delta is +200: 12*100 - 10*100.
      expect(journalService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({ debitAmount: 200, creditAmount: 0 }),
            expect.objectContaining({ debitAmount: 0, creditAmount: 200 }),
          ],
        }),
        actor,
        txManager,
      );
      expect(txManager.update).toHaveBeenCalledWith(
        expect.anything(), // SupplierDebtEntity
        'debt-1',
        { originalAmount: 1200, remainingAmount: 1200, status: 'open' },
      );
    });

    it('lowers the debt and reverses the journal direction when the total goes down', async () => {
      receiptRepo.findOne.mockResolvedValue(creditReceipt());
      mockQueryDispatch({ debt: { id: 'debt-1', paid_amount: 0 } });

      await service.update(
        'receipt-credit',
        {
          lines: [
            {
              itemId: 'item-1',
              locationId: 'loc-A01',
              uomCode: 'pcs',
              quantity: 7,
              unitPrice: 100,
            },
          ],
        },
        actor,
      );

      // Delta is -300; the debit/credit legs swap sides versus the increase case.
      expect(journalService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({ debitAmount: 300, creditAmount: 0 }),
            expect.objectContaining({ debitAmount: 0, creditAmount: 300 }),
          ],
        }),
        actor,
        txManager,
      );
      expect(txManager.update).toHaveBeenCalledWith(
        expect.anything(),
        'debt-1',
        { originalAmount: 700, remainingAmount: 700, status: 'open' },
      );
    });

    it('marks the debt overpaid when the new total is below what the supplier was already paid', async () => {
      receiptRepo.findOne.mockResolvedValue(creditReceipt());
      // The supplier has already been paid 600,000 against the original 1,000,000.
      mockQueryDispatch({ debt: { id: 'debt-1', paid_amount: 600 } });

      await service.update(
        'receipt-credit',
        {
          lines: [
            {
              itemId: 'item-1',
              locationId: 'loc-A01',
              uomCode: 'pcs',
              quantity: 4,
              unitPrice: 100,
            },
          ],
        },
        actor,
      );

      // The existing debt row is updated in place — no refund voucher, no new
      // debt row, is generated automatically for the overage (A-03).
      expect(txManager.update).toHaveBeenCalledWith(
        expect.anything(),
        'debt-1',
        { originalAmount: 400, remainingAmount: -200, status: 'overpaid' },
      );
    });

    it('does not touch the journal or the debt when the total is unchanged', async () => {
      receiptRepo.findOne.mockResolvedValue(creditReceipt());
      mockQueryDispatch({ debt: { id: 'debt-1', paid_amount: 0 } });

      await service.update(
        'receipt-credit',
        {
          lines: [
            {
              itemId: 'item-1',
              locationId: 'loc-A01',
              uomCode: 'pcs',
              quantity: 10,
              unitPrice: 100,
            },
          ],
        },
        actor,
      );

      expect(journalService.post).not.toHaveBeenCalled();
    });

    it('rejects editing a credit receipt with no supplier on file', async () => {
      receiptRepo.findOne.mockResolvedValue(
        creditReceipt({ providerId: undefined }),
      );
      mockQueryDispatch({ debt: { id: 'debt-1', paid_amount: 0 } });

      await expect(
        service.update(
          'receipt-credit',
          {
            lines: [
              {
                itemId: 'item-1',
                locationId: 'loc-A01',
                uomCode: 'pcs',
                quantity: 12,
                unitPrice: 100,
              },
            ],
          },
          actor,
        ),
      ).rejects.toThrow('phải có nhà cung cấp');

      expect(journalService.post).not.toHaveBeenCalled();
    });
  });

  describe('INV-3 across a full credit-receipt lifecycle (T-02-04)', () => {
    // A running model of "the books", built purely from what this service
    // hands to `journalService.post` and to the `supplier_debts` row — the
    // same contract UOW-02's ADR-03 rests on, now followed through several
    // edits and a payment instead of a single call.
    let receipt: Record<string, unknown>;
    let ledger: { quantity: number; lineValue?: number }[];
    let coa156: number; // running DR-CR balance this feature has posted to 156
    let coa331: number; // running DR-CR balance this feature has posted to 331
    let debt: { originalAmount: number; paidAmount: number; remainingAmount: number; status: string };

    function currentTotal() {
      const lines = receipt.lines as { quantity: string; unitPrice: string }[];
      return lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice), 0);
    }

    /** INV-1/INV-2 (stock) and INV-3 (156/331/supplier_debts), all at once. */
    function assertInvariants() {
      const total = currentTotal();
      const ledgerQty = ledger.reduce((s, m) => s + m.quantity, 0);
      const ledgerValue = ledger.reduce((s, m) => s + (m.lineValue ?? 0), 0);
      const lines = receipt.lines as { quantity: string; unitPrice: string }[];
      const lineQty = lines.reduce((s, l) => s + Number(l.quantity), 0);

      expect(ledgerQty).toBeCloseTo(lineQty, 3);
      expect(ledgerValue).toBeCloseTo(total, 2);
      expect(coa156).toBeCloseTo(total, 2);
      expect(coa331).toBeCloseTo(total, 2);
      expect(debt.originalAmount).toBeCloseTo(total, 2);
      expect(debt.remainingAmount).toBeCloseTo(total - debt.paidAmount, 2);
      const expectedStatus =
        debt.remainingAmount < 0 ? 'overpaid' : debt.remainingAmount === 0 ? 'paid' : 'open';
      expect(debt.status).toBe(expectedStatus);
    }

    beforeEach(() => {
      ledger = [{ quantity: 10, lineValue: 1000 }]; // posted once: 10 @ 100
      coa156 = 1000;
      coa331 = 1000;
      debt = { originalAmount: 1000, paidAmount: 0, remainingAmount: 1000, status: 'open' };
      receipt = {
        id: 'receipt-lifecycle',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        status: GoodsReceiptStatus.POSTED,
        purpose: GoodsReceiptPurpose.PURCHASE,
        paymentMethod: 'CREDIT',
        providerId: 'provider-1',
        documentNumber: 'PN0040',
        revision: 0,
        attachmentIds: [],
        lines: [
          { itemId: 'item-1', locationId: 'loc-A01', uomCode: 'pcs', quantity: '10.000', unitPrice: '100.00' },
        ],
      };

      receiptRepo.findOne.mockImplementation(() => Promise.resolve({ ...receipt }));
      txManager.query.mockImplementation((sql: string) => {
        if (sql.includes('FOR UPDATE')) {
          return Promise.resolve([{ status: receipt.status, revision: receipt.revision }]);
        }
        if (sql.includes('FROM "accounts"')) {
          return Promise.resolve([{ id: 'acct-x' }]);
        }
        if (sql.includes('FROM supplier_debts')) {
          return Promise.resolve([{ id: 'debt-1', paid_amount: debt.paidAmount }]);
        }
        throw new Error(`Unexpected query: ${sql}`);
      });
      journalService.post.mockImplementation(
        (dto: {
          lines: { debitAmount: number; creditAmount: number; description: string }[];
        }) => {
          // The mocked account id is the same for every call, so the leg's own
          // description — "Inventory" vs "Payable" — is what tells 156 and 331
          // apart. Each account's balance grows in its own natural direction:
          // 156 is asset-normal (debit increases it), 331 is liability-normal
          // (credit increases it).
          for (const line of dto.lines) {
            if (line.description.includes('Inventory')) {
              coa156 += line.debitAmount - line.creditAmount;
            } else {
              coa331 += line.creditAmount - line.debitAmount;
            }
          }
          return Promise.resolve({ id: 'je-x' });
        },
      );
      stockLedger.recordBatchMovements.mockImplementation(
        (movements: { quantity: number; lineValue?: number }[]) => {
          ledger.push(...movements);
          return Promise.resolve([]);
        },
      );
      txManager.save.mockImplementation((_entity: unknown, rows: unknown) => {
        receipt.lines = rows as typeof receipt.lines;
        return Promise.resolve(rows);
      });
      txManager.update.mockImplementation(
        (entity: unknown, id: string, patch: Record<string, unknown>) => {
          if (id === 'debt-1') {
            Object.assign(debt, {
              originalAmount: Number(patch.originalAmount),
              remainingAmount: Number(patch.remainingAmount),
              status: patch.status,
            });
          } else {
            Object.assign(receipt, patch);
          }
          return Promise.resolve(undefined);
        },
      );
      txManager.delete.mockImplementation(() => Promise.resolve(undefined));
    });

    it('holds INV-1/2/3 through edit-up, a partial payment, edit-down and cancel', async () => {
      assertInvariants();

      // 1. Edit up: 10 -> 15 @ 100 = 1,500.
      await service.update(
        'receipt-lifecycle',
        { lines: [{ itemId: 'item-1', locationId: 'loc-A01', uomCode: 'pcs', quantity: 15, unitPrice: 100 }] },
        actor,
      );
      assertInvariants();

      // 2. The supplier is paid 1,200 against the 1,500 owed — modelled directly,
      //    the same way `SupplierDebtPaymentSagaService` would update the row;
      //    calling that saga for real is out of this ticket's scope.
      debt.paidAmount = 1200;
      debt.remainingAmount = debt.originalAmount - debt.paidAmount;
      debt.status = 'open';

      // 3. Edit down below what has already been paid: 15 -> 8 @ 100 = 800.
      await service.update(
        'receipt-lifecycle',
        { lines: [{ itemId: 'item-1', locationId: 'loc-A01', uomCode: 'pcs', quantity: 8, unitPrice: 100 }] },
        actor,
      );
      assertInvariants();
      expect(debt.status).toBe('overpaid');

      // 4. Cancel: total goes to 0; paidAmount (1,200) stays, so it is still
      //    overpaid rather than deleted (T-02-03).
      await service.cancel('receipt-lifecycle', actor);
      expect(ledger.reduce((s, m) => s + m.quantity, 0)).toBe(0);
      expect(coa156).toBe(0);
      expect(debt.originalAmount).toBe(0);
      expect(debt.remainingAmount).toBe(-1200);
      expect(debt.status).toBe('overpaid');
    });
  });

  describe('INV-3 across a full cash-receipt lifecycle (T-03-03)', () => {
    // Same shape as the credit lifecycle above, but the money side is the
    // fund's balance instead of a debt row.
    let receipt: Record<string, unknown>;
    let ledger: { quantity: number; lineValue?: number }[];
    let coa156: number;
    let fundBalance: number; // running cash-account balance this feature has moved

    function currentTotal() {
      const lines = receipt.lines as { quantity: string; unitPrice: string }[];
      return lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice), 0);
    }

    function assertInvariants() {
      const total = currentTotal();
      const ledgerQty = ledger.reduce((s, m) => s + m.quantity, 0);
      const ledgerValue = ledger.reduce((s, m) => s + (m.lineValue ?? 0), 0);
      const lines = receipt.lines as { quantity: string; unitPrice: string }[];
      const lineQty = lines.reduce((s, l) => s + Number(l.quantity), 0);

      expect(ledgerQty).toBeCloseTo(lineQty, 3);
      expect(ledgerValue).toBeCloseTo(total, 2);
      expect(coa156).toBeCloseTo(total, 2);
      // The fund paid out exactly the receipt's current value — 156 and the
      // fund's outflow always move by the same magnitude.
      expect(fundBalance).toBeCloseTo(-total, 2);
    }

    beforeEach(() => {
      ledger = [{ quantity: 10, lineValue: 1000 }]; // posted once: 10 @ 100
      coa156 = 1000;
      fundBalance = -1000; // the fund paid out 1,000 on the original posting
      receipt = {
        id: 'receipt-cash-lifecycle',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        status: GoodsReceiptStatus.POSTED,
        purpose: GoodsReceiptPurpose.OTHER,
        paymentMethod: 'CASH',
        documentNumber: 'PN0060',
        revision: 0,
        attachmentIds: [],
        lines: [
          { itemId: 'item-1', locationId: 'loc-A01', uomCode: 'pcs', quantity: '10.000', unitPrice: '100.00' },
        ],
      };

      receiptRepo.findOne.mockImplementation(() => Promise.resolve({ ...receipt }));
      txManager.query.mockImplementation((sql: string) => {
        if (sql.includes('FOR UPDATE')) {
          return Promise.resolve([{ status: receipt.status, revision: receipt.revision }]);
        }
        if (sql.includes('FROM "accounts"')) {
          return Promise.resolve([{ id: 'acct-x' }]);
        }
        throw new Error(`Unexpected query: ${sql}`);
      });
      cashPaymentsService.createAndPostInternal.mockImplementation(
        (args: { amount: number }) => {
          coa156 += args.amount;
          fundBalance -= args.amount; // paying more out drains the fund further
          return Promise.resolve({
            voucherId: 'cp-x',
            voucherNumber: 'PC000x',
            cashMovementId: 'cm-x',
            journalEntryId: 'je-x',
          });
        },
      );
      cashReceiptsService.createAndPostInternal.mockImplementation(
        (args: { amount: number }) => {
          coa156 -= args.amount;
          fundBalance += args.amount; // refunding brings money back into the fund
          return Promise.resolve({
            voucherId: 'cr-x',
            voucherNumber: 'PT000x',
            cashMovementId: 'cm-y',
            journalEntryId: 'je-y',
          });
        },
      );
      stockLedger.recordBatchMovements.mockImplementation(
        (movements: { quantity: number; lineValue?: number }[]) => {
          ledger.push(...movements);
          return Promise.resolve([]);
        },
      );
      txManager.save.mockImplementation((_entity: unknown, rows: unknown) => {
        receipt.lines = rows as typeof receipt.lines;
        return Promise.resolve(rows);
      });
      txManager.update.mockImplementation(
        (_entity: unknown, _id: string, patch: Record<string, unknown>) => {
          Object.assign(receipt, patch);
          return Promise.resolve(undefined);
        },
      );
    });

    it('holds INV-1/2/3 through edit-down, edit-up and cancel', async () => {
      assertInvariants();

      // 1. Edit down: 10 -> 6 @ 100 = 600. The fund is refunded 400.
      await service.update(
        'receipt-cash-lifecycle',
        { lines: [{ itemId: 'item-1', locationId: 'loc-A01', uomCode: 'pcs', quantity: 6, unitPrice: 100 }] },
        actor,
      );
      assertInvariants();
      expect(fundBalance).toBe(-600);

      // 2. Edit up: 6 -> 9 @ 100 = 900. The fund pays out another 300.
      await service.update(
        'receipt-cash-lifecycle',
        { lines: [{ itemId: 'item-1', locationId: 'loc-A01', uomCode: 'pcs', quantity: 9, unitPrice: 100 }] },
        actor,
      );
      assertInvariants();
      expect(fundBalance).toBe(-900);

      // 3. Cancel: the fund is refunded the full remaining 900, back to zero —
      //    exactly what it held before this receipt ever existed.
      await service.cancel('receipt-cash-lifecycle', actor);
      expect(ledger.reduce((s, m) => s + m.quantity, 0)).toBe(0);
      expect(coa156).toBe(0);
      expect(fundBalance).toBe(0);
    });
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

  describe('getLines (T-01-02)', () => {
    it('returns a paginated page of lines with hasMore=true when more remain', async () => {
      receiptRepo.findOne.mockResolvedValue({ id: 'receipt-1' });
      const items = [{ id: 'line-1' }, { id: 'line-2' }];
      lineRepo.findAndCount.mockResolvedValue([items, 5]);

      const result = await service.getLines('receipt-1', actor, 1, 2);

      expect(receiptRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: 'receipt-1',
          organizationId: actor.organizationId,
          branchId: actor.branchId,
        },
        loadEagerRelations: false,
      });
      expect(lineRepo.findAndCount).toHaveBeenCalledWith({
        where: { goodsReceiptId: 'receipt-1', organizationId: actor.organizationId },
        order: { createdAt: 'ASC' },
        skip: 0,
        take: 2,
      });
      expect(result).toEqual({
        items,
        page: 1,
        pageSize: 2,
        hasMore: true,
        total: 5,
      });
    });

    it('reports hasMore=false on the last page', async () => {
      receiptRepo.findOne.mockResolvedValue({ id: 'receipt-1' });
      lineRepo.findAndCount.mockResolvedValue([[{ id: 'line-5' }], 5]);

      const result = await service.getLines('receipt-1', actor, 3, 2);

      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(5);
    });

    it('returns an empty page for a document with zero lines, not an error', async () => {
      receiptRepo.findOne.mockResolvedValue({ id: 'receipt-1' });
      lineRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getLines('receipt-1', actor, 1, 20);

      expect(result).toEqual({ items: [], page: 1, pageSize: 20, hasMore: false, total: 0 });
    });

    it('404s for a nonexistent or out-of-scope receipt, without touching lineRepo', async () => {
      receiptRepo.findOne.mockResolvedValue(null);

      await expect(service.getLines('missing', actor, 1, 20)).rejects.toThrow();
      expect(lineRepo.findAndCount).not.toHaveBeenCalled();
    });
  });
});
