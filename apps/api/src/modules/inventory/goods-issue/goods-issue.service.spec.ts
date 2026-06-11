import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GoodsIssuePurpose } from '@erp/shared-interfaces';
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

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        GoodsIssueService,
        { provide: getRepositoryToken(GoodsIssueEntity), useValue: giRepo },
        {
          provide: getRepositoryToken(IssueReasonEntity),
          useValue: { findOne: jest.fn() },
        },
        { provide: getRepositoryToken(BranchEntity), useValue: branchRepo },
        { provide: DataSource, useValue: {} },
        { provide: StockLedgerService, useValue: {} },
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
});
