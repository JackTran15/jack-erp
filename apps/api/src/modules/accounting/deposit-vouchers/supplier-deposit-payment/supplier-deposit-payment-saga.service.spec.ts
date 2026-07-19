import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { SupplierDepositPaymentSagaService } from './supplier-deposit-payment-saga.service';
import { SupplierDepositPaymentFund } from './dto/create-supplier-deposit-payment.dto';
import { BankPaymentsService } from '../bank-payments/bank-payments.service';
import { CashPaymentsService } from '../../cash-vouchers/cash-payments/cash-payments.service';
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import { BankPaymentPurpose, BankPaymentReferenceType } from '../enums';
import { CashPaymentPurpose } from '../../cash-vouchers/enums';
import { DebtCollectionSagaStatus } from '../../cash-vouchers/enums';
import { SupplierDebtStatus } from '../../../inventory/supplier-debt/supplier-debt.entity';
import { SupplierDebtPaymentEntity } from '../../../inventory/supplier-debt/supplier-debt-payment.entity';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

function buildManager(debts: Record<string, any>, existingSaga: any = null) {
  let idCounter = 0;
  return {
    findOne: jest.fn(async (entity: any, opts: any) => {
      if (entity?.name === 'SupplierDepositPaymentSagaEntity' || opts?.where?.idempotencyKey) {
        return existingSaga;
      }
      const debtId = opts?.where?.bankPaymentId ?? null;
      return debtId ? existingSaga : null;
    }),
    createQueryBuilder: jest.fn(() => {
      let lastDebtId: string;
      const qb: any = {
        setLock: jest.fn(() => qb),
        where: jest.fn((_cond: string, params: any) => {
          lastDebtId = params?.id;
          return qb;
        }),
        andWhere: jest.fn(() => qb),
        getOne: jest.fn(async () => debts[lastDebtId] ?? null),
      };
      return qb;
    }),
    create: jest.fn((_e: any, data: any) => ({
      id: data.id ?? `gen-${++idCounter}`,
      ...data,
    })),
    save: jest.fn(async (e: any) => e),
    delete: jest.fn(async () => undefined),
  };
}

async function setup(manager: any) {
  const bankPayment = {
    createAndPostInternal: jest
      .fn()
      .mockResolvedValue({ voucherId: 'bp-1', voucherNumber: 'UNC-26-00001' }),
  };
  const cashPayment = {
    createAndPostInternal: jest
      .fn()
      .mockResolvedValue({ voucherId: 'cp-1', voucherNumber: 'PC-26-00001' }),
  };
  const cashFundResolver = {
    resolveCoaAccountIdByCode: jest.fn().mockResolvedValue('acc-331'),
    resolveOrDefault: jest.fn().mockResolvedValue('cash-1'),
  };
  const dataSource = { transaction: jest.fn((cb) => cb(manager)), manager };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SupplierDepositPaymentSagaService,
      { provide: DataSource, useValue: dataSource },
      { provide: BankPaymentsService, useValue: bankPayment },
      { provide: CashPaymentsService, useValue: cashPayment },
      { provide: CashFundResolverService, useValue: cashFundResolver },
    ],
  }).compile();

  return {
    service: module.get(SupplierDepositPaymentSagaService),
    bankPayment,
    cashPayment,
  };
}

