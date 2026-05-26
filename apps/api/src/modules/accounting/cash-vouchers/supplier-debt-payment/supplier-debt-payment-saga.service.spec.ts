import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SupplierDebtPaymentSagaService } from './supplier-debt-payment-saga.service';
import { CashService } from '../../cash/cash.service';
import { CashFundResolverService } from '../../cash/cash-fund-resolver.service';
import { CashMovementType } from '../../cash/cash-movement.entity';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { CashVoucherCategoryResolverService } from '../shared/category-resolver.service';
import { DebtCollectionSagaStatus } from '../enums';
import { SupplierDebtStatus } from '../../../inventory/supplier-debt/supplier-debt.entity';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

function buildManager(debt: any) {
  let idCounter = 0;
  return {
    findOne: jest.fn(async () => null), // no existing saga (idempotency)
    query: jest.fn(async () => [{ id: 'acc-331' }]), // resolveAccountId 331
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
  const cashService = {
    recordMovement: jest
      .fn()
      .mockResolvedValue({ movement: { id: 'mv-1' }, journalEntryId: 'je-1' }),
  };
  const cashFundResolver = {
    resolveOrDefault: jest.fn().mockResolvedValue('cash-1'),
  };
  const docNumbering = {
    generate: jest.fn().mockResolvedValue('PC-26-00001'),
  };
  const categoryResolver = {
    resolveId: jest.fn().mockResolvedValue('cat-1'),
  };
  const dataSource = { transaction: jest.fn((cb) => cb(manager)), manager };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SupplierDebtPaymentSagaService,
      { provide: DataSource, useValue: dataSource },
      { provide: CashService, useValue: cashService },
      { provide: CashFundResolverService, useValue: cashFundResolver },
      { provide: DocumentNumberingService, useValue: docNumbering },
      { provide: CashVoucherCategoryResolverService, useValue: categoryResolver },
    ],
  }).compile();

  return {
    service: module.get(SupplierDebtPaymentSagaService),
    cashService,
  };
}

describe('SupplierDebtPaymentSagaService', () => {
  it('settles a debt fully: withdraws from the két once and marks the debt PAID', async () => {
    const debt = {
      id: 'sd-1',
      organizationId: 'org-1',
      status: SupplierDebtStatus.OPEN,
      originalAmount: 100,
      paidAmount: 0,
      remainingAmount: 100,
      referenceCode: 'PNK-1',
    };
    const manager = buildManager(debt);
    const { service, cashService } = await setup(manager);

    const result = await service.pay(
      {
        voucherDate: '2026-05-26',
        allocations: [{ supplierDebtId: 'sd-1', amount: 100 }],
      },
      'idem-key-1',
      actor,
    );

    expect(cashService.recordMovement).toHaveBeenCalledTimes(1);
    expect(cashService.recordMovement.mock.calls[0][0]).toMatchObject({
      type: CashMovementType.WITHDRAWAL,
      amount: 100,
      contraAccountId: 'acc-331',
    });
    expect(debt.status).toBe(SupplierDebtStatus.PAID);
    expect(debt.remainingAmount).toBe(0);
    expect(result.status).toBe(DebtCollectionSagaStatus.COMPLETED);
    expect(result.documentNumber).toBe('PC-26-00001');
  });

  it('rejects when the amount exceeds the remaining balance', async () => {
    const debt = {
      id: 'sd-1',
      organizationId: 'org-1',
      status: SupplierDebtStatus.OPEN,
      originalAmount: 50,
      paidAmount: 0,
      remainingAmount: 50,
      referenceCode: 'PNK-1',
    };
    const manager = buildManager(debt);
    const { service } = await setup(manager);

    await expect(
      service.pay(
        {
          voucherDate: '2026-05-26',
          allocations: [{ supplierDebtId: 'sd-1', amount: 100 }],
        },
        'idem-key-2',
        actor,
      ),
    ).rejects.toThrow(/exceeds remaining balance/);
  });

  it('rejects duplicate supplier debts in allocations', async () => {
    const manager = buildManager(null);
    const { service } = await setup(manager);

    await expect(
      service.pay(
        {
          voucherDate: '2026-05-26',
          allocations: [
            { supplierDebtId: 'sd-1', amount: 10 },
            { supplierDebtId: 'sd-1', amount: 20 },
          ],
        },
        'idem-key-3',
        actor,
      ),
    ).rejects.toThrow(/Duplicate supplier debt/);
  });
});
