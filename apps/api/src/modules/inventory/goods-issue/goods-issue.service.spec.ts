import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  DocCounterpartyKind,
  GoodsIssuePurpose,
  GoodsIssueReferenceType,
  GoodsIssueStatus,
  StockMovementType,
} from '@erp/shared-interfaces';
import { GoodsIssueService } from './goods-issue.service';
import { GoodsIssueEntity } from './goods-issue.entity';
import { GoodsIssueLineEntity } from './goods-issue-line.entity';
import { IssueReasonEntity } from '../issue-reason/issue-reason.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { TransferOrderService } from '../transfer-order/transfer-order.service';
import { RbacService } from '../../rbac/rbac.service';

describe('GoodsIssueService', () => {
  let service: GoodsIssueService;
  let giRepo: Record<string, jest.Mock>;
  let branchRepo: Record<string, jest.Mock>;
  let dataSource: Record<string, any>;
  let ledgerService: Record<string, jest.Mock>;
  let transferOrderService: Record<string, jest.Mock>;
  let rbacService: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-A',
    roles: [],
    permissions: [],
  };

  beforeEach(async () => {
    giRepo = {
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockImplementation((d) => Promise.resolve({ ...d, id: 'gi-1' })),
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    branchRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'branch-B', name: 'Cần Thơ' }),
    };
    const manager = {
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn(),
      // FOR UPDATE row-lock query in update()/cancel(); most tests post a
      // fresh POSTED, revision-0 issue and don't care about this beyond it
      // resolving to something iterable — override per test when it matters.
      query: jest.fn().mockResolvedValue([{ status: GoodsIssueStatus.POSTED, revision: 0 }]),
      delete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation((_entity, rows) => Promise.resolve(rows)),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(manager)),
      manager,
      _manager: manager,
    };
    ledgerService = {
      getInstantAverageCost: jest.fn(),
      recordBatchMovements: jest.fn().mockResolvedValue([{ id: 'ledger-1' }]),
      publishMovementEvents: jest.fn().mockResolvedValue(undefined),
    };
    transferOrderService = {
      assertExportIssueCanBeCancelled: jest.fn().mockResolvedValue(undefined),
      cancelFromExportIssue: jest.fn().mockResolvedValue(undefined),
      applyLegRevision: jest.fn().mockResolvedValue(undefined),
    };
    // Default: actor holds every purpose permission so unrelated create() tests
    // are unaffected; the enforcement block below overrides per-case.
    rbacService = {
      hasPermission: jest.fn().mockResolvedValue(true),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        GoodsIssueService,
        { provide: getRepositoryToken(GoodsIssueEntity), useValue: giRepo },
        {
          provide: getRepositoryToken(IssueReasonEntity),
          useValue: { findOne: jest.fn() },
        },
        { provide: getRepositoryToken(BranchEntity), useValue: branchRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: StockLedgerService, useValue: ledgerService },
        {
          provide: DocumentNumberingService,
          useValue: { generate: jest.fn().mockResolvedValue('XK000001') },
        },
        { provide: TransferOrderService, useValue: transferOrderService },
        { provide: RbacService, useValue: rbacService },
      ],
    }).compile();

    service = moduleRef.get(GoodsIssueService);
  });

  describe('create — field round-trip', () => {
    it('persists deliverer, references and occurredAt', async () => {
      await service.create(
        {
          locationId: 'loc-A01',
          providerId: 'prov-1',
          purpose: GoodsIssuePurpose.TRANSFER_OUT,
          targetBranchId: 'branch-B',
          deliverer: 'Nguyễn Văn A',
          references: ['LDC000002', 'R-2'],
          occurredAt: '2026-06-08T14:41:00.000Z',
          notes: 'akenzy',
          lines: [{ itemId: 'item-1', locationId: 'loc-A01', quantity: 1, unitPrice: 350000 }],
        },
        actor,
      );

      const created = giRepo.create.mock.calls[0][0];
      expect(created.deliverer).toBe('Nguyễn Văn A');
      expect(created.references).toEqual(['LDC000002', 'R-2']);
      expect(created.occurredAt).toEqual(new Date('2026-06-08T14:41:00.000Z'));
      // Existing fields still flow through.
      expect(created.providerId).toBe('prov-1');
      expect(created.targetBranchId).toBe('branch-B');
    });

    it('defaults references to [] and nulls deliverer/occurredAt when omitted', async () => {
      await service.create(
        {
          locationId: 'loc-A01',
          purpose: GoodsIssuePurpose.OTHER,
          lines: [{ itemId: 'item-1', quantity: 1 }],
        },
        actor,
      );

      const created = giRepo.create.mock.calls[0][0];
      expect(created.references).toEqual([]);
      expect(created.deliverer).toBeNull();
      expect(created.occurredAt).toBeNull();
    });

    it('rejects a customer counterparty on a warehouse document', async () => {
      await expect(
        service.create(
          {
            locationId: 'loc-A01',
            counterpartyKind: DocCounterpartyKind.CUSTOMER,
            counterpartyId: 'cust-1',
            purpose: GoodsIssuePurpose.OTHER,
            lines: [{ itemId: 'item-1', quantity: 1 }],
          },
          actor,
        ),
      ).rejects.toThrow(
        'Đối tượng phiếu kho chỉ bao gồm nhà cung cấp và nhân viên',
      );
    });

    it('routes a supplier counterparty to provider_id', async () => {
      (dataSource.manager.findOne as jest.Mock).mockResolvedValue({ id: 'prov-1' });
      await service.create(
        {
          locationId: 'loc-A01',
          counterpartyKind: DocCounterpartyKind.SUPPLIER,
          counterpartyId: 'prov-1',
          purpose: GoodsIssuePurpose.OTHER,
          lines: [{ itemId: 'item-1', quantity: 1 }],
        },
        actor,
      );
      const created = giRepo.create.mock.calls[0][0];
      expect(created.providerId).toBe('prov-1');
      expect(created.counterpartyKind).toBe(DocCounterpartyKind.SUPPLIER);
      expect(created.counterpartyId).toBe('prov-1');
    });

    it('rejects a counterparty that does not exist in the org', async () => {
      (dataSource.manager.findOne as jest.Mock).mockResolvedValue(null);
      await expect(
        service.create(
          {
            locationId: 'loc-A01',
            counterpartyKind: DocCounterpartyKind.SUPPLIER,
            counterpartyId: 'missing',
            purpose: GoodsIssuePurpose.OTHER,
            lines: [{ itemId: 'item-1', quantity: 1 }],
          },
          actor,
        ),
      ).rejects.toThrow('Supplier counterparty not found in organization');
    });

    it('rejects a transfer to the active branch', async () => {
      await expect(
        service.create(
          {
            locationId: 'loc-A01',
            purpose: GoodsIssuePurpose.TRANSFER_OUT,
            targetBranchId: actor.branchId,
            lines: [{ itemId: 'item-1', quantity: 1 }],
          },
          actor,
        ),
      ).rejects.toThrow('Cửa hàng đích phải khác cửa hàng hiện tại');

      expect(branchRepo.findOne).not.toHaveBeenCalled();
      expect(giRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('create — purpose permission enforcement', () => {
    it('rejects DISPOSAL when the actor lacks inventory.goods-issue.disposal', async () => {
      rbacService.hasPermission.mockResolvedValue(false);

      await expect(
        service.create(
          {
            locationId: 'loc-A01',
            purpose: GoodsIssuePurpose.DISPOSAL,
            lines: [{ itemId: 'item-1', quantity: 1 }],
          },
          actor,
        ),
      ).rejects.toThrow('Missing permission for goods issue purpose DISPOSAL');

      expect(rbacService.hasPermission).toHaveBeenCalledWith(
        actor.userId,
        actor.organizationId,
        'inventory.goods-issue.disposal',
      );
      expect(giRepo.save).not.toHaveBeenCalled();
    });

    it('rejects OTHER when the actor lacks inventory.goods-issue.other-issue', async () => {
      rbacService.hasPermission.mockResolvedValue(false);

      await expect(
        service.create(
          {
            locationId: 'loc-A01',
            purpose: GoodsIssuePurpose.OTHER,
            lines: [{ itemId: 'item-1', quantity: 1 }],
          },
          actor,
        ),
      ).rejects.toThrow('Missing permission for goods issue purpose OTHER');

      expect(rbacService.hasPermission).toHaveBeenCalledWith(
        actor.userId,
        actor.organizationId,
        'inventory.goods-issue.other-issue',
      );
      expect(giRepo.save).not.toHaveBeenCalled();
    });

    it('allows TRANSFER_OUT without any special key (base guard only)', async () => {
      rbacService.hasPermission.mockResolvedValue(false);

      await service.create(
        {
          locationId: 'loc-A01',
          purpose: GoodsIssuePurpose.TRANSFER_OUT,
          targetBranchId: 'branch-B',
          lines: [{ itemId: 'item-1', quantity: 1 }],
        },
        actor,
      );

      // TRANSFER_OUT is never gated, so the permission service is not consulted.
      expect(rbacService.hasPermission).not.toHaveBeenCalled();
      expect(giRepo.save).toHaveBeenCalled();
    });

    it('creates a DISPOSAL issue once the disposal key is granted', async () => {
      rbacService.hasPermission.mockResolvedValue(true);

      await service.create(
        {
          locationId: 'loc-A01',
          purpose: GoodsIssuePurpose.DISPOSAL,
          lines: [{ itemId: 'item-1', quantity: 1 }],
        },
        actor,
      );

      expect(giRepo.save).toHaveBeenCalled();
    });
  });

  describe('post — instantaneous average cost', () => {
    it('overrides client prices per SKU and writes the ledger in the posting transaction', async () => {
      const issue = {
        id: 'gi-1',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        documentNumber: 'XK000001',
        status: GoodsIssueStatus.DRAFT,
        lines: [
          { id: 'line-1', itemId: 'item-1', locationId: 'loc-A', quantity: 2, unitPrice: '1' },
          { id: 'line-2', itemId: 'item-1', locationId: 'loc-B', quantity: 3, unitPrice: '2' },
        ],
      };
      giRepo.findOne.mockResolvedValue(issue);
      ledgerService.getInstantAverageCost.mockResolvedValue({ unitCost: 215000 });

      await service.post(issue.id, actor);

      expect(ledgerService.getInstantAverageCost).toHaveBeenCalledTimes(1);
      expect(ledgerService.getInstantAverageCost).toHaveBeenCalledWith(
        'item-1',
        actor.organizationId,
        actor.branchId,
      );
      expect((dataSource._manager as any).update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'line-1' },
        { unitPrice: '215000.00', lineTotal: '430000.00' },
      );
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ itemId: 'item-1', quantity: -2, unitCost: 215000 }),
          expect.objectContaining({ itemId: 'item-1', quantity: -3, unitCost: 215000 }),
        ]),
        dataSource._manager,
      );
      expect(ledgerService.publishMovementEvents).toHaveBeenCalledWith([
        { id: 'ledger-1' },
      ]);
    });
  });

  describe('cancel — transfer order cascade', () => {
    const postedTransferIssue = {
      id: 'gi-1',
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      documentNumber: 'XK000001',
      status: GoodsIssueStatus.POSTED,
      referenceType: GoodsIssueReferenceType.TRANSFER_ORDER,
      referenceId: 'to-1',
      lines: [
        { itemId: 'item-1', locationId: 'loc-A', quantity: 2, unitPrice: '1000' },
      ],
    };

    it('reverses source stock and cascades to the linked transfer order', async () => {
      giRepo.findOne.mockResolvedValue({ ...postedTransferIssue });

      await service.cancel('gi-1', actor);

      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            itemId: 'item-1',
            quantity: 2,
            movementType: StockMovementType.ADJUSTMENT_INCREASE,
          }),
        ]),
        expect.anything(),
      );
      expect(transferOrderService.cancelFromExportIssue).toHaveBeenCalledWith(
        'to-1',
        actor,
      );
    });

    it('does not reverse stock when the linked transfer already has an import receipt', async () => {
      giRepo.findOne.mockResolvedValue({ ...postedTransferIssue });
      transferOrderService.assertExportIssueCanBeCancelled.mockRejectedValueOnce(
        new ConflictException(
          'Phiếu xuất đã có phiếu nhập tham chiếu, vui lòng xoá phiếu nhập trước',
        ),
      );

      await expect(service.cancel('gi-1', actor)).rejects.toBeInstanceOf(
        ConflictException,
      );

      expect(ledgerService.recordBatchMovements).not.toHaveBeenCalled();
      expect(giRepo.save).not.toHaveBeenCalled();
      expect(transferOrderService.cancelFromExportIssue).not.toHaveBeenCalled();
    });

    it('does not cascade when cascadeTransferOrder is false', async () => {
      giRepo.findOne.mockResolvedValue({ ...postedTransferIssue });

      await service.cancel('gi-1', actor, { cascadeTransferOrder: false });

      expect(transferOrderService.cancelFromExportIssue).not.toHaveBeenCalled();
    });

    it('does not cascade for an issue not linked to a transfer order', async () => {
      giRepo.findOne.mockResolvedValue({
        ...postedTransferIssue,
        referenceType: null,
        referenceId: null,
      });

      await service.cancel('gi-1', actor);

      expect(transferOrderService.cancelFromExportIssue).not.toHaveBeenCalled();
    });

    it('reverses the full line at its already-posted cost (INV-1/INV-2 to 0) (T-04-04)', async () => {
      giRepo.findOne.mockResolvedValue({ ...postedTransferIssue });

      await service.cancel('gi-1', actor);

      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            itemId: 'item-1',
            quantity: 2,
            lineValue: 2000, // reversed at the posted unitPrice (1000), not a fresh average
            unitCost: 1000,
          }),
        ],
        dataSource._manager,
      );
      expect(dataSource._manager.update).toHaveBeenCalledWith(
        GoodsIssueEntity,
        'gi-1',
        expect.objectContaining({ status: GoodsIssueStatus.CANCELLED, revision: 1 }),
      );
    });

    it('rejects a second concurrent cancel and reverses stock exactly once (T-04-04)', async () => {
      giRepo.findOne.mockResolvedValue({ ...postedTransferIssue });
      let calls = 0;
      dataSource._manager.query.mockImplementation(() => {
        calls += 1;
        return Promise.resolve([
          { status: GoodsIssueStatus.POSTED, revision: calls === 1 ? 0 : 1 },
        ]);
      });

      const outcomes = await Promise.allSettled([
        service.cancel('gi-1', actor),
        service.cancel('gi-1', actor),
      ]);

      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(1);
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledTimes(1);
    });
  });

  describe('update on a posted issue', () => {
    /** A posted, unsettled issue: one line, 10 units at 80. */
    function postedIssue(overrides: Record<string, unknown> = {}) {
      return {
        id: 'gi-9',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        status: GoodsIssueStatus.POSTED,
        purpose: GoodsIssuePurpose.OTHER,
        documentNumber: 'XK0009',
        revision: 0,
        locationId: 'loc-A01',
        references: [],
        lines: [
          { itemId: 'item-1', locationId: 'loc-A01', quantity: 10, unitPrice: '80.00' },
        ],
        ...overrides,
      };
    }

    const editedLines = [
      { itemId: 'item-1', locationId: 'loc-A01', quantity: 7, unitPrice: 80 },
    ];

    beforeEach(() => {
      dataSource._manager.query.mockResolvedValue([
        { status: GoodsIssueStatus.POSTED, revision: 0 },
      ]);
      // Only consulted when a line's issued quantity goes up (T-04-02).
      ledgerService.getInstantAverageCost.mockResolvedValue({
        itemId: 'item-1',
        branchId: 'branch-A',
        quantity: 100,
        inventoryValue: 9000,
        unitCost: 90,
        source: 'LEDGER',
      });
    });

    it('writes one ledger adjustment with the ledger-side sign flipped', async () => {
      giRepo.findOne.mockResolvedValue(postedIssue());

      await service.update('gi-9', { lines: editedLines }, actor);

      // Line quantity drops by 3 (10 -> 7); the ledger, which stores issues as
      // negative, moves the opposite way: +3 (less stock leaves).
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            itemId: 'item-1',
            quantity: 3,
            lineValue: 240,
            movementType: StockMovementType.ADJUSTMENT_INCREASE,
            referenceType: 'GOODS_ISSUE',
            referenceId: 'gi-9',
          }),
        ],
        dataSource._manager,
      );
      expect(dataSource._manager.update).toHaveBeenCalledWith(
        GoodsIssueEntity,
        'gi-9',
        expect.objectContaining({ revision: 1 }),
      );
    });

    it('writes a negative-ledger adjustment, costed at today\'s average, when the issued quantity increases', async () => {
      giRepo.findOne.mockResolvedValue(postedIssue());

      await service.update(
        'gi-9',
        { lines: [{ ...editedLines[0], quantity: 13 }] }, // 10 -> 13: +3 issued
        actor,
      );

      // T-04-02: the extra 3 units are costed at today's average (90), not the
      // 80 the line was originally posted at.
      expect(ledgerService.getInstantAverageCost).toHaveBeenCalledWith(
        'item-1',
        actor.organizationId,
        'branch-A',
      );
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            quantity: -3,
            lineValue: -270,
            unitCost: 90,
            movementType: StockMovementType.ADJUSTMENT_DECREASE,
          }),
        ],
        dataSource._manager,
      );
      // The line is re-priced to the blended average across both cost bases:
      // (10 @ 80 + 3 @ 90) / 13 = 1070 / 13 ≈ 82.31.
      expect(dataSource._manager.save).toHaveBeenCalledWith(
        GoodsIssueLineEntity,
        [expect.objectContaining({ unitPrice: '82.31', lineTotal: '1070.00' })],
      );
    });

    it('leaves the ledger alone when only header fields change', async () => {
      giRepo.findOne.mockResolvedValue(postedIssue());

      await service.update('gi-9', { notes: 'ghi chú mới' }, actor);

      expect(ledgerService.recordBatchMovements).not.toHaveBeenCalled();
      expect(dataSource._manager.update).toHaveBeenCalledWith(
        GoodsIssueEntity,
        'gi-9',
        expect.objectContaining({ notes: 'ghi chú mới' }),
      );
    });

    it('rejects the edit when another request already revised the issue', async () => {
      giRepo.findOne.mockResolvedValue(postedIssue());
      dataSource._manager.query.mockResolvedValue([
        { status: GoodsIssueStatus.POSTED, revision: 1 },
      ]);

      await expect(
        service.update('gi-9', { lines: editedLines }, actor),
      ).rejects.toThrow('modified by another request');
      expect(ledgerService.recordBatchMovements).not.toHaveBeenCalled();
    });

    it('rejects an edit on a cancelled issue', async () => {
      giRepo.findOne.mockResolvedValue(postedIssue({ status: GoodsIssueStatus.CANCELLED }));

      await expect(
        service.update('gi-9', { lines: editedLines }, actor),
      ).rejects.toThrow('can no longer be edited');
    });

    it('allows an edit that drives stock negative', async () => {
      giRepo.findOne.mockResolvedValue(postedIssue());

      await service.update(
        'gi-9',
        { lines: [{ ...editedLines[0], quantity: 50 }] },
        actor,
      );

      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        [expect.objectContaining({ quantity: -40 })],
        dataSource._manager,
      );
    });

    it('does not blow up dividing by zero when the item has never had a cost (T-04-02)', async () => {
      giRepo.findOne.mockResolvedValue(postedIssue());
      ledgerService.getInstantAverageCost.mockResolvedValue({
        itemId: 'item-1',
        branchId: 'branch-A',
        quantity: 0,
        inventoryValue: 0,
        unitCost: 0,
        source: 'PURCHASE_PRICE_FALLBACK',
      });

      await service.update(
        'gi-9',
        { lines: [{ ...editedLines[0], quantity: 13 }] },
        actor,
      );

      expect(dataSource._manager.save).toHaveBeenCalledWith(
        GoodsIssueLineEntity,
        [expect.objectContaining({ unitPrice: '61.54' })], // (10*80 + 0) / 13
      );
    });

    it('rejects changing the reason for a purpose that does not carry one', async () => {
      giRepo.findOne.mockResolvedValue(
        postedIssue({ purpose: GoodsIssuePurpose.SALE }),
      );

      await expect(
        service.update('gi-9', { reasonId: 'reason-1' }, actor),
      ).rejects.toThrow('Không thể đổi lý do');
    });

    it('reverses a removed line and posts an added one', async () => {
      giRepo.findOne.mockResolvedValue(postedIssue());

      await service.update(
        'gi-9',
        {
          lines: [{ itemId: 'item-2', locationId: 'loc-A01', quantity: 4, unitPrice: 25 }],
        },
        actor,
      );

      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        [
          // Removed line reverses at its own already-posted price (80).
          expect.objectContaining({ itemId: 'item-1', quantity: 10, lineValue: 800 }),
          // Added line is a full increase, costed at today's average (90) —
          // the 25 the request sent for item-2 is not used (T-04-02).
          expect.objectContaining({ itemId: 'item-2', quantity: -4, lineValue: -360, unitCost: 90 }),
        ],
        dataSource._manager,
      );
    });

    it('holds INV-1 (ledger quantity matches the line) through two consecutive edits', async () => {
      // Mutable stand-in for "the books": every movement handed to the ledger.
      const ledger: { itemId: string; quantity: number }[] = [
        { itemId: 'item-1', quantity: -10 }, // original posting: 10 issued
      ];
      const issue = postedIssue();
      giRepo.findOne.mockImplementation(() => Promise.resolve({ ...issue }));
      dataSource._manager.query.mockImplementation(() =>
        Promise.resolve([{ status: issue.status, revision: issue.revision }]),
      );
      ledgerService.recordBatchMovements.mockImplementation(
        (movements: { itemId: string; quantity: number }[]) => {
          ledger.push(...movements);
          return Promise.resolve([]);
        },
      );
      dataSource._manager.save.mockImplementation((_entity: unknown, rows: unknown) => {
        issue.lines = rows as typeof issue.lines;
        return Promise.resolve(rows);
      });
      dataSource._manager.update.mockImplementation(
        (_entity: unknown, _id: string, patch: Record<string, unknown>) => {
          Object.assign(issue, patch);
          return Promise.resolve(undefined);
        },
      );

      function assertInv1() {
        const ledgerQty = ledger
          .filter((m) => m.itemId === 'item-1')
          .reduce((s, m) => s + m.quantity, 0);
        const lineQty = (issue.lines as { itemId: string; quantity: number }[])
          .filter((l) => l.itemId === 'item-1')
          .reduce((s, l) => s + l.quantity, 0);
        expect(ledgerQty).toBe(-lineQty);
      }

      assertInv1();
      await service.update(
        'gi-9',
        { lines: [{ itemId: 'item-1', locationId: 'loc-A01', quantity: 6, unitPrice: 80 }] },
        actor,
      );
      assertInv1();
      await service.update(
        'gi-9',
        { lines: [{ itemId: 'item-1', locationId: 'loc-A01', quantity: 15, unitPrice: 80 }] },
        actor,
      );
      assertInv1();
    });

    it('cascades an edit to the linked transfer order (T-05-02)', async () => {
      giRepo.findOne.mockResolvedValue(
        postedIssue({
          referenceType: GoodsIssueReferenceType.TRANSFER_ORDER,
          referenceId: 'to-1',
        }),
      );

      await service.update('gi-9', { lines: editedLines }, actor); // 10 -> 7

      expect(transferOrderService.applyLegRevision).toHaveBeenCalledWith(
        'to-1',
        [expect.objectContaining({ itemId: 'item-1', quantityDelta: -3 })],
        actor,
        'export',
      );
    });

    it('does not cascade when cascadeTransferOrder is false — the loop-breaker (T-05-02)', async () => {
      giRepo.findOne.mockResolvedValue(
        postedIssue({
          referenceType: GoodsIssueReferenceType.TRANSFER_ORDER,
          referenceId: 'to-1',
        }),
      );

      await service.update(
        'gi-9',
        { lines: editedLines },
        actor,
        { cascadeTransferOrder: false },
      );

      expect(transferOrderService.applyLegRevision).not.toHaveBeenCalled();
    });

    it('does not cascade when the issue is not linked to a transfer order', async () => {
      giRepo.findOne.mockResolvedValue(postedIssue());

      await service.update('gi-9', { lines: editedLines }, actor);

      expect(transferOrderService.applyLegRevision).not.toHaveBeenCalled();
    });
  });

  describe('full lifecycle: post, edit up, edit down, cancel (T-04-05)', () => {
    it('holds INV-1/INV-2 through a moving average, two edits and a cancel', async () => {
      // "The books": every movement handed to the ledger, plus a running
      // average cost that changes independently of this issue (a purchase
      // came in at a higher price between the two edits).
      const ledger: { itemId: string; quantity: number; lineValue?: number }[] = [
        { itemId: 'item-1', quantity: -5, lineValue: -400 }, // posted: 5 @ 80
      ];
      const issue = {
        id: 'gi-lifecycle',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        status: GoodsIssueStatus.POSTED,
        purpose: GoodsIssuePurpose.OTHER,
        documentNumber: 'XK0099',
        revision: 0,
        locationId: 'loc-A01',
        references: [],
        lines: [
          { itemId: 'item-1', locationId: 'loc-A01', quantity: 5, unitPrice: '80.00' },
        ],
      };

      giRepo.findOne.mockImplementation(() => Promise.resolve({ ...issue }));
      dataSource._manager.query.mockImplementation(() =>
        Promise.resolve([{ status: issue.status, revision: issue.revision }]),
      );
      ledgerService.recordBatchMovements.mockImplementation(
        (movements: { itemId: string; quantity: number; lineValue?: number }[]) => {
          ledger.push(...movements);
          return Promise.resolve([]);
        },
      );
      dataSource._manager.save.mockImplementation((_entity: unknown, rows: unknown) => {
        issue.lines = rows as typeof issue.lines;
        return Promise.resolve(rows);
      });
      dataSource._manager.update.mockImplementation(
        (_entity: unknown, _id: string, patch: Record<string, unknown>) => {
          Object.assign(issue, patch);
          return Promise.resolve(undefined);
        },
      );

      function assertInvariants() {
        const ledgerQty = ledger
          .filter((m) => m.itemId === 'item-1')
          .reduce((s, m) => s + m.quantity, 0);
        const ledgerValue = ledger
          .filter((m) => m.itemId === 'item-1')
          .reduce((s, m) => s + (m.lineValue ?? 0), 0);
        const line = (issue.lines as { itemId: string; quantity: string | number }[]).find(
          (l) => l.itemId === 'item-1',
        );
        const lineQty = line ? Number(line.quantity) : 0;
        expect(ledgerQty).toBeCloseTo(-lineQty, 3);
        // The header's own value: quantity × its (possibly blended) unitPrice.
        const lineValue = line
          ? Number(line.quantity) *
            Number((issue.lines as { unitPrice: string }[])[0].unitPrice)
          : 0;
        expect(ledgerValue).toBeCloseTo(-lineValue, 2);
      }

      assertInvariants();

      // 1. Average cost rises to 100 (a purchase came in higher), then edit up: 5 -> 8.
      ledgerService.getInstantAverageCost.mockResolvedValue({
        itemId: 'item-1',
        branchId: 'branch-A',
        quantity: 50,
        inventoryValue: 5000,
        unitCost: 100,
        source: 'LEDGER',
      });
      await service.update(
        'gi-lifecycle',
        { lines: [{ itemId: 'item-1', locationId: 'loc-A01', quantity: 8, unitPrice: 999 }] },
        actor,
      );
      assertInvariants();
      expect(issue.revision).toBe(1);

      // 2. Edit down: 8 -> 3. The reversed 5 units unwind at the *blended*
      // price this line now carries — not the original 80 nor the new 100 —
      // because the line was re-priced to a single weighted average in step 1.
      await service.update(
        'gi-lifecycle',
        { lines: [{ itemId: 'item-1', locationId: 'loc-A01', quantity: 3, unitPrice: 999 }] },
        actor,
      );
      assertInvariants();
      expect(issue.revision).toBe(2);

      // 3. Cancel: everything unwinds to zero.
      await service.cancel('gi-lifecycle', actor);
      expect(ledger.reduce((s, m) => s + m.quantity, 0)).toBe(0);
      expect(ledger.reduce((s, m) => s + (m.lineValue ?? 0), 0)).toBeCloseTo(0, 2);
    });
  });

  it('scopes detail lookup to the active branch', async () => {
    giRepo.findOne.mockResolvedValue(null);

    await expect(service.getById('gi-1', actor)).rejects.toThrow();

    expect(giRepo.findOne).toHaveBeenCalledWith({
      where: {
        id: 'gi-1',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
      },
    });
  });
});
