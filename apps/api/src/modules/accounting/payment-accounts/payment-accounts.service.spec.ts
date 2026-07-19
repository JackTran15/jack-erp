import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PaymentAccountsService } from './payment-accounts.service';
import { PaymentAccountEntity } from './payment-account.entity';
import { PaymentAccountMethod } from './enums';
import { DepositAccountEntity } from '../deposit/deposit-account.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-a',
  roles: [],
};

async function setup() {
  const paymentAccountRepo = { find: jest.fn() };
  const depositAccountRepo = { find: jest.fn().mockResolvedValue([]) };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PaymentAccountsService,
      { provide: getRepositoryToken(PaymentAccountEntity), useValue: paymentAccountRepo },
      { provide: getRepositoryToken(DepositAccountEntity), useValue: depositAccountRepo },
    ],
  }).compile();

  return {
    service: module.get(PaymentAccountsService),
    paymentAccountRepo,
    depositAccountRepo,
  };
}

describe('PaymentAccountsService', () => {
  it('joins fund name + bank/account-number display fields in from the linked deposit fund', async () => {
    const { service, paymentAccountRepo, depositAccountRepo } = await setup();
    paymentAccountRepo.find.mockResolvedValue([
      {
        id: 'pa-1',
        branchId: null,
        paymentMethod: PaymentAccountMethod.BANK_TRANSFER,
        depositAccountId: 'dep-shb',
        label: null,
        sortOrder: 0,
      },
    ]);
    depositAccountRepo.find.mockResolvedValue([
      {
        id: 'dep-shb',
        name: 'Lam Hoang An',
        accountNo: '123123123',
        bank: { name: 'SHB', code: 'SHB' },
      },
    ]);

    const rows = await service.list(actor);

    expect(rows).toEqual([
      {
        id: 'pa-1',
        paymentMethod: PaymentAccountMethod.BANK_TRANSFER,
        depositAccountName: 'Lam Hoang An',
        bankName: 'SHB',
        bankCode: 'SHB',
        accountNumber: '123123123',
        label: null,
        sortOrder: 0,
      },
    ]);
    expect(depositAccountRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ relations: ['bank'] }),
    );
  });

  it('returns null bank fields for a mapping with no linked deposit fund (e.g. cash)', async () => {
    const { service, paymentAccountRepo, depositAccountRepo } = await setup();
    paymentAccountRepo.find.mockResolvedValue([
      {
        id: 'pa-cash',
        branchId: null,
        paymentMethod: PaymentAccountMethod.CASH,
        depositAccountId: undefined,
        label: 'Tiền mặt',
        sortOrder: 0,
      },
    ]);

    const rows = await service.list(actor);

    expect(rows[0].depositAccountName).toBeNull();
    expect(rows[0].bankName).toBeNull();
    expect(rows[0].bankCode).toBeNull();
    expect(rows[0].accountNumber).toBeNull();
    expect(depositAccountRepo.find).not.toHaveBeenCalled();
  });

  it('throws when the actor has no branch scope', async () => {
    const { service } = await setup();
    await expect(
      service.list({ ...actor, branchId: undefined }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
