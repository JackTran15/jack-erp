import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DepositMovementType, ReconStatus } from '@erp/shared-interfaces';
import { BankPaymentsService } from './bank-payments.service';
import { BankPaymentEntity } from './bank-payment.entity';
import { BankPaymentLineEntity } from './bank-payment-line.entity';
import { DepositService } from '../../deposit/deposit.service';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { PartnerResolverService } from '../../cash-vouchers/shared/partner-resolver.service';
import { AccountResolverService } from '../../payment-accounts/account-resolver.service';
import { AccountingDefaultAccountRole } from '../../payment-accounts/enums';
import { SupplierDepositPaymentSagaService } from '../supplier-deposit-payment/supplier-deposit-payment-saga.service';
import { DepositPeriodGuardService } from '../../deposit-period-lock/deposit-period-guard.service';
import { VoucherStaffResolver } from '../shared/voucher-staff.resolver';
import {
  BankPaymentPurpose,
  BankPaymentReferenceType,
  BankVoucherStatus,
} from '../enums';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

function buildManager(opts: {
  qbResult?: any;
  findResults?: any[];
  findOneResult?: any;
}) {
  let idCounter = 0;
  const manager: any = {
    createQueryBuilder: jest.fn(() => {
      const qb: any = {
        setLock: jest.fn(() => qb),
        where: jest.fn(() => qb),
        andWhere: jest.fn(() => qb),
        getOne: jest.fn(async () => opts.qbResult ?? null),
      };
      return qb;
    }),
    find: jest.fn(async () => opts.findResults ?? []),
    findOne: jest.fn(async () => opts.findOneResult ?? null),
    create: jest.fn((_entity: any, data: any) => ({
      id: data.id ?? `gen-${++idCounter}`,
      ...data,
    })),
    save: jest.fn(async (entity: any) => entity),
    update: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
  };
  return manager;
}

