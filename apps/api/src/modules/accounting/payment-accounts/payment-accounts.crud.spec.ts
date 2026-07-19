import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PaymentAccountsCrudService } from './payment-accounts.crud';
import { PaymentAccountEntity } from './payment-account.entity';
import { PaymentAccountMethod } from './enums';
import { DepositAccountEntity } from '../deposit/deposit-account.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-a',
  roles: ['admin'],
};

async function setup() {
  const paymentAccountRepo = { create: jest.fn((e) => e), save: jest.fn((e) => Promise.resolve(e)) };
  const depositAccountRepo = { findOne: jest.fn() };
  const dataSource = {};

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PaymentAccountsCrudService,
      { provide: getRepositoryToken(PaymentAccountEntity), useValue: paymentAccountRepo },
      { provide: getRepositoryToken(DepositAccountEntity), useValue: depositAccountRepo },
      { provide: DataSource, useValue: dataSource },
    ],
  }).compile();

  return {
    service: module.get(PaymentAccountsCrudService),
    depositAccountRepo,
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
