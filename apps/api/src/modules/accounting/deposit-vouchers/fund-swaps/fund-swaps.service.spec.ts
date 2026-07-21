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
import { PartnerResolverService } from '../../cash-vouchers/shared/partner-resolver.service';
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
  // Null = untyped/absent partner, matching the real resolver's contract.
  const partnerResolver = { resolve: jest.fn().mockResolvedValue(null) };

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
      { provide: PartnerResolverService, useValue: partnerResolver },
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
    partnerResolver,
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
        purpose: CashPaymentPurpose.DEPOSIT_TRANSFER,
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

    it('false skips the bank-receipt leg on CASH_TO_DEPOSIT too', async () => {
      const { service, cashPayment, bankReceipt } = await setup();

      const result = await service.swap(
        {
          ...baseDto,
          direction: FundSwapDirection.CASH_TO_DEPOSIT,
          autoCreateReceipt: false,
        },
        actor,
      );

      expect(cashPayment.createAndPostInternal).toHaveBeenCalledTimes(1);
      expect(bankReceipt.createAndPostInternal).not.toHaveBeenCalled();
      expect(result.cashPaymentId).toBe('cp-1');
      expect(result.bankReceiptId).toBeUndefined();
    });

    it('CASH_TO_DEPOSIT with the field omitted still posts both legs', async () => {
      const { service, cashPayment, bankReceipt } = await setup();

      const result = await service.swap(
        { ...baseDto, direction: FundSwapDirection.CASH_TO_DEPOSIT },
        actor,
      );

      expect(cashPayment.createAndPostInternal).toHaveBeenCalledTimes(1);
      expect(bankReceipt.createAndPostInternal).toHaveBeenCalledTimes(1);
      expect(result.bankReceiptId).toBe('br-1');
    });
  });
});

/**
 * MISA parity: a fund swap generates its vouchers, so whatever the user typed on
 * the source form must land on BOTH legs — otherwise the generated voucher opens
 * with every field blank, which is exactly the UNC000048 bug.
 */
describe('FundSwapsService — party carry-over and leg pairing', () => {
  const partyDto: CreateFundSwapDto = {
    ...baseDto,
    partnerType: 'SUPPLIER' as CreateFundSwapDto['partnerType'],
    partnerId: 'sup-1',
    payeeName: 'AN BA',
    address: '3423423',
    paidBy: 'user-9',
    reference: 'REF-1',
    reason: 'Rút tiền gửi về nhập quỹ tiền mặt',
    lines: [
      { description: 'Rút tiền gửi về nhập quỹ tiền mặt', amount: 5_000_000, categoryId: 'cat-out-1' },
    ],
  };

  it('carries the resolved party onto the deposit leg', async () => {
    const { service, bankPayment, partnerResolver } = await setup();
    partnerResolver.resolve.mockResolvedValue({ name: 'NCC số 2', address: '12 Lê Lợi' });

    await service.swap(partyDto, actor);

    expect(bankPayment.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: 'sup-1',
        partnerName: 'NCC số 2',
        partnerAddress: '12 Lê Lợi',
        payeeName: 'AN BA',
        paidBy: 'user-9',
        reference: 'REF-1',
        reason: 'Rút tiền gửi về nhập quỹ tiền mặt',
      }),
      expect.anything(),
    );
  });

  it('clones the party onto the cash receipt, mapping payee→payer and paidBy→staffId', async () => {
    const { service, cashReceipt, partnerResolver } = await setup();
    partnerResolver.resolve.mockResolvedValue({ name: 'NCC số 2', address: '12 Lê Lợi' });

    await service.swap(partyDto, actor);

    expect(cashReceipt.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: 'sup-1',
        partnerName: 'NCC số 2',
        partnerAddress: '12 Lê Lợi',
        payerName: 'AN BA',
        staffId: 'user-9',
      }),
      expect.anything(),
    );
  });

  // A partner row whose address column is an empty string (not NULL) is the
  // common case in real data — `??` alone would keep the blank and silently
  // discard what the user typed.
  it.each([
    ['null', null],
    ['empty string', ''],
    ['whitespace', '   '],
  ])('falls back to the supplied address when the partner address is %s', async (_label, address) => {
    const { service, bankPayment, partnerResolver } = await setup();
    partnerResolver.resolve.mockResolvedValue({ name: 'AN BA', address });

    await service.swap(partyDto, actor);

    expect(bankPayment.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({ partnerAddress: '3423423' }),
      expect.anything(),
    );
  });

  it('gives every leg the same referenceId so each can find its counterpart', async () => {
    const { service, bankPayment, cashReceipt } = await setup();

    await service.swap({ ...partyDto, feeAmount: 1_000 }, actor);

    const legs = [
      ...bankPayment.createAndPostInternal.mock.calls,
      ...cashReceipt.createAndPostInternal.mock.calls,
    ].map(([args]) => args);

    expect(legs).toHaveLength(3); // payment + fee + receipt
    const swapIds = new Set(legs.map((a) => a.referenceId));
    expect(swapIds.size).toBe(1);
    expect([...swapIds][0]).toEqual(expect.any(String));
    for (const leg of legs) expect(leg.referenceType).toBe('FUND_SWAP');
  });

  it('passes the user lines (with Mục chi) to the source leg', async () => {
    const { service, bankPayment } = await setup();

    await service.swap(partyDto, actor);

    expect(bankPayment.createAndPostInternal).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          {
            description: 'Rút tiền gửi về nhập quỹ tiền mặt',
            amount: 5_000_000,
            categoryId: 'cat-out-1',
          },
        ],
      }),
      expect.anything(),
    );
  });

  it('does NOT clone categoryId to the counterpart — categories are direction-scoped', async () => {
    const { service, cashReceipt } = await setup();

    await service.swap(partyDto, actor);

    const [args] = cashReceipt.createAndPostInternal.mock.calls[0];
    expect(args.lines).toEqual([
      { description: 'Rút tiền gửi về nhập quỹ tiền mặt', amount: 5_000_000 },
    ]);
    expect(args.lines[0]).not.toHaveProperty('categoryId');
  });

  it('still synthesizes a single line when the caller sends none (standalone Chuyển quỹ dialog)', async () => {
    const { service, bankPayment } = await setup();

    await service.swap(baseDto, actor);

    const [args] = bankPayment.createAndPostInternal.mock.calls[0];
    expect(args.lines).toBeUndefined();
    expect(args.description).toBe('Rút tiền gửi chuyển quỹ tiền mặt');
  });
});
