import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { FundSwapsService } from './fund-swaps.service';
import { CreateFundSwapDto, FundSwapDirection } from './dto/create-fund-swap.dto';
import { BankPaymentsService } from '../bank-payments/bank-payments.service';
import { BankReceiptsService } from '../bank-receipts/bank-receipts.service';
import { CashPaymentsService } from '../../cash-vouchers/cash-payments/cash-payments.service';
import { CashReceiptsService } from '../../cash-vouchers/cash-receipts/cash-receipts.service';
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import { AccountResolverService } from '../../payment-accounts/account-resolver.service';
import { AccountingDefaultAccountRole } from '../../payment-accounts/enums';
import { BankPaymentPurpose, BankReceiptPurpose } from '../enums';
import { CashPaymentPurpose, CashReceiptPurpose } from '../../cash-vouchers/enums';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

const baseDto: CreateFundSwapDto = {
  direction: FundSwapDirection.DEPOSIT_TO_CASH,
  depositAccountId: 'dep-1',
  amount: 5_000_000,
  docDate: '2026-07-16',
};

async function setup() {
  const manager = { fake: 'manager' };
  const dataSource = { transaction: jest.fn((cb) => cb(manager)) };
  const bankPayment = {
    createAndPostInternal: jest.fn().mockResolvedValue({ voucherId: 'bp-1' }),
  };
  const bankReceipt = {
    createAndPostInternal: jest.fn().mockResolvedValue({ voucherId: 'br-1' }),
  };
  const cashPayment = {
    createAndPostInternal: jest.fn().mockResolvedValue({ voucherId: 'cp-1' }),
  };
  const cashReceipt = {
    createAndPostInternal: jest.fn().mockResolvedValue({ voucherId: 'cr-1' }),
  };
  const cashFundResolver = {
    resolveCoaAccountIdByCode: jest.fn().mockResolvedValue('acc-113'),
    resolveOrDefault: jest.fn().mockResolvedValue('cash-1'),
  };
  const accountResolver = {
    resolveContraAccount: jest.fn().mockResolvedValue('acc-642'),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      FundSwapsService,
      { provide: DataSource, useValue: dataSource },
      { provide: BankPaymentsService, useValue: bankPayment },
      { provide: BankReceiptsService, useValue: bankReceipt },
      { provide: CashPaymentsService, useValue: cashPayment },
      { provide: CashReceiptsService, useValue: cashReceipt },
      { provide: CashFundResolverService, useValue: cashFundResolver },
      { provide: AccountResolverService, useValue: accountResolver },
    ],
  }).compile();

  return {
    service: module.get(FundSwapsService),
    dataSource,
    manager,
    bankPayment,
    bankReceipt,
    cashPayment,
    cashReceipt,
    cashFundResolver,
    accountResolver,
  };
}

