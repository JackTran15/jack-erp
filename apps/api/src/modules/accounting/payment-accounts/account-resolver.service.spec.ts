import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { AccountResolverService } from './account-resolver.service';
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

  beforeEach(async () => {
    paymentAccountRepo = { find: jest.fn(), findOne: jest.fn() };
    defaultAccountRepo = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountResolverService,
        { provide: getRepositoryToken(PaymentAccountEntity), useValue: paymentAccountRepo },
        { provide: getRepositoryToken(AccountingDefaultAccountEntity), useValue: defaultAccountRepo },
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

  describe('resolvePaymentAccount', () => {
    describe('without a paymentAccountId (default fallback)', () => {
      it('resolves the org-wide mapping when no branch override exists', async () => {
        paymentAccountRepo.find.mockResolvedValue([
          { branchId: null, accountId: 'cash-coa' },
        ]);
        await expect(
          service.resolvePaymentAccount(PaymentAccountMethod.CASH, actor),
        ).resolves.toBe('cash-coa');
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
        ).resolves.toBe('branch-cash-coa');
      });

      it('ignores an override that belongs to another branch', async () => {
        paymentAccountRepo.find.mockResolvedValue([
          { branchId: null, accountId: 'org-cash-coa' },
          { branchId: 'branch-2', accountId: 'other-branch-coa' },
        ]);
        await expect(
          service.resolvePaymentAccount(PaymentAccountMethod.CASH, actor),
        ).resolves.toBe('org-cash-coa');
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
        ).resolves.toBe('bank-tcb-coa');
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
        ).resolves.toBe('branch-bank-coa');
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
