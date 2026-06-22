import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  DocCounterpartyKind,
  GoodsIssuePurpose,
  GoodsIssueStatus,
} from '@erp/shared-interfaces';
import { GoodsIssueService } from './goods-issue.service';
import { GoodsIssueEntity } from './goods-issue.entity';
import { IssueReasonEntity } from '../issue-reason/issue-reason.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { StockLedgerService } from '../ledger/stock-ledger.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';

describe('GoodsIssueService', () => {
  let service: GoodsIssueService;
  let giRepo: Record<string, jest.Mock>;
  let branchRepo: Record<string, jest.Mock>;
  let dataSource: Record<string, any>;
  let ledgerService: Record<string, jest.Mock>;

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

    it('routes a customer counterparty to counterparty columns, provider_id null', async () => {
      (dataSource.manager.findOne as jest.Mock).mockResolvedValue({ id: 'cust-1' });
      await service.create(
        {
          locationId: 'loc-A01',
          counterpartyKind: DocCounterpartyKind.CUSTOMER,
          counterpartyId: 'cust-1',
          purpose: GoodsIssuePurpose.OTHER,
          lines: [{ itemId: 'item-1', quantity: 1 }],
        },
        actor,
      );
      const created = giRepo.create.mock.calls[0][0];
      expect(created.providerId).toBeUndefined();
      expect(created.counterpartyKind).toBe(DocCounterpartyKind.CUSTOMER);
      expect(created.counterpartyId).toBe('cust-1');
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
            counterpartyKind: DocCounterpartyKind.CUSTOMER,
            counterpartyId: 'missing',
            purpose: GoodsIssuePurpose.OTHER,
            lines: [{ itemId: 'item-1', quantity: 1 }],
          },
          actor,
        ),
      ).rejects.toThrow('Customer counterparty not found in organization');
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
