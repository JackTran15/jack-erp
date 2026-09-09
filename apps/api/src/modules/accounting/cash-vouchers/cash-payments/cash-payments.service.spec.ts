import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CashPaymentsService } from './cash-payments.service';
import { CashPaymentEntity } from './cash-payment.entity';
import { CashPaymentLineEntity } from './cash-payment-line.entity';
import { CashService } from '../../cash/cash.service';
import { CashMovementType } from '../../cash/cash-movement.entity';
import { CashAccountEntity } from '../../cash/cash-account.entity';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { PartnerResolverService } from '../shared/partner-resolver.service';
import { AccountResolverService } from '../../payment-accounts/account-resolver.service';
import { VoucherLinksService } from '../../voucher-links/voucher-links.service';
import { AccountingDefaultAccountRole } from '../../payment-accounts/enums';
import { SupplierDebtPaymentSagaService } from '../supplier-debt-payment/supplier-debt-payment-saga.service';
import {
  CashPaymentPurpose,
  CashPaymentReferenceType,
  CashVoucherStatus,
} from '../enums';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../../branch/branch.entity';
import { CashVoucherCategoryEntity } from '../cash-voucher-categories/cash-voucher-category.entity';

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

describe('CashPaymentsService', () => {
  let service: CashPaymentsService;
  let cashService: { recordMovement: jest.Mock };
  let docNumbering: { generate: jest.Mock };
  let partnerResolver: { resolve: jest.Mock };
  let accountResolver: { resolveContraAccount: jest.Mock };
  let dataSource: { transaction: jest.Mock; manager: any };

  const setup = async (manager: any) => {
    cashService = {
      recordMovement: jest
        .fn()
        .mockResolvedValue({ movement: { id: 'mv-1' }, journalEntryId: 'je-1' }),
    };
    docNumbering = { generate: jest.fn().mockResolvedValue('PC-26-00001') };
    partnerResolver = { resolve: jest.fn().mockResolvedValue(null) };
    accountResolver = {
      resolveContraAccount: jest.fn().mockResolvedValue('contra-resolved'),
    };
    dataSource = { transaction: jest.fn((cb) => cb(manager)), manager };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashPaymentsService,
        { provide: getRepositoryToken(CashPaymentEntity), useValue: {} },
        { provide: getRepositoryToken(CashPaymentLineEntity), useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: CashService, useValue: cashService },
        { provide: DocumentNumberingService, useValue: docNumbering },
        { provide: PartnerResolverService, useValue: partnerResolver },
        { provide: AccountResolverService, useValue: accountResolver },
        {
          provide: VoucherLinksService,
          useValue: { findLinkedVoucher: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: SupplierDebtPaymentSagaService,
          useValue: { compensate: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(CashPaymentsService);
  };

  describe('create', () => {
    it('auto-posts: resolves contra by purpose and records a WITHDRAWAL', async () => {
      const manager = buildManager({
        findOneResult: {
          id: 'p-new',
          status: CashVoucherStatus.POSTED,
          documentNumber: 'PC-26-00001',
        },
      });
      await setup(manager);

      const result = await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashPaymentPurpose.SUPPLIER_PAYMENT,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          lines: [{ description: 'Trả NCC', amount: 100 }],
        } as any,
        actor,
      );

      // SUPPLIER_PAYMENT purpose → PAYABLE contra account, resolved server-side.
      expect(accountResolver.resolveContraAccount).toHaveBeenCalledWith(
        AccountingDefaultAccountRole.PAYABLE,
        actor,
        undefined,
      );
      expect(cashService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          cashAccountId: 'cash-1',
          type: CashMovementType.WITHDRAWAL,
          amount: 100,
          contraAccountId: 'contra-resolved',
        }),
        actor,
        manager,
      );
      const createdVoucher = manager.create.mock.calls.find(
        (c: any[]) =>
          c[1]?.status === CashVoucherStatus.POSTED &&
          c[1]?.cashMovementId === 'mv-1',
      );
      expect(createdVoucher).toBeDefined();
      expect(createdVoucher[1].referenceType).toBe(
        CashPaymentReferenceType.MANUAL,
      );
      expect(createdVoucher[1].contraAccountId).toBe('contra-resolved');
      expect(result.status).toBe(CashVoucherStatus.POSTED);
    });

    it('honours an explicit contra override (e.g. transfer destination)', async () => {
      const manager = buildManager({
        findOneResult: { id: 'p-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);
      accountResolver.resolveContraAccount.mockResolvedValue('transfer-coa');

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashPaymentPurpose.OTHER,
          cashAccountId: 'cash-1',
          contraAccountId: 'transfer-coa',
          totalAmount: 50,
          lines: [{ description: 'Chuyển quỹ', amount: 50 }],
        } as any,
        actor,
      );

      expect(accountResolver.resolveContraAccount).toHaveBeenCalledWith(
        AccountingDefaultAccountRole.EXPENSE,
        actor,
        'transfer-coa',
      );
    });

    it('propagates insufficient-balance (400) from recordMovement', async () => {
      const manager = buildManager({
        findOneResult: { id: 'cash-1' },
      });
      await setup(manager);
      cashService.recordMovement.mockRejectedValue(
        new BadRequestException('Insufficient cash balance'),
      );

      await expect(
        service.create(
          {
            voucherDate: '2026-06-30',
            purpose: CashPaymentPurpose.OTHER,
            cashAccountId: 'cash-1',
            totalAmount: 100,
            lines: [{ description: 'x', amount: 100 }],
          } as any,
          actor,
        ),
      ).rejects.toThrow(/Insufficient cash balance/);
    });

    it('overrides the catalogue name with a hand-typed partnerName, keeping partnerId (ADR-02)', async () => {
      const manager = buildManager({
        findOneResult: { id: 'p-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'NCC thật',
        address: 'HCM',
      });

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashPaymentPurpose.SUPPLIER_PAYMENT,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          partnerType: 'SUPPLIER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          partnerName: 'NCC thật — CN Bình Tân',
          lines: [{ description: 'Trả NCC', amount: 100 }],
        } as any,
        actor,
      );

      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === CashVoucherStatus.POSTED,
      );
      expect(created[1].partnerNameSnapshot).toBe('NCC thật — CN Bình Tân');
      expect(created[1].partnerId).toBe('11111111-1111-4111-8111-111111111111');
    });

    it('falls back to the catalogue name when partnerName is not sent (auto-create paths unaffected)', async () => {
      const manager = buildManager({
        findOneResult: { id: 'p-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'NCC thật',
        address: 'HCM',
      });

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashPaymentPurpose.SUPPLIER_PAYMENT,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          partnerType: 'SUPPLIER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          lines: [{ description: 'Trả NCC', amount: 100 }],
        } as any,
        actor,
      );

      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === CashVoucherStatus.POSTED,
      );
      expect(created[1].partnerNameSnapshot).toBe('NCC thật');
    });

    it('stores the hand-typed address for a free-text party (ADR-03)', async () => {
      const manager = buildManager({
        findOneResult: { id: 'p-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashPaymentPurpose.OTHER,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          partnerType: 'OTHER',
          partnerName: 'Nguyễn Văn A',
          address: '123 Lê Lợi, Q1',
          lines: [{ description: 'Chi khác', amount: 100 }],
        } as any,
        actor,
      );

      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === CashVoucherStatus.POSTED,
      );
      expect(created[1].partnerAddressSnapshot).toBe('123 Lê Lợi, Q1');
    });

    it('lets a hand-typed address win over the catalogue address', async () => {
      const manager = buildManager({
        findOneResult: { id: 'p-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'NCC thật',
        address: 'HCM',
      });

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashPaymentPurpose.SUPPLIER_PAYMENT,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          partnerType: 'SUPPLIER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          address: '123 Lê Lợi, Q1',
          lines: [{ description: 'Trả NCC', amount: 100 }],
        } as any,
        actor,
      );

      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === CashVoucherStatus.POSTED,
      );
      expect(created[1].partnerAddressSnapshot).toBe('123 Lê Lợi, Q1');
    });

    it('falls back to the catalogue address when address is not sent', async () => {
      const manager = buildManager({
        findOneResult: { id: 'p-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'NCC thật',
        address: 'HCM',
      });

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashPaymentPurpose.SUPPLIER_PAYMENT,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          partnerType: 'SUPPLIER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          lines: [{ description: 'Trả NCC', amount: 100 }],
        } as any,
        actor,
      );

      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === CashVoucherStatus.POSTED,
      );
      expect(created[1].partnerAddressSnapshot).toBe('HCM');
    });
  });

  describe('free-text party', () => {
    it('stores a hand-typed payee name without a lookup, and drops partnerId', async () => {
      const manager = buildManager({
        findOneResult: { id: 'p-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashPaymentPurpose.OTHER,
          cashAccountId: 'cash-1',
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
        (c: any[]) => c[1]?.status === CashVoucherStatus.POSTED,
      );
      expect(created[1].partnerNameSnapshot).toBe('Nguyễn Văn A');
      expect(created[1].partnerId).toBeUndefined();
    });

    it('clears partnerId when an update switches to a hand-typed payee', async () => {
      const payment = {
        id: 'p-1',
        status: CashVoucherStatus.POSTED,
        referenceType: CashPaymentReferenceType.MANUAL,
        revision: 0,
        totalAmount: 0,
        documentNumber: 'PC-26-00001',
        organizationId: 'org-1',
        partnerType: 'SUPPLIER',
        partnerId: '11111111-1111-4111-8111-111111111111',
        partnerNameSnapshot: 'NCC thật',
        partnerAddressSnapshot: 'HCM',
      };
      const manager = buildManager({ qbResult: payment, findOneResult: payment });
      await setup(manager);

      await service.update(
        'p-1',
        { revision: 0, partnerType: 'OTHER', partnerName: 'Nguyễn Văn A' } as any,
        actor,
      );

      expect(payment.partnerId).toBeNull();
      expect(payment.partnerNameSnapshot).toBe('Nguyễn Văn A');
      expect(payment.partnerAddressSnapshot).toBeNull();
    });
  });

  describe('update — party snapshot (ADR-02)', () => {
    it('overrides the catalogue name with a hand-typed partnerName, keeping the catalogue link', async () => {
      const payment = {
        id: 'p-1',
        status: CashVoucherStatus.POSTED,
        referenceType: CashPaymentReferenceType.MANUAL,
        revision: 0,
        totalAmount: 0,
        documentNumber: 'PC-26-00001',
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
        status: CashVoucherStatus.POSTED,
        referenceType: CashPaymentReferenceType.MANUAL,
        revision: 0,
        totalAmount: 0,
        documentNumber: 'PC-26-00001',
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

  describe('update — address snapshot (ADR-03)', () => {
    const draft = (over: any = {}) => ({
      id: 'p-1',
      status: CashVoucherStatus.POSTED,
      referenceType: CashPaymentReferenceType.MANUAL,
      revision: 0,
      totalAmount: 100,
      documentNumber: 'PC-26-00001',
      cashAccountId: 'cash-1',
      contraAccountId: 'contra-1',
      organizationId: 'org-1',
      partnerType: 'OTHER',
      partnerId: undefined,
      partnerNameSnapshot: 'Nguyễn Văn A',
      partnerAddressSnapshot: 'Địa chỉ cũ',
      ...over,
    });

    it('saves an address-only edit, bumps revision, and never calls recordMovement', async () => {
      const payment = draft();
      const manager = buildManager({
        qbResult: payment,
        findOneResult: payment,
        findResults: [{ amount: 100 }],
      });
      await setup(manager);

      await service.update(
        'p-1',
        { revision: 0, address: '123 Lê Lợi, Q1, lầu 3' } as any,
        actor,
      );

      expect(payment.partnerAddressSnapshot).toBe('123 Lê Lợi, Q1, lầu 3');
      expect(payment.revision).toBe(1);
      // The amount did not change, so no compensating movement may be posted.
      expect(cashService.recordMovement).not.toHaveBeenCalled();
    });

    it('clears the address to null when sent as an empty string', async () => {
      const payment = draft();
      const manager = buildManager({
        qbResult: payment,
        findOneResult: payment,
        findResults: [{ amount: 100 }],
      });
      await setup(manager);

      await service.update('p-1', { revision: 0, address: '' } as any, actor);

      expect(payment.partnerAddressSnapshot).toBeNull();
    });

    it('keeps the existing address when the payload does not mention it', async () => {
      const payment = draft();
      const manager = buildManager({
        qbResult: payment,
        findOneResult: payment,
        findResults: [{ amount: 100 }],
      });
      await setup(manager);

      await service.update(
        'p-1',
        { revision: 0, reason: 'Đổi lý do' } as any,
        actor,
      );

      expect(payment.partnerAddressSnapshot).toBe('Địa chỉ cũ');
    });

    it('takes the new party address when switching catalogue party without sending address', async () => {
      const payment = draft();
      const manager = buildManager({
        qbResult: payment,
        findOneResult: payment,
        findResults: [{ amount: 100 }],
      });
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
        } as any,
        actor,
      );

      expect(payment.partnerAddressSnapshot).toBe('HCM');
    });
  });

  describe('update — editing a posted voucher (ADR-01)', () => {
    const posted = (over: any = {}) => ({
      id: 'p-1',
      status: CashVoucherStatus.POSTED,
      referenceType: CashPaymentReferenceType.MANUAL,
      revision: 0,
      totalAmount: 5_000_000,
      documentNumber: 'PC-26-00001',
      cashAccountId: 'cash-1',
      contraAccountId: 'contra-1',
      organizationId: 'org-1',
      ...over,
    });

    it('takes MORE cash out when the payment grows', async () => {
      const payment = posted();
      const manager = buildManager({
        qbResult: payment,
        findOneResult: payment,
        findResults: [{ amount: 8_000_000 }],
      });
      await setup(manager);

      await service.update(
        'p-1',
        {
          revision: 0,
          totalAmount: 8_000_000,
          lines: [{ description: 'Chi khác', amount: 8_000_000 }],
        } as any,
        actor,
      );

      // Opposite direction to a receipt: paying more drains the fund further.
      expect(cashService.recordMovement).toHaveBeenCalledTimes(1);
      expect(cashService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CashMovementType.WITHDRAWAL,
          amount: 3_000_000,
          notes: 'Adjustment for PC-26-00001 rev 1',
        }),
        actor,
        manager,
      );
      expect(payment.documentNumber).toBe('PC-26-00001');
      expect(payment.revision).toBe(1);
    });

    it('puts cash back when the payment shrinks', async () => {
      const payment = posted();
      const manager = buildManager({
        qbResult: payment,
        findOneResult: payment,
        findResults: [{ amount: 2_000_000 }],
      });
      await setup(manager);

      await service.update(
        'p-1',
        {
          revision: 0,
          totalAmount: 2_000_000,
          lines: [{ description: 'Chi khác', amount: 2_000_000 }],
        } as any,
        actor,
      );

      expect(cashService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CashMovementType.DEPOSIT,
          amount: 3_000_000,
        }),
        actor,
        manager,
      );
    });

    it('refuses a supplier-payment saga voucher', async () => {
      const payment = posted({
        referenceType: CashPaymentReferenceType.GOODS_RECEIPT,
      });
      const manager = buildManager({ qbResult: payment, findOneResult: payment });
      await setup(manager);

      await expect(
        service.update('p-1', { revision: 0, totalAmount: 1 } as any, actor),
      ).rejects.toThrow(BadRequestException);
      expect(cashService.recordMovement).not.toHaveBeenCalled();
    });
  });

  describe('post', () => {
    it('records a WITHDRAWAL movement and marks the payment POSTED', async () => {
      const payment: any = {
        id: 'p-1',
        organizationId: 'org-1',
        status: CashVoucherStatus.DRAFT,
        cashAccountId: 'cash-1',
        contraAccountId: 'contra-1',
        totalAmount: 100,
      };
      const manager = buildManager({
        qbResult: payment,
        findResults: [{ amount: 100 }],
        findOneResult: payment,
      });
      await setup(manager);

      const result = await service.post('p-1', actor);

      expect(cashService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CashMovementType.WITHDRAWAL,
          amount: 100,
          contraAccountId: 'contra-1',
          reference: 'PC-26-00001',
        }),
        actor,
        manager,
      );
      expect(result.status).toBe(CashVoucherStatus.POSTED);
      expect(result.cashMovementId).toBe('mv-1');
    });

    it('propagates insufficient-balance (400) from recordMovement on post', async () => {
      const payment: any = {
        id: 'p-1',
        organizationId: 'org-1',
        status: CashVoucherStatus.DRAFT,
        cashAccountId: 'cash-1',
        contraAccountId: 'contra-1',
        totalAmount: 100,
      };
      const manager = buildManager({
        qbResult: payment,
        findResults: [{ amount: 100 }],
      });
      await setup(manager);
      cashService.recordMovement.mockRejectedValue(
        new BadRequestException('Insufficient cash balance'),
      );

      await expect(service.post('p-1', actor)).rejects.toThrow(
        /Insufficient cash balance/,
      );
    });
  });

  describe('reverse', () => {
    it('posts an opposite DEPOSIT and flips original to REVERSED', async () => {
      const original: any = {
        id: 'p-1',
        organizationId: 'org-1',
        status: CashVoucherStatus.POSTED,
        documentNumber: 'PC-26-00001',
        cashAccountId: 'cash-1',
        contraAccountId: 'contra-1',
        totalAmount: 100,
        purpose: CashPaymentPurpose.OTHER,
      };
      const manager = buildManager({
        qbResult: { ...original },
        findResults: [
          { description: 'line', amount: 100, categoryId: null, referenceNote: null },
        ],
        findOneResult: { id: 'p-1', status: CashVoucherStatus.REVERSED },
      });
      await setup(manager);

      await service.reverse('p-1', 'duplicate', actor);

      expect(cashService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CashMovementType.DEPOSIT,
          amount: 100,
        }),
        actor,
        manager,
      );
      const createdReversal = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.referenceType === CashPaymentReferenceType.REVERSAL,
      );
      expect(createdReversal).toBeDefined();
      expect(createdReversal[1].reversesVoucherId).toBe('p-1');
    });
  });

  describe('createVoucherForMovement', () => {
    it('inserts a POSTED voucher WITHOUT creating a movement/JE', async () => {
      const manager = buildManager({});
      await setup(manager);

      await service.createVoucherForMovement({
        cashMovementId: 'mv-existing',
        journalEntryId: 'je-existing',
        purpose: CashPaymentPurpose.PURCHASE,
        cashAccountId: 'cash-1',
        contraAccountId: 'contra-1',
        amount: 250,
        referenceType: CashPaymentReferenceType.GOODS_RECEIPT,
        referenceId: 'gr-1',
        actor,
        description: 'Mua hàng',
      });

      expect(cashService.recordMovement).not.toHaveBeenCalled();
      const createdVoucher = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.cashMovementId === 'mv-existing',
      );
      expect(createdVoucher).toBeDefined();
      expect(createdVoucher[1].journalEntryId).toBe('je-existing');
      expect(createdVoucher[1].status).toBe(CashVoucherStatus.POSTED);
    });
  });

  describe('getPrintPayload (T-03-03, AC-11)', () => {
    const basePayment = {
      id: 'p-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
      documentNumber: 'PC-26-00001',
      voucherDate: '2026-09-08',
      status: CashVoucherStatus.POSTED,
      purpose: CashPaymentPurpose.OTHER,
      partnerNameSnapshot: 'Nguyễn Văn A',
      partnerAddressSnapshot: '123 Lê Lợi',
      payeeName: 'Nguyễn Văn A',
      reason: 'Chi tiền mua vật tư',
      cashAccountId: 'cash-acc-1',
      contraAccountId: 'contra-1',
      totalAmount: 500000,
      referenceType: CashPaymentReferenceType.MANUAL,
      revision: 0,
      lines: [
        { id: 'line-1', description: 'Mua vật tư', categoryId: 'cat-1', amount: 500000 },
      ],
    };

    /**
     * Entity-aware `EntityManager` mock: `getPrintPayload` fans out to
     * `getById` (via `manager.findOne`), `loadVoucherBranch` (via
     * `manager.getRepository(BranchEntity).findOne`), and the service's own
     * `manager.findOne`/`manager.find` for the cash account and categories.
     * The `CashPaymentEntity` branch mirrors the real query's WHERE clause so
     * an org/id mismatch reproduces the same 404 `getById` would give.
     */
    function buildPrintPayloadManager(
      opts: {
        payment?: typeof basePayment;
        branch?: any;
        cashAccount?: any;
        categories?: any[];
      } = {},
    ) {
      const manager: any = {
        findOne: jest.fn(async (entity: any, options: any) => {
          if (entity === CashPaymentEntity) {
            const payment = opts.payment;
            if (!payment) return null;
            if (options.where.organizationId !== payment.organizationId) return null;
            if (options.where.id !== payment.id) return null;
            return payment;
          }
          if (entity === CashAccountEntity) return opts.cashAccount ?? null;
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

    it('resolves branch, cash account name and category names into a CASH_PAYMENT payload', async () => {
      const manager = buildPrintPayloadManager({
        payment: basePayment,
        branch: {
          id: 'branch-1',
          name: 'Chi nhánh Q1',
          address: '1 Đường ABC',
          phone: '0900000000',
        },
        cashAccount: { id: 'cash-acc-1', name: 'Quỹ tiền mặt chính' },
        categories: [{ id: 'cat-1', name: 'Mua vật tư' }],
      });
      await setup(manager);

      const payload = await service.getPrintPayload('p-1', actor);

      expect(payload.kind).toBe('CASH_PAYMENT');
      expect(payload.paper).toBe('A5');
      expect(payload.title).toBe('PHIẾU CHI');
      expect(payload.docNo).toBe('PC-26-00001');
      expect(payload.branch).toEqual({
        name: 'Chi nhánh Q1',
        address: '1 Đường ABC',
        phone: '0900000000',
      });
      expect(payload.info).toContainEqual({
        label: 'Quỹ tiền mặt',
        value: 'Quỹ tiền mặt chính',
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
