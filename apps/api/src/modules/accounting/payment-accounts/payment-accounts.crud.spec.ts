import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PaymentAccountsCrudService } from './payment-accounts.crud';
import { PaymentAccountEntity } from './payment-account.entity';
import { PaymentAccountMethod } from './enums';
import { DepositAccountEntity } from '../deposit/deposit-account.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { AccountEntity } from '../coa/account.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-a',
  roles: ['admin'],
};

async function setup() {
  const paymentAccountRepo = { create: jest.fn((e) => e), save: jest.fn((e) => Promise.resolve(e)) };
  const depositAccountRepo = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
  const branchRepo = { find: jest.fn().mockResolvedValue([]) };
  const accountRepo = { find: jest.fn().mockResolvedValue([]) };
  const dataSource = {};

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PaymentAccountsCrudService,
      { provide: getRepositoryToken(PaymentAccountEntity), useValue: paymentAccountRepo },
      { provide: getRepositoryToken(DepositAccountEntity), useValue: depositAccountRepo },
      { provide: getRepositoryToken(BranchEntity), useValue: branchRepo },
      { provide: getRepositoryToken(AccountEntity), useValue: accountRepo },
      { provide: DataSource, useValue: dataSource },
    ],
  }).compile();

  return {
    service: module.get(PaymentAccountsCrudService),
    depositAccountRepo,
    branchRepo,
    accountRepo,
  };
}

describe('PaymentAccountsCrudService', () => {
  describe('validateBusinessRules', () => {
    it('rejects a non-cash create with no depositAccountId', async () => {
      const { service } = await setup();
      await expect(
        (service as any).validateBusinessRules(
          'create',
          { paymentMethod: PaymentAccountMethod.BANK_TRANSFER },
          actor,
        ),
      ).rejects.toThrow(/depositAccountId is required/);
    });

    it('rejects a cash create with no accountId', async () => {
      const { service } = await setup();
      await expect(
        (service as any).validateBusinessRules(
          'create',
          { paymentMethod: PaymentAccountMethod.CASH },
          actor,
        ),
      ).rejects.toThrow(/accountId is required/);
    });

    it('rejects an unknown depositAccountId', async () => {
      const { service, depositAccountRepo } = await setup();
      depositAccountRepo.findOne.mockResolvedValue(null);
      await expect(
        (service as any).validateBusinessRules(
          'create',
          { paymentMethod: PaymentAccountMethod.CARD, depositAccountId: 'missing' },
          actor,
        ),
      ).rejects.toThrow(/not found/);
    });

    it('rejects a branchId that does not match the linked deposit fund\'s own branch', async () => {
      const { service, depositAccountRepo } = await setup();
      depositAccountRepo.findOne.mockResolvedValue({ id: 'dep-1', branchId: 'branch-b' });
      await expect(
        (service as any).validateBusinessRules(
          'create',
          {
            paymentMethod: PaymentAccountMethod.CARD,
            depositAccountId: 'dep-1',
            branchId: 'branch-a',
          },
          actor,
        ),
      ).rejects.toThrow(/must set branchId to that fund's own branch/);
    });

    it('passes when branchId matches the linked deposit fund\'s branch', async () => {
      const { service, depositAccountRepo } = await setup();
      depositAccountRepo.findOne.mockResolvedValue({ id: 'dep-1', branchId: 'branch-a' });
      await expect(
        (service as any).validateBusinessRules(
          'create',
          {
            paymentMethod: PaymentAccountMethod.CARD,
            depositAccountId: 'dep-1',
            branchId: 'branch-a',
          },
          actor,
        ),
      ).resolves.toBeUndefined();
    });

    it('does not require depositAccountId on a partial update payload (paymentMethod not resent)', async () => {
      const { service } = await setup();
      await expect(
        (service as any).validateBusinessRules('update', { isActive: false }, actor),
      ).resolves.toBeUndefined();
    });
  });

  describe('beforeCreate / beforeUpdate — accountId sync', () => {
    it('overwrites accountId with the linked deposit fund\'s own COA', async () => {
      const { service, depositAccountRepo } = await setup();
      depositAccountRepo.findOne.mockResolvedValue({ id: 'dep-1', accountId: 'coa-1121' });

      const result = await (service as any).beforeCreate(
        {
          paymentMethod: PaymentAccountMethod.BANK_TRANSFER,
          depositAccountId: 'dep-1',
          accountId: 'stale-or-missing',
        },
        actor,
      );

      expect(result.accountId).toBe('coa-1121');
    });

    it('leaves accountId untouched when no depositAccountId is set (cash)', async () => {
      const { service } = await setup();
      const result = await (service as any).beforeCreate(
        { paymentMethod: PaymentAccountMethod.CASH, accountId: 'coa-1111' },
        actor,
      );
      expect(result.accountId).toBe('coa-1111');
    });
  });
});

/**
 * The admin grid must show names, not UUIDs. Labels are resolved here rather
 * than by a relation join because payment_accounts.branch_id is varchar while
 * branches.id is uuid.
 */
describe('PaymentAccountsCrudService.list — FK labels', () => {
  const rows = [
    {
      id: 'pa-1',
      paymentMethod: PaymentAccountMethod.BANK_TRANSFER,
      branchId: 'branch-a',
      depositAccountId: 'dep-1',
      accountId: 'acc-1',
    },
    // Org-wide mapping: no branch, no deposit fund.
    {
      id: 'pa-2',
      paymentMethod: PaymentAccountMethod.CASH,
      branchId: null,
      depositAccountId: null,
      accountId: 'acc-2',
    },
  ];

  async function listWith(overrides: Record<string, unknown> = {}) {
    const ctx = await setup();
    jest
      .spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(ctx.service)),
        'list' as never,
      )
      .mockResolvedValue({ data: rows, total: 2, page: 1, pageSize: 20 } as never);
    ctx.branchRepo.find.mockResolvedValue([{ id: 'branch-a', name: 'Hồ Chí Minh' }]);
    ctx.depositAccountRepo.find.mockResolvedValue([
      { id: 'dep-1', name: 'SHB', accountNo: '123123123' },
    ]);
    ctx.accountRepo.find.mockResolvedValue([
      { id: 'acc-1', code: '112', name: 'Tiền gửi ngân hàng' },
      { id: 'acc-2', code: '1111', name: 'Tiền Việt Nam' },
    ]);
    Object.assign(ctx, overrides);
    const page = await ctx.service.list({ page: 1, pageSize: 20 } as never, {}, actor);
    return { ...ctx, page };
  }

  it('inlines branch, deposit-fund and COA labels onto each row', async () => {
    const { page } = await listWith();
    expect(page.data[0]).toMatchObject({
      branchName: 'Hồ Chí Minh',
      depositAccountName: 'SHB (123123123)',
      accountName: '112 - Tiền gửi ngân hàng',
    });
  });

  it('renders an org-wide mapping (no branch / no fund) as — rather than blank', async () => {
    const { page } = await listWith();
    expect(page.data[1]).toMatchObject({
      branchName: '—',
      depositAccountName: '—',
      accountName: '1111 - Tiền Việt Nam',
    });
  });

  it('batches one query per lookup table, never one per row', async () => {
    const { branchRepo, depositAccountRepo, accountRepo } = await listWith();
    expect(branchRepo.find).toHaveBeenCalledTimes(1);
    expect(depositAccountRepo.find).toHaveBeenCalledTimes(1);
    expect(accountRepo.find).toHaveBeenCalledTimes(1);
  });
});