describe('BankPaymentsService', () => {
  let service: BankPaymentsService;
  let depositService: { recordMovement: jest.Mock };
  let docNumbering: { generate: jest.Mock };
  let partnerResolver: { resolve: jest.Mock };
  let accountResolver: { resolveContraAccount: jest.Mock };
  let supplierDepositPaymentSaga: { compensate: jest.Mock };
  let periodGuard: { assertNotLocked: jest.Mock };
  let dataSource: { transaction: jest.Mock; manager: any };

  const setup = async (manager: any) => {
    depositService = {
      recordMovement: jest
        .fn()
        .mockResolvedValue({ movement: { id: 'mv-1' }, journalEntryId: 'je-1' }),
    };
    docNumbering = { generate: jest.fn().mockResolvedValue('UNC-26-00001') };
    partnerResolver = { resolve: jest.fn().mockResolvedValue(null) };
    accountResolver = {
      resolveContraAccount: jest.fn().mockResolvedValue('contra-resolved'),
    };
    supplierDepositPaymentSaga = { compensate: jest.fn().mockResolvedValue(undefined) };
    periodGuard = { assertNotLocked: jest.fn().mockResolvedValue(undefined) };
    dataSource = {
      transaction: jest.fn((cb) => cb(manager)),
      manager,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankPaymentsService,
        { provide: getRepositoryToken(BankPaymentEntity), useValue: {} },
        { provide: getRepositoryToken(BankPaymentLineEntity), useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: DepositService, useValue: depositService },
        { provide: DocumentNumberingService, useValue: docNumbering },
        { provide: PartnerResolverService, useValue: partnerResolver },
        { provide: AccountResolverService, useValue: accountResolver },
        { provide: DepositPeriodGuardService, useValue: periodGuard },
        // Read paths resolve the cashier name; the specs assert voucher fields,
        // so an empty resolution is enough.
        {
          provide: VoucherStaffResolver,
          useValue: { resolveMany: jest.fn().mockResolvedValue(new Map()) },
        },
        {
          provide: SupplierDepositPaymentSagaService,
          useValue: supplierDepositPaymentSaga,
        },
      ],
    }).compile();

    service = module.get(BankPaymentsService);
  };

  describe('create', () => {
    it('auto-posts: resolves contra by purpose and records a WITHDRAWAL movement', async () => {
      const manager = buildManager({
        findOneResult: {
          id: 'p-new',
          status: BankVoucherStatus.POSTED,
          documentNumber: 'UNC-26-00001',
        },
      });
      await setup(manager);

      await service.create(
        {
          depositAccountId: 'dep-1',
          docDate: '2026-07-15',
          purpose: BankPaymentPurpose.SUPPLIER_PAYMENT,
          totalAmount: 100,
          lines: [{ description: 'Trả NCC', amount: 100 }],
        } as any,
        actor,
      );

      expect(accountResolver.resolveContraAccount).toHaveBeenCalledWith(
        AccountingDefaultAccountRole.PAYABLE,
        actor,
        undefined,
      );
      expect(depositService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          depositAccountId: 'dep-1',
          type: DepositMovementType.WITHDRAWAL,
          amount: 100,
          contraAccountId: 'contra-resolved',
        }),
        actor,
        manager,
      );
    });

    it('forces affect_expense=false for CASH_TRANSFER (BR-CHI-05)', async () => {
      const manager = buildManager({
        findOneResult: { id: 'p-new', status: BankVoucherStatus.POSTED },
      });
      await setup(manager);

      await service.create(
        {
          depositAccountId: 'dep-1',
          docDate: '2026-07-15',
          purpose: BankPaymentPurpose.CASH_TRANSFER,
          affectExpense: true,
          contraAccountId: 'cash-coa',
          totalAmount: 50,
          lines: [{ description: 'Rút về quỹ tiền mặt', amount: 50 }],
        } as any,
        actor,
      );

      const createdVoucher = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === BankVoucherStatus.POSTED,
      );
      expect(createdVoucher).toBeDefined();
      expect(createdVoucher[1].affectExpense).toBe(false);
    });

    it('rejects when total_amount does not match the line sum', async () => {
      const manager = buildManager({});
      await setup(manager);

      await expect(
        service.create(
          {
            depositAccountId: 'dep-1',
            docDate: '2026-07-15',
            totalAmount: 100,
            lines: [{ description: 'x', amount: 80 }],
          } as any,
          actor,
        ),
      ).rejects.toThrow(/must equal sum/);
      expect(depositService.recordMovement).not.toHaveBeenCalled();
    });

    it('BR-LOCK-01: rejects when docDate falls in a locked period', async () => {
      const manager = buildManager({ findOneResult: { id: 'dep-1' } });
      await setup(manager);
      periodGuard.assertNotLocked.mockRejectedValue(
        new BadRequestException('Period 2026-06 is locked for this branch (BR-LOCK-01)'),
      );

      await expect(
        service.create(
          {
            depositAccountId: 'dep-1',
            docDate: '2026-06-15',
            totalAmount: 100,
            lines: [{ description: 'x', amount: 100 }],
          } as any,
          actor,
        ),
      ).rejects.toThrow(/BR-LOCK-01/);
      expect(depositService.recordMovement).not.toHaveBeenCalled();
    });
  });

  describe('post', () => {
    it('records a WITHDRAWAL movement and marks the payment POSTED', async () => {
      const payment: any = {
        id: 'p-1',
        organizationId: 'org-1',
        status: BankVoucherStatus.DRAFT,
        depositAccountId: 'dep-1',
        contraAccountId: 'contra-1',
        docDate: '2026-07-15',
        totalAmount: 100,
      };
      const manager = buildManager({
        qbResult: payment,
        findResults: [{ amount: 100 }],
        findOneResult: payment,
      });
      await setup(manager);

      const result = await service.post('p-1', actor);

      expect(depositService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          depositAccountId: 'dep-1',
          type: DepositMovementType.WITHDRAWAL,
          amount: 100,
          contraAccountId: 'contra-1',
          documentNumber: 'UNC-26-00001',
        }),
        actor,
        manager,
      );
      expect(result.status).toBe(BankVoucherStatus.POSTED);
      expect(result.depositMovementId).toBe('mv-1');
      expect(result.journalEntryId).toBe('je-1');
    });

    it('BR-LOCK-01: rejects posting a DRAFT whose docDate falls in a locked period', async () => {
      const payment: any = {
        id: 'p-1',
        organizationId: 'org-1',
        status: BankVoucherStatus.DRAFT,
        depositAccountId: 'dep-1',
        contraAccountId: 'contra-1',
        docDate: '2026-06-15',
        totalAmount: 100,
      };
      const manager = buildManager({
        qbResult: payment,
        findResults: [{ amount: 100 }],
      });
      await setup(manager);
      periodGuard.assertNotLocked.mockRejectedValue(
        new BadRequestException('Period 2026-06 is locked for this branch (BR-LOCK-01)'),
      );

      await expect(service.post('p-1', actor)).rejects.toThrow(/BR-LOCK-01/);
      expect(depositService.recordMovement).not.toHaveBeenCalled();
    });

    it('propagates insufficient-balance (400) from recordMovement (BR-CHI-01)', async () => {
      const payment: any = {
        id: 'p-1',
        organizationId: 'org-1',
        status: BankVoucherStatus.DRAFT,
        depositAccountId: 'dep-1',
        contraAccountId: 'contra-1',
        docDate: '2026-07-15',
        totalAmount: 100,
      };
      const manager = buildManager({
        qbResult: payment,
        findResults: [{ amount: 100 }],
      });
      await setup(manager);
      depositService.recordMovement.mockRejectedValue(
        new BadRequestException('Insufficient deposit balance. Current: 0'),
      );

      await expect(service.post('p-1', actor)).rejects.toThrow(
        /Insufficient deposit balance/,
      );
    });
  });

  describe('reverse', () => {
    const original: any = {
      id: 'p-1',
      organizationId: 'org-1',
      status: BankVoucherStatus.POSTED,
      documentNumber: 'UNC-26-00001',
      depositAccountId: 'dep-1',
      contraAccountId: 'contra-1',
      totalAmount: 100,
      purpose: BankPaymentPurpose.SUPPLIER_PAYMENT,
    };

    it('posts an opposite DEPOSIT, copies lines and flips original to REVERSED', async () => {
      const manager = buildManager({
        qbResult: { ...original },
        findResults: [
          { description: 'line', amount: 100, categoryId: null, referenceNote: null },
        ],
        findOneResult: { id: 'p-1', status: BankVoucherStatus.REVERSED },
      });
      await setup(manager);
      depositService.recordMovement.mockResolvedValue({
        movement: { id: 'mv-2' },
        journalEntryId: 'je-2',
      });

      await service.reverse('p-1', 'wrong supplier', actor);

      expect(depositService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          type: DepositMovementType.DEPOSIT,
          amount: 100,
          contraAccountId: 'contra-1',
        }),
        actor,
        manager,
      );
      const createdReversal = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.referenceType === BankPaymentReferenceType.REVERSAL,
      );
      expect(createdReversal).toBeDefined();
      expect(createdReversal[1].reversesVoucherId).toBe('p-1');
      expect(createdReversal[1].reversalReason).toBe('wrong supplier');
      expect(createdReversal[1].depositMovementId).toBe('mv-2');
      const copiedLine = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.bankPaymentId && c[1]?.amount === 100,
      );
      expect(copiedLine).toBeDefined();
      expect(supplierDepositPaymentSaga.compensate).toHaveBeenCalledWith(
        'p-1',
        manager,
      );
    });

    it('BR-BUY-04: blocks reverse when the deposit movement is already reconciled', async () => {
      const withMovement = { ...original, depositMovementId: 'mv-1' };
      const manager = buildManager({
        qbResult: { ...withMovement },
        findOneResult: { id: 'mv-1', reconStatus: ReconStatus.DA },
      });
      await setup(manager);

      await expect(service.reverse('p-1', 'wrong supplier', actor)).rejects.toThrow(
        /already been reconciled/,
      );
      expect(depositService.recordMovement).not.toHaveBeenCalled();
      expect(supplierDepositPaymentSaga.compensate).not.toHaveBeenCalled();
    });
  });
});
