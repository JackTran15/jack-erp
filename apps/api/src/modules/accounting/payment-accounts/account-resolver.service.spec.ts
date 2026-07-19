import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { AccountResolverService } from './account-resolver.service';
import { AccountEntity } from '../coa/account.entity';
import { PaymentAccountEntity } from './payment-account.entity';
import { AccountingDefaultAccountEntity } from './accounting-default-account.entity';
import { AccountingDefaultAccountRole, PaymentAccountMethod } from './enums';

const actor = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

describe('AccountResolverService', () => {
  let service: AccountResolverService;
  let paymentAccountRepo: { find: jest.Mock; findOne: jest.Mock };
  let defaultAccountRepo: { find: jest.Mock };
  let accountRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    paymentAccountRepo = { find: jest.fn(), findOne: jest.fn() };
    defaultAccountRepo = { find: jest.fn() };
    accountRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountResolverService,
        { provide: getRepositoryToken(PaymentAccountEntity), useValue: paymentAccountRepo },
        { provide: getRepositoryToken(AccountingDefaultAccountEntity), useValue: defaultAccountRepo },
        { provide: getRepositoryToken(AccountEntity), useValue: accountRepo },
      ],
    }).compile();

    service = module.get(AccountResolverService);
  });

  describe('resolveDefaultAccount', () => {
    it('prefers a branch override over the org default', async () => {
      defaultAccountRepo.find.mockResolvedValue([
        { branchId: null, accountId: 'org-default' },
        { branchId: 'branch-1', accountId: 'branch-override' },
      ]);
      await expect(
        service.resolveDefaultAccount(AccountingDefaultAccountRole.REVENUE, actor),
      ).resolves.toBe('branch-override');
    });

    it('falls back to the org default when no branch override exists', async () => {
      defaultAccountRepo.find.mockResolvedValue([{ branchId: null, accountId: 'org-default' }]);
      await expect(
        service.resolveDefaultAccount(AccountingDefaultAccountRole.REVENUE, actor),
      ).resolves.toBe('org-default');
    });

    it('throws when neither a branch override nor an org default is configured', async () => {
      defaultAccountRepo.find.mockResolvedValue([]);
      await expect(
        service.resolveDefaultAccount(AccountingDefaultAccountRole.RECEIVABLE, actor),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resolveContraAccount', () => {
    it('delegates to the role default when no override is given', async () => {
      defaultAccountRepo.find.mockResolvedValue([
        { branchId: null, accountId: 'other-income-coa' },
      ]);
      await expect(
        service.resolveContraAccount(
          AccountingDefaultAccountRole.OTHER_INCOME,
          actor,
        ),
      ).resolves.toBe('other-income-coa');
      expect(accountRepo.findOne).not.toHaveBeenCalled();
    });

    it('returns the override account when it is active and in org', async () => {
      accountRepo.findOne.mockResolvedValue({ id: 'transfer-coa' });
      await expect(
        service.resolveContraAccount(
          AccountingDefaultAccountRole.PAYABLE,
          actor,
          'transfer-coa',
        ),
      ).resolves.toBe('transfer-coa');
      expect(accountRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'transfer-coa',
            organizationId: 'org-1',
            isActive: true,
          }),
        }),
      );
      expect(defaultAccountRepo.find).not.toHaveBeenCalled();
    });

    it('throws when the override account is missing or inactive', async () => {
      accountRepo.findOne.mockResolvedValue(null);
      await expect(
        service.resolveContraAccount(
          AccountingDefaultAccountRole.EXPENSE,
          actor,
          'bad-coa',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resolvePaymentAccount', () => {
    describe('without a paymentAccountId (default fallback)', () => {
      it('resolves the org-wide mapping when no branch override exists', async () => {
        paymentAccountRepo.find.mockResolvedValue([
          { branchId: null, accountId: 'cash-coa' },
        ]);
        await expect(
          service.resolvePaymentAccount(PaymentAccountMethod.CASH, actor),
        ).resolves.toEqual({ accountId: 'cash-coa', depositAccountId: undefined });
        expect(paymentAccountRepo.find).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              organizationId: 'org-1',
              paymentMethod: PaymentAccountMethod.CASH,
              isActive: true,
            }),
            order: { sortOrder: 'ASC' },
          }),
        );
      });

      it('prefers a branch override over the org-wide mapping', async () => {
        paymentAccountRepo.find.mockResolvedValue([
          { branchId: null, accountId: 'org-cash-coa' },
          { branchId: 'branch-1', accountId: 'branch-cash-coa' },
        ]);
        await expect(
          service.resolvePaymentAccount(PaymentAccountMethod.CASH, actor),
        ).resolves.toEqual({ accountId: 'branch-cash-coa', depositAccountId: undefined });
      });

      it('ignores an override that belongs to another branch', async () => {
        paymentAccountRepo.find.mockResolvedValue([
          { branchId: null, accountId: 'org-cash-coa' },
          { branchId: 'branch-2', accountId: 'other-branch-coa' },
        ]);
        await expect(
          service.resolvePaymentAccount(PaymentAccountMethod.CASH, actor),
        ).resolves.toEqual({ accountId: 'org-cash-coa', depositAccountId: undefined });
      });

      it('throws when no mapping is configured for the method', async () => {
        paymentAccountRepo.find.mockResolvedValue([]);
        await expect(
          service.resolvePaymentAccount(PaymentAccountMethod.CARD, actor),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws (ambiguous) when more than one mapping exists for the method', async () => {
        paymentAccountRepo.find.mockResolvedValue([
          { branchId: null, accountId: 'bank-vcb' },
          { branchId: null, accountId: 'bank-tcb' },
        ]);
        await expect(
          service.resolvePaymentAccount(PaymentAccountMethod.BANK_TRANSFER, actor),
        ).rejects.toThrow(/paymentAccountId must be specified/);
      });
    });

    describe('with a paymentAccountId (explicit selection)', () => {
      it('returns the COA account of the matching org-wide mapping', async () => {
        paymentAccountRepo.findOne.mockResolvedValue({
          branchId: null,
          accountId: 'bank-tcb-coa',
          paymentMethod: PaymentAccountMethod.BANK_TRANSFER,
        });
        await expect(
          service.resolvePaymentAccount(
            PaymentAccountMethod.BANK_TRANSFER,
            actor,
            'pa-tcb',
          ),
        ).resolves.toEqual({ accountId: 'bank-tcb-coa', depositAccountId: undefined });
        expect(paymentAccountRepo.findOne).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 'pa-tcb',
              organizationId: 'org-1',
              isActive: true,
            }),
          }),
        );
        expect(paymentAccountRepo.find).not.toHaveBeenCalled();
      });

      it('accepts an override scoped to the actor branch', async () => {
        paymentAccountRepo.findOne.mockResolvedValue({
          branchId: 'branch-1',
          accountId: 'branch-bank-coa',
          paymentMethod: PaymentAccountMethod.BANK_TRANSFER,
        });
        await expect(
          service.resolvePaymentAccount(
            PaymentAccountMethod.BANK_TRANSFER,
            actor,
            'pa-branch',
          ),
        ).resolves.toEqual({ accountId: 'branch-bank-coa', depositAccountId: undefined });
      });

      it('returns the linked depositAccountId when the mapping names one', async () => {
        paymentAccountRepo.findOne.mockResolvedValue({
          branchId: 'branch-1',
          accountId: 'branch-bank-coa',
          depositAccountId: 'deposit-shb-1',
          paymentMethod: PaymentAccountMethod.BANK_TRANSFER,
        });
        await expect(
          service.resolvePaymentAccount(
            PaymentAccountMethod.BANK_TRANSFER,
            actor,
            'pa-branch',
          ),
        ).resolves.toEqual({
          accountId: 'branch-bank-coa',
          depositAccountId: 'deposit-shb-1',
        });
      });

      it('throws when the mapping is not found', async () => {
        paymentAccountRepo.findOne.mockResolvedValue(null);
        await expect(
          service.resolvePaymentAccount(
            PaymentAccountMethod.BANK_TRANSFER,
            actor,
            'pa-missing',
          ),
        ).rejects.toThrow(/not found/);
      });

      it('rejects a mapping that belongs to another branch', async () => {
        paymentAccountRepo.findOne.mockResolvedValue({
          branchId: 'branch-2',
          accountId: 'other-branch-coa',
          paymentMethod: PaymentAccountMethod.BANK_TRANSFER,
        });
        await expect(
          service.resolvePaymentAccount(
            PaymentAccountMethod.BANK_TRANSFER,
            actor,
            'pa-other-branch',
          ),
        ).rejects.toThrow(/not found/);
      });

      it('throws when the mapping is configured for a different method', async () => {
        paymentAccountRepo.findOne.mockResolvedValue({
          branchId: null,
          accountId: 'cash-coa',
          paymentMethod: PaymentAccountMethod.CASH,
        });
        await expect(
          service.resolvePaymentAccount(
            PaymentAccountMethod.BANK_TRANSFER,
            actor,
            'pa-cash',
          ),
        ).rejects.toThrow(/not configured for method/);
      });
    });

    it('throws when the actor has no branch scope', async () => {
      await expect(
        service.resolvePaymentAccount(PaymentAccountMethod.CASH, { ...actor, branchId: undefined }),
      ).rejects.toThrow(/Branch scope/);
    });
  });
});
