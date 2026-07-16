import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DepositAccountStatus, DepositTransferStatus } from '@erp/shared-interfaces';
import { DepositDashboardService } from './deposit-dashboard.service';
import { DepositTransferEntity } from '../deposit-transfer/deposit-transfer.entity';
import { DepositAccountEntity } from '../../deposit/deposit-account.entity';
import { BranchEntity } from '../../../branch/branch.entity';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-a',
  branchIds: ['branch-a'],
  roles: ['admin'],
};

const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

function makeTransfer(overrides: Partial<DepositTransferEntity> = {}): DepositTransferEntity {
  return {
    id: 't-1',
    organizationId: 'org-1',
    fromBranchId: 'branch-a',
    toBranchId: 'branch-b',
    fromAccountId: 'dep-a',
    toAccountId: 'dep-b',
    amount: 1_000_000,
    status: DepositTransferStatus.DANG_CHUYEN,
    fromPaymentId: 'bp-1',
    toReceiptId: null,
    transferPairId: 't-1',
    initiatedBy: 'user-1',
    initiatedAt: daysAgo(1),
    confirmedBy: null,
    confirmedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: null,
    note: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: undefined,
    ...overrides,
  } as DepositTransferEntity;
}

function makeAccount(overrides: Partial<DepositAccountEntity> = {}): DepositAccountEntity {
  return {
    id: 'acc-1',
    branchId: 'branch-a',
    name: 'Deposit A',
    type: 'BANK_ACCOUNT',
    balance: 1_000_000,
    status: DepositAccountStatus.ACTIVE,
    ...overrides,
  } as DepositAccountEntity;
}

async function setup(opts: {
  transfers?: DepositTransferEntity[];
  accounts?: DepositAccountEntity[];
  branches?: Array<{ id: string; name: string }>;
} = {}) {
  const transferRepo = {
    find: jest.fn().mockResolvedValue(opts.transfers ?? [makeTransfer()]),
  };
  const accountRepo = {
    find: jest.fn().mockResolvedValue(opts.accounts ?? [makeAccount()]),
  };
  const branchRepo = {
    find: jest
      .fn()
      .mockResolvedValue(opts.branches ?? [{ id: 'branch-a', name: 'CN A' }, { id: 'branch-b', name: 'CN B' }]),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DepositDashboardService,
      { provide: getRepositoryToken(DepositTransferEntity), useValue: transferRepo },
      { provide: getRepositoryToken(DepositAccountEntity), useValue: accountRepo },
      { provide: getRepositoryToken(BranchEntity), useValue: branchRepo },
    ],
  }).compile();

  return { service: module.get(DepositDashboardService), transferRepo, accountRepo, branchRepo };
}

describe('DepositDashboardService', () => {
  describe('getInTransit', () => {
    it('only returns DANG_CHUYEN transfers, with a correct total', async () => {
      const { service } = await setup({
        transfers: [
          makeTransfer({ id: 't-1', amount: 1_000_000 }),
          makeTransfer({ id: 't-2', amount: 500_000 }),
        ],
      });

      const report = await service.getInTransit({}, actor);

      expect(report.data).toHaveLength(2);
      expect(report.total).toBe('1500000');
    });

    it('flags isOverdue once daysInTransit exceeds staleDays', async () => {
      const { service } = await setup({
        transfers: [makeTransfer({ id: 't-old', initiatedAt: daysAgo(10) })],
      });

      const report = await service.getInTransit({ staleDays: 3 }, actor);

      expect(report.data[0].daysInTransit).toBeGreaterThanOrEqual(10);
      expect(report.data[0].isOverdue).toBe(true);
    });

    it('BR-PERM-01: shows a transfer where the actor branch is source OR destination, not others', async () => {
      const scopedActor: ActorContext = { ...actor, branchIds: ['branch-a'] };
      const { service } = await setup({
        transfers: [
          makeTransfer({ id: 'a-to-b', fromBranchId: 'branch-a', toBranchId: 'branch-b' }),
          makeTransfer({ id: 'c-to-a', fromBranchId: 'branch-c', toBranchId: 'branch-a' }),
          makeTransfer({ id: 'c-to-d', fromBranchId: 'branch-c', toBranchId: 'branch-d' }),
        ],
      });

      const report = await service.getInTransit({}, scopedActor);

      const ids = report.data.map((r) => r.id);
      expect(ids).toEqual(expect.arrayContaining(['a-to-b', 'c-to-a']));
      expect(ids).not.toContain('c-to-d');
    });

    it('an actor with no branch assignment sees nothing', async () => {
      const { service } = await setup();
      const noBranchActor: ActorContext = { ...actor, branchIds: [] };

      const report = await service.getInTransit({}, noBranchActor);

      expect(report.data).toHaveLength(0);
      expect(report.total).toBe('0');
    });
  });

  describe('getOrgBalance', () => {
    it('sums accounts per branch and grandTotal = accountsTotal + inTransitTotal', async () => {
      const { service } = await setup({
        accounts: [
          makeAccount({ id: 'a1', branchId: 'branch-a', balance: 1_000_000 }),
          makeAccount({ id: 'a2', branchId: 'branch-a', balance: 500_000 }),
        ],
        transfers: [makeTransfer({ amount: 200_000, fromBranchId: 'branch-a' })],
      });
      const multiActor: ActorContext = { ...actor, branchIds: ['branch-a'] };

      const dashboard = await service.getOrgBalance(multiActor);

      expect(dashboard.branches).toHaveLength(1);
      expect(dashboard.branches[0].branchTotal).toBe('1500000');
      expect(dashboard.accountsTotal).toBe('1500000');
      expect(dashboard.inTransitTotal).toBe('200000');
      expect(dashboard.grandTotal).toBe('1700000');
    });

    it('BR-PERM-01: excludes accounts of a branch the actor is not assigned to', async () => {
      const { service } = await setup({
        accounts: [
          makeAccount({ id: 'a1', branchId: 'branch-a', balance: 1_000_000 }),
          makeAccount({ id: 'a2', branchId: 'branch-other', balance: 999_999 }),
        ],
        transfers: [],
      });
      const scopedActor: ActorContext = { ...actor, branchIds: ['branch-a'] };

      const dashboard = await service.getOrgBalance(scopedActor);

      expect(dashboard.branches.map((b) => b.branchId)).toEqual(['branch-a']);
      expect(dashboard.accountsTotal).toBe('1000000');
    });
  });
});