describe('SupplierDepositPaymentSagaService', () => {
  it('pays a supplier debt fully via the DEPOSIT fund', async () => {
    const debt = {
      id: 'sd-1',
      organizationId: 'org-1',
      status: SupplierDebtStatus.OPEN,
      originalAmount: 100,
      paidAmount: 0,
      remainingAmount: 100,
      referenceCode: 'PNK-1',
    };
    const manager = buildManager({ 'sd-1': debt });
    const { service, bankPayment, cashPayment } = await setup(manager);

    const result = await service.pay(
      {
        docDate: '2026-07-16',
        legs: [{ fund: SupplierDepositPaymentFund.DEPOSIT, depositAccountId: 'dep-1', amount: 100 }],
        allocations: [{ supplierDebtId: 'sd-1', amount: 100 }],
      },
      'idem-key-1',
      actor,
    );

    expect(bankPayment.createAndPostInternal).toHaveBeenCalledTimes(1);
    expect(bankPayment.createAndPostInternal.mock.calls[0][0]).toMatchObject({
      purpose: BankPaymentPurpose.SUPPLIER_PAYMENT,
      depositAccountId: 'dep-1',
      contraAccountId: 'acc-331',
      amount: 100,
      referenceType: BankPaymentReferenceType.PAYABLE,
    });
    expect(cashPayment.createAndPostInternal).not.toHaveBeenCalled();
    expect(debt.status).toBe(SupplierDebtStatus.PAID);
    expect(debt.remainingAmount).toBe(0);
    expect(result.status).toBe(DebtCollectionSagaStatus.COMPLETED);
    expect(result.bankPaymentId).toBe('bp-1');

    // Regression: `supplier_debt_payments.cash_payment_id` FKs to `cash_payments`
    // only. Writing the DEPOSIT leg's bank_payment id there violates that FK in
    // Postgres (this mocked manager doesn't enforce it, which is exactly why the
    // bug shipped) — a deposit-only saga must leave it unset.
    const instalmentCall = manager.create.mock.calls.find(
      (call: unknown[]) => call[0] === SupplierDebtPaymentEntity,
    );
    expect((instalmentCall?.[1] as { cashPaymentId?: string })?.cashPaymentId).toBeUndefined();
  });

  it('BR-BUY-01: rejects when the allocation exceeds the remaining payable', async () => {
    const debt = {
      id: 'sd-1',
      organizationId: 'org-1',
      status: SupplierDebtStatus.OPEN,
      originalAmount: 50,
      paidAmount: 0,
      remainingAmount: 50,
      referenceCode: 'PNK-1',
    };
    const manager = buildManager({ 'sd-1': debt });
    const { service } = await setup(manager);

    await expect(
      service.pay(
        {
          docDate: '2026-07-16',
          legs: [{ fund: SupplierDepositPaymentFund.DEPOSIT, depositAccountId: 'dep-1', amount: 100 }],
          allocations: [{ supplierDebtId: 'sd-1', amount: 100 }],
        },
        'idem-key-2',
        actor,
      ),
    ).rejects.toThrow(/exceeds remaining balance/);
  });

  it('BR-BUY-03: mixed CASH+DEPOSIT legs post 2 vouchers under the same saga', async () => {
    const debt = {
      id: 'sd-1',
      organizationId: 'org-1',
      status: SupplierDebtStatus.OPEN,
      originalAmount: 100,
      paidAmount: 0,
      remainingAmount: 100,
      referenceCode: 'PNK-1',
    };
    const manager = buildManager({ 'sd-1': debt });
    const { service, bankPayment, cashPayment } = await setup(manager);

    const result = await service.pay(
      {
        docDate: '2026-07-16',
        legs: [
          { fund: SupplierDepositPaymentFund.DEPOSIT, depositAccountId: 'dep-1', amount: 60 },
          { fund: SupplierDepositPaymentFund.CASH, amount: 40 },
        ],
        allocations: [{ supplierDebtId: 'sd-1', amount: 100 }],
      },
      'idem-key-3',
      actor,
    );

    expect(bankPayment.createAndPostInternal).toHaveBeenCalledTimes(1);
    expect(cashPayment.createAndPostInternal).toHaveBeenCalledTimes(1);
    expect(cashPayment.createAndPostInternal.mock.calls[0][0]).toMatchObject({
      purpose: CashPaymentPurpose.SUPPLIER_PAYMENT,
      cashAccountId: 'cash-1',
      amount: 40,
    });
    expect(result.bankPaymentId).toBe('bp-1');
    expect(result.cashPaymentId).toBe('cp-1');
    expect(debt.status).toBe(SupplierDebtStatus.PAID);
  });

  it('rejects when the sum of legs does not equal the sum of allocations', async () => {
    const manager = buildManager({});
    const { service } = await setup(manager);

    await expect(
      service.pay(
        {
          docDate: '2026-07-16',
          legs: [{ fund: SupplierDepositPaymentFund.DEPOSIT, depositAccountId: 'dep-1', amount: 50 }],
          allocations: [{ supplierDebtId: 'sd-1', amount: 100 }],
        },
        'idem-key-4',
        actor,
      ),
    ).rejects.toThrow(/must equal sum of allocation amounts/);
  });

  it('rejects duplicate supplier debts in allocations', async () => {
    const manager = buildManager({});
    const { service } = await setup(manager);

    await expect(
      service.pay(
        {
          docDate: '2026-07-16',
          legs: [{ fund: SupplierDepositPaymentFund.DEPOSIT, depositAccountId: 'dep-1', amount: 30 }],
          allocations: [
            { supplierDebtId: 'sd-1', amount: 10 },
            { supplierDebtId: 'sd-1', amount: 20 },
          ],
        },
        'idem-key-5',
        actor,
      ),
    ).rejects.toThrow(/Duplicate supplier debt/);
  });

  describe('compensate', () => {
    it('reopens every settled debt and removes its instalment (BR-BUY-04)', async () => {
      const debt = {
        id: 'sd-1',
        originalAmount: 100,
        paidAmount: 100,
        remainingAmount: 0,
        status: SupplierDebtStatus.PAID,
      };
      const saga = {
        id: 'saga-1',
        bankPaymentId: 'bp-1',
        status: DebtCollectionSagaStatus.COMPLETED,
        allocations: [
          { supplierDebtId: 'sd-1', amount: 100, settled: true, supplierDebtPaymentId: 'instalment-1' },
        ],
      };
      const manager = buildManager({ 'sd-1': debt }, saga);
      const { service } = await setup(manager);

      await service.compensate('bp-1', manager as any);

      expect(debt.status).toBe(SupplierDebtStatus.OPEN);
      expect(debt.remainingAmount).toBe(100);
      expect(saga.status).toBe(DebtCollectionSagaStatus.COMPENSATED);
      expect(manager.delete).toHaveBeenCalledWith(expect.anything(), 'instalment-1');
    });

    it('is a no-op when no saga is linked to the payment', async () => {
      const manager = buildManager({}, null);
      const { service } = await setup(manager);

      await expect(service.compensate('bp-unknown', manager as any)).resolves.toBeUndefined();
      expect(manager.save).not.toHaveBeenCalled();
    });
  });
});
