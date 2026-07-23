import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DepositMovementType } from '@erp/shared-interfaces';
import { DepositDebtCollectionSagaService } from './deposit-debt-collection-saga.service';
import { DepositService } from '../../deposit/deposit.service';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { CashVoucherCategoryResolverService } from '../../cash-vouchers/shared/category-resolver.service';
import { DebtCollectionSagaStatus } from '../../cash-vouchers/enums';
import { AccountResolverService } from '../../payment-accounts/account-resolver.service';
import { DebtStatus } from '../../../pos/entities/invoice-debt.entity';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

function buildDebt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'debt-1',
    organizationId: 'org-1',
    status: DebtStatus.OPEN,
    originalAmount: 100,
    paidAmount: 0,
    remainingAmount: 100,
    referenceCode: 'INV-1',
    ...overrides,
  };
}

/** `existingSaga` simulates an idempotency-key replay. */
function buildManager(debt: any, existingSaga: any = null) {
  let idCounter = 0;
  return {
    findOne: jest.fn(async () => existingSaga),
    query: jest.fn(async () => []),
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        setLock: jest.fn(() => qb),
        where: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        getOne: jest.fn(async () => debt),
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
  const depositService = {
    recordMovement: jest
      .fn()
      .mockResolvedValue({ movement: { id: 'mv-1' }, journalEntryId: 'je-1' }),
  };
  const docNumbering = { generate: jest.fn().mockResolvedValue('PTTG-26-00001') };
  const categoryResolver = { resolveId: jest.fn().mockResolvedValue('cat-1') };
  const accountResolver = {
    resolveDefaultAccount: jest.fn().mockResolvedValue('acc-131'),
  };
  const dataSource = { transaction: jest.fn((cb) => cb(manager)), manager };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DepositDebtCollectionSagaService,
      { provide: DataSource, useValue: dataSource },
      { provide: DepositService, useValue: depositService },
      { provide: DocumentNumberingService, useValue: docNumbering },
      {
        provide: CashVoucherCategoryResolverService,
        useValue: categoryResolver,
      },
      { provide: AccountResolverService, useValue: accountResolver },
    ],
  }).compile();

  return {
    service: module.get(DepositDebtCollectionSagaService),
    depositService,
  };
}

describe('DepositDebtCollectionSagaService', () => {
  it('settles a debt fully: credits the deposit fund once and marks the debt PAID', async () => {
    const debt = buildDebt();
    const manager = buildManager(debt);
    const { service, depositService } = await setup(manager);

    const result = await service.collect(
      {
        docDate: '2026-07-22',
        depositAccountId: 'dep-1',
        allocations: [{ invoiceDebtId: 'debt-1', amount: 100 }],
      },
      'idem-key-1',
      actor,
    );

    expect(depositService.recordMovement).toHaveBeenCalledTimes(1);
    expect(depositService.recordMovement.mock.calls[0][0]).toMatchObject({
      depositAccountId: 'dep-1',
      type: DepositMovementType.DEPOSIT,
      amount: 100,
      contraAccountId: 'acc-131',
    });
    expect(debt.status).toBe(DebtStatus.PAID);
    expect(debt.remainingAmount).toBe(0);
    expect(result.status).toBe(DebtCollectionSagaStatus.COMPLETED);
    expect(result.documentNumber).toBe('PTTG-26-00001');
    expect(result.allocations[0].settled).toBe(true);
  });

  it('applies a partial collection without closing the debt', async () => {
    const debt = buildDebt();
    const manager = buildManager(debt);
    const { service } = await setup(manager);

    await service.collect(
      {
        docDate: '2026-07-22',
        depositAccountId: 'dep-1',
        allocations: [{ invoiceDebtId: 'debt-1', amount: 40 }],
      },
      'idem-key-partial',
      actor,
    );

    expect(debt.paidAmount).toBe(40);
    expect(debt.remainingAmount).toBe(60);
    expect(debt.status).toBe(DebtStatus.OPEN);
  });

  it('rejects when the collected amount exceeds the remaining balance', async () => {
    const manager = buildManager(buildDebt());
    const { service } = await setup(manager);

    await expect(
      service.collect(
        {
          docDate: '2026-07-22',
          depositAccountId: 'dep-1',
          allocations: [{ invoiceDebtId: 'debt-1', amount: 200 }],
        },
        'idem-key-2',
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate invoice debts in one request', async () => {
    const manager = buildManager(buildDebt());
    const { service } = await setup(manager);

    await expect(
      service.collect(
        {
          docDate: '2026-07-22',
          depositAccountId: 'dep-1',
          allocations: [
            { invoiceDebtId: 'debt-1', amount: 10 },
            { invoiceDebtId: 'debt-1', amount: 10 },
          ],
        },
        'idem-key-3',
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replays a completed saga for the same idempotency key without re-settling', async () => {
    const debt = buildDebt();
    const completed = {
      id: 'saga-1',
      status: DebtCollectionSagaStatus.COMPLETED,
      bankReceiptId: 'rcpt-1',
      totalAmount: 100,
      allocations: [{ invoiceDebtId: 'debt-1', amount: 100, settled: true }],
    };
    const manager = buildManager(debt, completed);
    const { service, depositService } = await setup(manager);

    const result = await service.collect(
      {
        docDate: '2026-07-22',
        depositAccountId: 'dep-1',
        allocations: [{ invoiceDebtId: 'debt-1', amount: 100 }],
      },
      'idem-key-1',
      actor,
    );

    expect(depositService.recordMovement).not.toHaveBeenCalled();
    expect(result.sagaId).toBe('saga-1');
    expect(result.status).toBe(DebtCollectionSagaStatus.COMPLETED);
    expect(debt.paidAmount).toBe(0);
  });

  it('rejects a replay while an earlier saga for the key is still PENDING', async () => {
    const manager = buildManager(buildDebt(), {
      id: 'saga-2',
      status: DebtCollectionSagaStatus.PENDING,
      allocations: [],
    });
    const { service } = await setup(manager);

    await expect(
      service.collect(
        {
          docDate: '2026-07-22',
          depositAccountId: 'dep-1',
          allocations: [{ invoiceDebtId: 'debt-1', amount: 100 }],
        },
        'idem-key-1',
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('compensate reopens the settled debt and drops the instalment', async () => {
    const debt = buildDebt({
      status: DebtStatus.PAID,
      paidAmount: 100,
      remainingAmount: 0,
    });
    const saga = {
      id: 'saga-1',
      status: DebtCollectionSagaStatus.COMPLETED,
      bankReceiptId: 'rcpt-1',
      allocations: [
        {
          invoiceDebtId: 'debt-1',
          amount: 100,
          settled: true,
          debtPaymentId: 'dp-1',
        },
      ],
    };
    const manager = buildManager(debt, saga);
    const { service } = await setup(manager);

    await service.compensate('rcpt-1', manager as never);

    expect(debt.paidAmount).toBe(0);
    expect(debt.remainingAmount).toBe(100);
    expect(debt.status).toBe(DebtStatus.OPEN);
    expect(manager.delete).toHaveBeenCalledWith(expect.anything(), 'dp-1');
    expect(saga.status).toBe(DebtCollectionSagaStatus.COMPENSATED);
  });
});