describe('FundSwapsService', () => {
  it('DEPOSIT_TO_CASH: withdraws from deposit (CASH_TRANSFER, contra=113) and deposits into cash, same manager', async () => {
    const { service, manager, bankPayment, cashReceipt } = await setup();

    const result = await service.swap(baseDto, actor);

    expect(bankPayment.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: BankPaymentPurpose.CASH_TRANSFER,
        depositAccountId: 'dep-1',
        contraAccountId: 'acc-113',
        amount: 5_000_000,
        affectExpense: false,
      }),
      manager,
    );
    expect(cashReceipt.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: CashReceiptPurpose.OTHER,
        cashAccountId: 'cash-1',
        contraAccountId: 'acc-113',
        amount: 5_000_000,
      }),
      manager,
    );
    expect(result.bankPaymentId).toBe('bp-1');
    expect(result.cashReceiptId).toBe('cr-1');
  });

  it('CASH_TO_DEPOSIT: withdraws from cash and deposits into the bank account, same manager', async () => {
    const { service, manager, cashPayment, bankReceipt } = await setup();

    const result = await service.swap(
      { ...baseDto, direction: FundSwapDirection.CASH_TO_DEPOSIT },
      actor,
    );

    expect(cashPayment.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: CashPaymentPurpose.OTHER,
        cashAccountId: 'cash-1',
        contraAccountId: 'acc-113',
        amount: 5_000_000,
      }),
      manager,
    );
    expect(bankReceipt.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: BankReceiptPurpose.OTHER,
        depositAccountId: 'dep-1',
        contraAccountId: 'acc-113',
        amount: 5_000_000,
        affectRevenue: false,
      }),
      manager,
    );
    expect(result.cashPaymentId).toBe('cp-1');
    expect(result.bankReceiptId).toBe('br-1');
  });

  it('BR-SWP-03: posts the fee as a separate BANK_FEE payment against the deposit fund', async () => {
    const { service, manager, bankPayment, accountResolver } = await setup();

    const result = await service.swap(
      { ...baseDto, feeAmount: 11_000 },
      actor,
    );

    expect(bankPayment.createAndPostInternal).toHaveBeenCalledTimes(2);
    expect(accountResolver.resolveContraAccount).toHaveBeenCalledWith(
      AccountingDefaultAccountRole.EXPENSE,
      actor,
    );
    const feeCall = bankPayment.createAndPostInternal.mock.calls.find(
      (c: any[]) => c[0].purpose === BankPaymentPurpose.BANK_FEE,
    );
    expect(feeCall[0]).toMatchObject({
      depositAccountId: 'dep-1',
      contraAccountId: 'acc-642',
      amount: 11_000,
      affectExpense: true,
    });
    expect(feeCall[1]).toBe(manager);
    expect(result.bankFeePaymentId).toBe('bp-1');
  });

  it('BR-SWP-01: propagates a leg-2 failure so the whole swap rolls back', async () => {
    const { service, cashReceipt } = await setup();
    cashReceipt.createAndPostInternal.mockRejectedValue(
      new Error('insufficient cash'),
    );

    await expect(service.swap(baseDto, actor)).rejects.toThrow('insufficient cash');
  });

  describe('autoCreateReceipt', () => {
    it('false skips the cash-receipt leg entirely, returning only the bank payment', async () => {
      const { service, bankPayment, cashReceipt } = await setup();

      const result = await service.swap(
        { ...baseDto, autoCreateReceipt: false },
        actor,
      );

      expect(bankPayment.createAndPostInternal).toHaveBeenCalledTimes(1);
      expect(cashReceipt.createAndPostInternal).not.toHaveBeenCalled();
      expect(result.bankPaymentId).toBe('bp-1');
      expect(result.cashReceiptId).toBeUndefined();
    });

    it('true behaves identically to the omitted-field regression case', async () => {
      const { service, cashReceipt } = await setup();

      const result = await service.swap(
        { ...baseDto, autoCreateReceipt: true },
        actor,
      );

      expect(cashReceipt.createAndPostInternal).toHaveBeenCalledTimes(1);
      expect(result.cashReceiptId).toBe('cr-1');
    });

    it('the withdrawal fee still posts when the receipt leg is skipped', async () => {
      const { service, bankPayment, cashReceipt } = await setup();

      const result = await service.swap(
        { ...baseDto, feeAmount: 11_000, autoCreateReceipt: false },
        actor,
      );

      expect(bankPayment.createAndPostInternal).toHaveBeenCalledTimes(2);
      expect(cashReceipt.createAndPostInternal).not.toHaveBeenCalled();
      expect(result.bankFeePaymentId).toBe('bp-1');
      expect(result.cashReceiptId).toBeUndefined();
    });

    it('rejects false combined with CASH_TO_DEPOSIT before opening a transaction', async () => {
      const { service, dataSource } = await setup();

      await expect(
        service.swap(
          {
            ...baseDto,
            direction: FundSwapDirection.CASH_TO_DEPOSIT,
            autoCreateReceipt: false,
          },
          actor,
        ),
      ).rejects.toThrow(/only applies to DEPOSIT_TO_CASH/);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });
});
