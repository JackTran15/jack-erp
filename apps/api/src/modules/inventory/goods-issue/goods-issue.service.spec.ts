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
  let giRepo: Record<string, any>;
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
      manager: { findAndCount: jest.fn() },
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
      assertExportIssueCanBeEdited: jest.fn().mockResolvedValue(undefined),
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

  describe('post — per-line cost basis (AC-01, AC-03)', () => {
    it('keeps two different prices for the same SKU instead of averaging them (AC-01)', async () => {
      // The bug this replaces: both lines used to be rewritten to the item's
      // branch-wide average, so 350k and 340k both came back as 342,941.
      const issue = {
        id: 'gi-1',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        documentNumber: 'XK000001',
        status: GoodsIssueStatus.DRAFT,
        lines: [
          { id: 'line-1', itemId: 'item-1', locationId: 'loc-A', quantity: 30, unitPrice: '350000' },
          { id: 'line-2', itemId: 'item-1', locationId: 'loc-A', quantity: 60, unitPrice: '340000' },
        ],
      };
      giRepo.findOne.mockResolvedValue(issue);
      // Deliberately the number the old behaviour produced — if the override
      // ever comes back, it shows up here rather than in production.
      ledgerService.getInstantAverageCost.mockResolvedValue({ unitCost: 342941 });

      await service.post(issue.id, actor);

      // Every line carried a price, so the ledger is never consulted for an average.
      expect(ledgerService.getInstantAverageCost).not.toHaveBeenCalled();
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        [
          expect.objectContaining({ itemId: 'item-1', quantity: -30, unitCost: 350000 }),
          expect.objectContaining({ itemId: 'item-1', quantity: -60, unitCost: 340000 }),
        ],
        dataSource._manager,
      );
    });

    it('leaves a priced line untouched — no rewrite, no no-op UPDATE (AC-01)', async () => {
      const issue = {
        id: 'gi-1',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        documentNumber: 'XK000001',
        status: GoodsIssueStatus.DRAFT,
        lines: [
          { id: 'line-1', itemId: 'item-1', locationId: 'loc-A', quantity: 30, unitPrice: '350000' },
        ],
      };
      giRepo.findOne.mockResolvedValue(issue);

      await service.post(issue.id, actor);

      expect((dataSource._manager as any).update).not.toHaveBeenCalledWith(
        expect.anything(),
        { id: 'line-1' },
        expect.anything(),
      );
    });

    it('fills a blank price from the instant average and writes it back (AC-03)', async () => {
      const issue = {
        id: 'gi-1',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        documentNumber: 'XK000001',
        status: GoodsIssueStatus.DRAFT,
        lines: [
          { id: 'line-1', itemId: 'item-1', locationId: 'loc-A', quantity: 30, unitPrice: '0' },
        ],
      };
      giRepo.findOne.mockResolvedValue(issue);
      ledgerService.getInstantAverageCost.mockResolvedValue({ unitCost: 200000 });

      await service.post(issue.id, actor);

      expect(ledgerService.getInstantAverageCost).toHaveBeenCalledWith(
        'item-1',
        actor.organizationId,
        actor.branchId,
      );
      // The resolved cost is written back, so the line never displays as 0.
      expect((dataSource._manager as any).update).toHaveBeenCalledWith(
        expect.anything(),
        { id: 'line-1' },
        { unitPrice: '200000.00', lineTotal: '6000000.00' },
      );
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        [expect.objectContaining({ quantity: -30, unitCost: 200000 })],
        dataSource._manager,
      );
    });

    it('looks the average up once per item, however many blank lines share it (AC-03)', async () => {
      const issue = {
        id: 'gi-1',
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        documentNumber: 'XK000001',
        status: GoodsIssueStatus.DRAFT,
        lines: [
          { id: 'line-1', itemId: 'item-1', locationId: 'loc-A', quantity: 30, unitPrice: '350000' },
          { id: 'line-2', itemId: 'item-1', locationId: 'loc-A', quantity: 60, unitPrice: '0' },
          { id: 'line-3', itemId: 'item-1', locationId: 'loc-B', quantity: 10, unitPrice: '0' },
          { id: 'line-4', itemId: 'item-2', locationId: 'loc-A', quantity: 5, unitPrice: '120000' },
        ],
      };
      giRepo.findOne.mockResolvedValue(issue);
      ledgerService.getInstantAverageCost.mockResolvedValue({ unitCost: 200000 });

      await service.post(issue.id, actor);

      // item-1 has two blank lines → one lookup; item-2 is fully priced → none.
      expect(ledgerService.getInstantAverageCost).toHaveBeenCalledTimes(1);
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        [
          expect.objectContaining({ quantity: -30, unitCost: 350000 }),
          expect.objectContaining({ quantity: -60, unitCost: 200000 }),
          expect.objectContaining({ quantity: -10, unitCost: 200000 }),
          expect.objectContaining({ quantity: -5, unitCost: 120000 }),
        ],
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

    it("costs a quantity increase at the line's own price, not today's average (AC-07)", async () => {
      giRepo.findOne.mockResolvedValue(postedIssue());

      await service.update(
        'gi-9',
        { lines: [{ ...editedLines[0], quantity: 13 }] }, // 10 -> 13: +3 issued
        actor,
      );

      // ADR-03 replaced the old rule (extra units costed at today's average, 90).
      // The line carries a price, so the average is never consulted at all.
      expect(ledgerService.getInstantAverageCost).not.toHaveBeenCalled();
      expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            quantity: -3,
            lineValue: -240, // 3 × 80, the line's own price
            unitCost: 80,
            movementType: StockMovementType.ADJUSTMENT_DECREASE,
          }),
        ],
        dataSource._manager,
      );
      // No re-pricing pass any more: the line keeps exactly what was submitted.
      expect(dataSource._manager.save).toHaveBeenCalledWith(
        GoodsIssueLineEntity,
        [expect.objectContaining({ unitPrice: '80.00', lineTotal: '1040.00' })],
      );
    });

    it('resolves a blank price to the average and stays finite when the item was never costed', async () => {
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
        { lines: [{ ...editedLines[0], quantity: 13, unitPrice: 0 }] },
        actor,
      );

      expect(ledgerService.getInstantAverageCost).toHaveBeenCalledWith(
        'item-1',
        actor.organizationId,
        'branch-A',
      );
      expect(dataSource._manager.save).toHaveBeenCalledWith(
        GoodsIssueLineEntity,
        [expect.objectContaining({ unitPrice: '0.00', lineTotal: '0.00' })],
      );
      const [movements] = ledgerService.recordBatchMovements.mock.calls[0] as [
        { quantity: number; lineValue: number; unitCost: number }[],
      ];
      for (const movement of movements) {
        expect(Number.isFinite(movement.quantity)).toBe(true);
        expect(Number.isFinite(movement.lineValue)).toBe(true);
        expect(Number.isFinite(movement.unitCost)).toBe(true);
      }
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
          // Added line is costed at the 25 the request sent for item-2 — under
          // ADR-03 a submitted price is the cost basis, so today's average (90)
          // is not consulted.
          expect.objectContaining({ itemId: 'item-2', quantity: -4, lineValue: -100, unitCost: 25 }),
        ],
        dataSource._manager,
      );
    });

    describe('two lines, same SKU, same warehouse — the reported defect (AC-05..08, AC-12)', () => {
      /**
       * The voucher from the bug report: DD780 issued twice from KHO SG at two
       * prices. 30 × 350.000 + 60 × 340.000 = 30.900.000. Before this feature
       * both lines came back at 342.941 — the item's branch-wide average.
       */
      function twoPriceIssue() {
        return postedIssue({
          lines: [
            { itemId: 'item-1', locationId: 'loc-A01', quantity: 30, unitPrice: '350000.00' },
            { itemId: 'item-1', locationId: 'loc-A01', quantity: 60, unitPrice: '340000.00' },
          ],
        });
      }
      const line = (quantity: number, unitPrice: number) => ({
        itemId: 'item-1',
        locationId: 'loc-A01',
        quantity,
        unitPrice,
      });

      const savedLines = () => {
        const call = dataSource._manager.save.mock.calls.find(
          (c: unknown[]) => c[0] === GoodsIssueLineEntity,
        );
        return call?.[1] as { unitPrice: string; lineTotal: string }[];
      };

      it('reverses a reduced line at its own price and leaves the other alone (AC-05)', async () => {
        giRepo.findOne.mockResolvedValue(twoPriceIssue());

        await service.update(
          'gi-9',
          { lines: [line(30, 350000), line(50, 340000)] },
          actor,
        );

        // 90 → 80 units, 30.900.000 → 27.500.000: the 10 units come back at 340.000.
        expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              itemId: 'item-1',
              quantity: 10,
              lineValue: 3_400_000,
              unitCost: 340000,
              movementType: StockMovementType.ADJUSTMENT_INCREASE,
            }),
          ],
          dataSource._manager,
        );
        expect(savedLines()).toEqual([
          expect.objectContaining({ unitPrice: '350000.00', lineTotal: '10500000.00' }),
          expect.objectContaining({ unitPrice: '340000.00', lineTotal: '17000000.00' }),
        ]);
      });

      it('costs an increase at that line\'s price, never the branch average (AC-07)', async () => {
        giRepo.findOne.mockResolvedValue(twoPriceIssue());
        // The number the old behaviour produced. If the override ever returns,
        // it surfaces here rather than in production.
        ledgerService.getInstantAverageCost.mockResolvedValue({
          itemId: 'item-1',
          branchId: 'branch-A',
          quantity: 1000,
          inventoryValue: 342_941_000,
          unitCost: 342941,
          source: 'LEDGER',
        });

        await service.update(
          'gi-9',
          { lines: [line(40, 350000), line(60, 340000)] },
          actor,
        );

        expect(ledgerService.getInstantAverageCost).not.toHaveBeenCalled();
        expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              quantity: -10,
              lineValue: -3_500_000, // 10 × 350.000, not 10 × 342.941
              unitCost: 350000,
              movementType: StockMovementType.ADJUSTMENT_DECREASE,
            }),
          ],
          dataSource._manager,
        );
        // Σ line_value = −34.400.000 = −(40 × 350.000 + 60 × 340.000)  → INV-2
        expect(savedLines()).toEqual([
          expect.objectContaining({ unitPrice: '350000.00', lineTotal: '14000000.00' }),
          expect.objectContaining({ unitPrice: '340000.00', lineTotal: '20400000.00' }),
        ]);
      });

      it('reverses a deleted line at 340.000, not at the surviving line\'s 350.000 (AC-08)', async () => {
        giRepo.findOne.mockResolvedValue(twoPriceIssue());

        await service.update('gi-9', { lines: [line(30, 350000)] }, actor);

        expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              quantity: 60,
              lineValue: 20_400_000,
              unitCost: 340000,
              movementType: StockMovementType.ADJUSTMENT_INCREASE,
            }),
          ],
          dataSource._manager,
        );
        expect(savedLines()).toEqual([
          expect.objectContaining({ unitPrice: '350000.00', lineTotal: '10500000.00' }),
        ]);
      });

      it('holds INV-2 when one edit changes both price and quantity (AC-12)', async () => {
        giRepo.findOne.mockResolvedValue(twoPriceIssue());

        await service.update(
          'gi-9',
          { lines: [line(40, 360000), line(60, 340000)] },
          actor,
        );

        // computeVoucherDelta aggregates by (item, location), so the stamped
        // unit cost is derived — |3.900.000 / 10| = 390.000 — and matches no
        // line's price. That is the known consequence recorded in ADR-03; the
        // invariant that matters is the value, asserted below.
        expect(ledgerService.recordBatchMovements).toHaveBeenCalledWith(
          [
            expect.objectContaining({
              quantity: -10,
              lineValue: -3_900_000,
              unitCost: 390000,
            }),
          ],
          dataSource._manager,
        );
        // Σ line_value = −30.900.000 − 3.900.000 = −34.800.000, and the voucher
        // is worth 40 × 360.000 + 60 × 340.000 = 34.800.000. INV-2 holds.
        expect(savedLines()).toEqual([
          expect.objectContaining({ unitPrice: '360000.00', lineTotal: '14400000.00' }),
          expect.objectContaining({ unitPrice: '340000.00', lineTotal: '20400000.00' }),
        ]);
      });

      it('resolves only the blank line, leaving its twin\'s price intact', async () => {
        giRepo.findOne.mockResolvedValue(twoPriceIssue());
        ledgerService.getInstantAverageCost.mockResolvedValue({
          itemId: 'item-1',
          branchId: 'branch-A',
          quantity: 1000,
          inventoryValue: 342_941_000,
          unitCost: 342941,
          source: 'LEDGER',
        });

        await service.update(
          'gi-9',
          { lines: [line(30, 350000), line(60, 0)] },
          actor,
        );

        expect(ledgerService.getInstantAverageCost).toHaveBeenCalledTimes(1);
        expect(savedLines()).toEqual([
          expect.objectContaining({ unitPrice: '350000.00', lineTotal: '10500000.00' }),
          expect.objectContaining({ unitPrice: '342941.00', lineTotal: '20576460.00' }),
        ]);
      });
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

    /**
     * Deleting the export leg was already blocked once the destination had
     * received it; editing was not, and the edit cascades straight into that
     * already-posted receipt.
     */
    it('refuses the edit once the destination has received the transfer', async () => {
      giRepo.findOne.mockResolvedValue(
        postedIssue({
          referenceType: GoodsIssueReferenceType.TRANSFER_ORDER,
          referenceId: 'to-1',
        }),
      );
      transferOrderService.assertExportIssueCanBeEdited.mockRejectedValueOnce(
        new ConflictException('Chi nhánh nhận đã nhập phiếu này'),
      );

      await expect(
        service.update('gi-9', { lines: editedLines }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(transferOrderService.applyLegRevision).not.toHaveBeenCalled();
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

  describe('getLines (T-02-02)', () => {
    it('returns a paginated page of lines with hasMore=true when more remain', async () => {
      giRepo.findOne.mockResolvedValue({ id: 'gi-1' });
      const items = [{ id: 'line-1' }, { id: 'line-2' }];
      giRepo.manager.findAndCount.mockResolvedValue([items, 5]);

      const result = await service.getLines('gi-1', actor, 1, 2);

      expect(giRepo.findOne).toHaveBeenCalledWith({
        where: {
          id: 'gi-1',
          organizationId: actor.organizationId,
          branchId: actor.branchId,
        },
        loadEagerRelations: false,
      });
      expect(giRepo.manager.findAndCount).toHaveBeenCalledWith(GoodsIssueLineEntity, {
        where: { goodsIssueId: 'gi-1' },
        order: { id: 'ASC' },
        skip: 0,
        take: 2,
      });
      expect(result).toEqual({ items, page: 1, pageSize: 2, hasMore: true, total: 5 });
    });

    it('reports hasMore=false on the last page', async () => {
      giRepo.findOne.mockResolvedValue({ id: 'gi-1' });
      giRepo.manager.findAndCount.mockResolvedValue([[{ id: 'line-5' }], 5]);

      const result = await service.getLines('gi-1', actor, 3, 2);

      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(5);
    });

    it('returns an empty page for an issue with zero lines, not an error', async () => {
      giRepo.findOne.mockResolvedValue({ id: 'gi-1' });
      giRepo.manager.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getLines('gi-1', actor, 1, 20);

      expect(result).toEqual({ items: [], page: 1, pageSize: 20, hasMore: false, total: 0 });
    });

    it('404s for a nonexistent or out-of-scope issue, without touching the line query', async () => {
      giRepo.findOne.mockResolvedValue(null);

      await expect(service.getLines('missing', actor, 1, 20)).rejects.toThrow();
      expect(giRepo.manager.findAndCount).not.toHaveBeenCalled();
    });
  });
});
