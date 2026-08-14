import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { InvoiceRefundLegsService } from './invoice-refund-legs.service';
import {
  InvoiceEntity,
  InvoicePaymentMethod,
  InvoiceStatus,
  InvoiceType,
} from '../entities/invoice.entity';
import { InvoicePaymentEntity } from '../entities/invoice-payment.entity';
import { AccountResolverService } from '../../accounting/payment-accounts/account-resolver.service';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';

const actor = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
  permissions: [],
};

const invoiceStub = (overrides: Partial<InvoiceEntity> = {}): InvoiceEntity =>
  ({
    id: 'inv-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    code: 'INV-001',
    status: InvoiceStatus.PAID,
    type: InvoiceType.SALE,
    isDraft: false,
    amountDue: 200,
    totalPaid: 200,
    ...overrides,
  }) as InvoiceEntity;

const paymentStub = (
  overrides: Partial<InvoicePaymentEntity> = {},
): InvoicePaymentEntity =>
  ({
    id: 'pay-1',
    invoiceId: 'inv-1',
    organizationId: 'org-1',
    paymentMethod: InvoicePaymentMethod.CASH,
    amount: 200,
    accountId: 'coa-1111',
    ...overrides,
  }) as InvoicePaymentEntity;

describe('InvoiceRefundLegsService', () => {
  let service: InvoiceRefundLegsService;
  let paymentRepo: { find: jest.Mock };
  let accountResolver: { resolveDefaultAccount: jest.Mock };
  let cashFundResolver: { resolveBranchCashFund: jest.Mock };

  beforeEach(async () => {
    paymentRepo = { find: jest.fn().mockResolvedValue([paymentStub()]) };
    accountResolver = {
      resolveDefaultAccount: jest.fn().mockResolvedValue('coa-revenue'),
    };
    cashFundResolver = {
      resolveBranchCashFund: jest.fn().mockResolvedValue('cash-fund-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceRefundLegsService,
        { provide: getRepositoryToken(InvoicePaymentEntity), useValue: paymentRepo },
        { provide: AccountResolverService, useValue: accountResolver },
        { provide: CashFundResolverService, useValue: cashFundResolver },
      ],
    }).compile();

    service = module.get(InvoiceRefundLegsService);
  });

  it('builds one CASH leg for a fully paid cash invoice', async () => {
    paymentRepo.find.mockResolvedValue([paymentStub({ amount: 1_000_000 })]);

    await expect(service.build(invoiceStub(), actor)).resolves.toEqual([
      {
        invoicePaymentIds: ['pay-1'],
        fundKind: 'CASH',
        cashAccountId: 'cash-fund-1',
        amount: 1_000_000,
        contraAccountId: 'coa-revenue',
      },
    ]);
  });

  it('refunds only what was collected on a partial_debt invoice, not amountDue', async () => {
    paymentRepo.find.mockResolvedValue([paymentStub({ amount: 600_000 })]);

    const legs = await service.build(
      invoiceStub({
        status: InvoiceStatus.PARTIAL_DEBT,
        amountDue: 1_000_000,
        totalPaid: 600_000,
      }),
      actor,
    );

    expect(legs).toHaveLength(1);
    expect(legs[0].amount).toBe(600_000);
  });

  it('returns no legs when nothing was ever collected', async () => {
    paymentRepo.find.mockResolvedValue([]);

    await expect(
      service.build(invoiceStub({ status: InvoiceStatus.DEBT, totalPaid: 0 }), actor),
    ).resolves.toEqual([]);
    expect(cashFundResolver.resolveBranchCashFund).not.toHaveBeenCalled();
  });

  it('splits a mixed-tender invoice into one CASH leg and one DEPOSIT leg', async () => {
    paymentRepo.find.mockResolvedValue([
      paymentStub({ id: 'pay-cash', amount: 1_000_000 }),
      paymentStub({
        id: 'pay-bank',
        paymentMethod: InvoicePaymentMethod.BANK_TRANSFER,
        amount: 2_000_000,
        accountId: 'coa-1121',
        depositAccountId: 'deposit-1',
      }),
    ]);

    await expect(service.build(invoiceStub(), actor)).resolves.toEqual([
      {
        invoicePaymentIds: ['pay-cash'],
        fundKind: 'CASH',
        cashAccountId: 'cash-fund-1',
        amount: 1_000_000,
        contraAccountId: 'coa-revenue',
      },
      {
        invoicePaymentIds: ['pay-bank'],
        fundKind: 'DEPOSIT',
        depositAccountId: 'deposit-1',
        amount: 2_000_000,
        contraAccountId: 'coa-revenue',
      },
    ]);
  });

  it('folds several cash lines into a single CASH leg', async () => {
    paymentRepo.find.mockResolvedValue([
      paymentStub({ id: 'pay-1', amount: 300_000 }),
      paymentStub({ id: 'pay-2', amount: 200_000 }),
    ]);

    const legs = await service.build(invoiceStub(), actor);

    expect(legs).toHaveLength(1);
    expect(legs[0].amount).toBe(500_000);
    expect(legs[0].invoicePaymentIds).toEqual(['pay-1', 'pay-2']);
  });

  it('falls back to the line COA when no deposit fund was named', async () => {
    paymentRepo.find.mockResolvedValue([
      paymentStub({
        id: 'pay-card',
        paymentMethod: InvoicePaymentMethod.CARD,
        amount: 500_000,
        accountId: 'coa-1121',
        depositAccountId: undefined,
      }),
    ]);

    const legs = await service.build(invoiceStub(), actor);

    expect(legs[0].depositAccountId).toBe('coa-1121');
  });

  it('takes cashAccountId from the fund resolver, never from the payment COA', async () => {
    paymentRepo.find.mockResolvedValue([
      paymentStub({ accountId: 'coa-1111', amount: 100_000 }),
    ]);

    const legs = await service.build(invoiceStub(), actor);

    expect(cashFundResolver.resolveBranchCashFund).toHaveBeenCalledWith(
      'org-1',
      'branch-1',
    );
    expect(legs[0].cashAccountId).toBe('cash-fund-1');
  });

  it('propagates a missing branch cash fund so the caller aborts before writing', async () => {
    cashFundResolver.resolveBranchCashFund.mockRejectedValue(
      new BadRequestException('No cash fund configured for branch branch-1'),
    );

    await expect(service.build(invoiceStub(), actor)).rejects.toThrow(
      BadRequestException,
    );
  });
});
