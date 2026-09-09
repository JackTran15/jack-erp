import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DepositMovementType, ReconStatus } from '@erp/shared-interfaces';
import { BankPaymentsService } from './bank-payments.service';
import { BankPaymentEntity } from './bank-payment.entity';
import { BankPaymentLineEntity } from './bank-payment-line.entity';
import { DepositService } from '../../deposit/deposit.service';
import { DepositAccountEntity } from '../../deposit/deposit-account.entity';
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
import { BranchEntity } from '../../../branch/branch.entity';
import { CashVoucherCategoryEntity } from '../../cash-vouchers/cash-voucher-categories/cash-voucher-category.entity';

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
    softDelete: jest.fn(async () => undefined),
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

    it('overrides the catalogue name with a hand-typed partnerName, keeping partnerId (ADR-02)', async () => {
      const manager = buildManager({
        findOneResult: { id: 'p-new', status: BankVoucherStatus.POSTED },
      });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'NCC thật',
        address: 'HCM',
      });

      await service.create(
        {
          depositAccountId: 'dep-1',
          docDate: '2026-07-15',
          purpose: BankPaymentPurpose.SUPPLIER_PAYMENT,
          totalAmount: 100,
          partnerType: 'SUPPLIER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          partnerName: 'NCC thật — CN Bình Tân',
          lines: [{ description: 'Trả NCC', amount: 100 }],
        } as any,
        actor,
      );

      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === BankVoucherStatus.POSTED,
      );
      expect(created[1].partnerNameSnapshot).toBe('NCC thật — CN Bình Tân');
      expect(created[1].partnerId).toBe('11111111-1111-4111-8111-111111111111');
    });

    it('falls back to the catalogue name when partnerName is not sent (auto-create paths unaffected)', async () => {
      const manager = buildManager({
        findOneResult: { id: 'p-new', status: BankVoucherStatus.POSTED },
      });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'NCC thật',
        address: 'HCM',
      });

      await service.create(
        {
          depositAccountId: 'dep-1',
          docDate: '2026-07-15',
          purpose: BankPaymentPurpose.SUPPLIER_PAYMENT,
          totalAmount: 100,
          partnerType: 'SUPPLIER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          lines: [{ description: 'Trả NCC', amount: 100 }],
        } as any,
        actor,
      );

      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === BankVoucherStatus.POSTED,
      );
      expect(created[1].partnerNameSnapshot).toBe('NCC thật');
    });
  });

  describe('free-text party', () => {
    it('stores a hand-typed name without a lookup, and drops partnerId', async () => {
      const manager = buildManager({
        findOneResult: { id: 'p-new', status: BankVoucherStatus.POSTED },
      });
      await setup(manager);

      await service.create(
        {
          depositAccountId: 'dep-1',
          docDate: '2026-07-15',
          purpose: BankPaymentPurpose.OTHER,
          totalAmount: 100,
          partnerType: 'OTHER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          partnerName: '  Nguyễn Văn A  ',
          lines: [{ description: 'Chi khác', amount: 100 }],
        } as any,
        actor,
      );

      expect(partnerResolver.resolve).not.toHaveBeenCalled();
      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === BankVoucherStatus.POSTED,
      );
      expect(created[1].partnerNameSnapshot).toBe('Nguyễn Văn A');
      expect(created[1].partnerId).toBeUndefined();
    });

    it('clears partnerId when an update switches to a hand-typed party', async () => {
      const payment = {
        id: 'p-new',
        status: BankVoucherStatus.POSTED,
        referenceType: BankPaymentReferenceType.MANUAL,
        revision: 0,
        totalAmount: 0,
        branchId: 'branch-1',
        docDate: '2026-07-15',
        documentNumber: 'UNC-26-00001',
        organizationId: 'org-1',
        partnerType: 'CUSTOMER',
        partnerId: '11111111-1111-4111-8111-111111111111',
        partnerNameSnapshot: 'Khách hàng thật',
        partnerAddressSnapshot: 'HCM',
      };
      const manager = buildManager({ qbResult: payment, findOneResult: payment });
      await setup(manager);

      await service.update(
        'p-new',
        { revision: 0, partnerType: 'OTHER', partnerName: 'Nguyễn Văn A' } as any,
        actor,
      );

      expect(payment.partnerId).toBeNull();
      expect(payment.partnerNameSnapshot).toBe('Nguyễn Văn A');
    });
  });

  describe('update — party snapshot (ADR-02)', () => {
    it('overrides the catalogue name with a hand-typed partnerName, keeping the catalogue link', async () => {
      const payment = {
        id: 'p-1',
        status: BankVoucherStatus.POSTED,
        referenceType: BankPaymentReferenceType.MANUAL,
        revision: 0,
        totalAmount: 0,
        branchId: 'branch-1',
        docDate: '2026-07-15',
        documentNumber: 'UNC-26-00001',
        organizationId: 'org-1',
        partnerType: 'SUPPLIER',
        partnerId: '11111111-1111-4111-8111-111111111111',
        partnerNameSnapshot: 'NCC thật',
        partnerAddressSnapshot: 'HCM',
      };
      const manager = buildManager({ qbResult: payment, findOneResult: payment });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'NCC thật',
        address: 'HCM',
      });

      await service.update(
        'p-1',
        {
          revision: 0,
          partnerType: 'SUPPLIER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          partnerName: 'NCC thật — CN Bình Tân',
        } as any,
        actor,
      );

      expect(payment.partnerNameSnapshot).toBe('NCC thật — CN Bình Tân');
      expect(payment.partnerId).toBe('11111111-1111-4111-8111-111111111111');
    });

    it('clears the snapshot to null (not the old value) when partnerName is sent as an empty string', async () => {
      const payment = {
        id: 'p-1',
        status: BankVoucherStatus.POSTED,
        referenceType: BankPaymentReferenceType.MANUAL,
        revision: 0,
        totalAmount: 0,
        branchId: 'branch-1',
        docDate: '2026-07-15',
        documentNumber: 'UNC-26-00001',
        organizationId: 'org-1',
        partnerType: 'SUPPLIER',
        partnerId: '11111111-1111-4111-8111-111111111111',
        partnerNameSnapshot: 'NCC thật',
        partnerAddressSnapshot: 'HCM',
      };
      const manager = buildManager({ qbResult: payment, findOneResult: payment });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'NCC thật',
        address: 'HCM',
      });

      // TypeORM's save() skips `undefined` as "not provided" — an explicit ''
      // is what proves the snapshot was actually cleared, not just left alone.
      await service.update(
        'p-1',
        { revision: 0, partnerName: '' } as any,
        actor,
      );

      expect(payment.partnerNameSnapshot).toBeNull();
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

  describe('getPrintPayload (T-03-03, AC-11)', () => {
    const basePayment = {
      id: 'p-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
      documentNumber: 'UNC-26-00001',
      docDate: '2026-09-08',
      status: BankVoucherStatus.POSTED,
      purpose: BankPaymentPurpose.OTHER,
      partnerNameSnapshot: 'Công ty A',
      partnerAddressSnapshot: '123 Lê Lợi',
      payeeName: 'Công ty A',
      reason: 'Chi tiền mua vật tư',
      reference: 'UNC000456',
      depositAccountId: 'dep-acc-1',
      contraAccountId: 'contra-1',
      totalAmount: 500000,
      referenceType: BankPaymentReferenceType.MANUAL,
      revision: 0,
      lines: [
        { id: 'line-1', description: 'Mua vật tư', categoryId: 'cat-1', amount: 500000 },
      ],
    };

    /**
     * Entity-aware `EntityManager` mock: `getPrintPayload` fans out to
     * `getById` (via `manager.findOne`), `loadVoucherBranch` (via
     * `manager.getRepository(BranchEntity).findOne`), and the service's own
     * `manager.findOne`/`manager.find` for the deposit account and categories.
     * The `BankPaymentEntity` branch mirrors the real query's WHERE clause so
     * an org/id mismatch reproduces the same 404 `getById` would give.
     */
    function buildPrintPayloadManager(
      opts: {
        payment?: typeof basePayment;
        branch?: any;
        depositAccount?: any;
        categories?: any[];
      } = {},
    ) {
      const manager: any = {
        findOne: jest.fn(async (entity: any, options: any) => {
          if (entity === BankPaymentEntity) {
            const payment = opts.payment;
            if (!payment) return null;
            if (options.where.organizationId !== payment.organizationId) return null;
            if (options.where.id !== payment.id) return null;
            return payment;
          }
          if (entity === DepositAccountEntity) return opts.depositAccount ?? null;
          return null;
        }),
        find: jest.fn(async (entity: any) =>
          entity === CashVoucherCategoryEntity ? opts.categories ?? [] : [],
        ),
        getRepository: jest.fn((entity: any) => ({
          findOne: jest.fn(async () =>
            entity === BranchEntity ? opts.branch ?? null : null,
          ),
        })),
      };
      return manager;
    }

    it('resolves branch, bank account name and category names into a BANK_PAYMENT payload', async () => {
      const manager = buildPrintPayloadManager({
        payment: basePayment,
        branch: {
          id: 'branch-1',
          name: 'Chi nhánh Q1',
          address: '1 Đường ABC',
          phone: '0900000000',
        },
        depositAccount: { id: 'dep-acc-1', name: 'Vietcombank CN Q1' },
        categories: [{ id: 'cat-1', name: 'Mua vật tư' }],
      });
      await setup(manager);

      const payload = await service.getPrintPayload('p-1', actor);

      expect(payload.kind).toBe('BANK_PAYMENT');
      expect(payload.paper).toBe('A5');
      expect(payload.title).toBe('PHIẾU CHI (tiền gửi)');
      expect(payload.docNo).toBe('UNC-26-00001');
      expect(payload.branch).toEqual({
        name: 'Chi nhánh Q1',
        address: '1 Đường ABC',
        phone: '0900000000',
      });
      expect(payload.info).toContainEqual({
        label: 'Tài khoản ngân hàng',
        value: 'Vietcombank CN Q1',
      });
      expect(payload.lines[0]).toMatchObject({
        categoryName: 'Mua vật tư',
        amount: 500000,
      });
    });

    it('id not found ⇒ 404 (not 403)', async () => {
      const manager = buildPrintPayloadManager({ payment: undefined });
      await setup(manager);

      await expect(service.getPrintPayload('missing-id', actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('voucher of another organization ⇒ 404, same as sibling GET :id', async () => {
      const manager = buildPrintPayloadManager({
        payment: { ...basePayment, organizationId: 'org-2' },
      });
      await setup(manager);

      await expect(service.getPrintPayload('p-1', actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
