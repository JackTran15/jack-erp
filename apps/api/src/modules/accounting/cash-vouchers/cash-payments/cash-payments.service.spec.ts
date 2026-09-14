import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CashPaymentsService } from './cash-payments.service';
import { CashPaymentEntity } from './cash-payment.entity';
import { CashPaymentLineEntity } from './cash-payment-line.entity';
import { CashService } from '../../cash/cash.service';
import { CashMovementType } from '../../cash/cash-movement.entity';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { PartnerResolverService } from '../shared/partner-resolver.service';
import { VoucherStaffResolver } from '../shared/voucher-staff.resolver';
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
import { MediaLinkService } from '../../../media/media-link.service';
import { MediaQueryService } from '../../../media/media-query.service';
import { MediaOwnerReaderRegistry } from '../../../media/media-owner-reader.registry';
import { MediaOwnerType } from '../../../media/media-object.entity';
import { MediaException } from '../../../media/media.exception';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1'],
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
  let staffResolver: { resolveOne: jest.Mock };
  let dataSource: { transaction: jest.Mock; manager: any };
  let mediaLink: { syncOwner: jest.Mock };
  let mediaQuery: { listForOwners: jest.Mock };
  let mediaReaders: { register: jest.Mock };

  /**
   * `dataSourceManager` defaults to `manager` (identical to the pre-T-04-04
   * shape) for every test that never opens a transaction (`getById`,
   * `getPrintPayload`). Tests that DO run inside `dataSource.transaction`
   * pass a distinct object here on purpose (security review T-04-04): if
   * the service ever read/wrote through `this.dataSource.manager` instead
   * of the transaction's own `manager` argument, `toHaveBeenCalledWith(...,
   * manager)` must be able to fail, which it cannot if the two happen to be
   * the same object.
   */
  const setup = async (manager: any, dataSourceManager: any = manager) => {
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
    dataSource = { transaction: jest.fn((cb) => cb(manager)), manager: dataSourceManager };
    mediaLink = { syncOwner: jest.fn().mockResolvedValue([]) };
    mediaQuery = { listForOwners: jest.fn().mockResolvedValue(new Map()) };
    mediaReaders = { register: jest.fn() };

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
        { provide: VoucherStaffResolver, useValue: staffResolver },
        {
          provide: VoucherLinksService,
          useValue: { findLinkedVoucher: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: SupplierDebtPaymentSagaService,
          useValue: { compensate: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MediaLinkService, useValue: mediaLink },
        { provide: MediaQueryService, useValue: mediaQuery },
        { provide: MediaOwnerReaderRegistry, useValue: mediaReaders },
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
      staffId: 'staff-1',
      createdBy: 'creator-1',
      lines: [
        { id: 'line-1', description: 'Mua vật tư', categoryId: 'cat-1', amount: 500000 },
      ],
    };

    /**
     * Entity-aware `EntityManager` mock: `getPrintPayload` fans out to
     * `getById` (via `manager.findOne`), `loadVoucherBranch` (via
     * `manager.getRepository(BranchEntity).findOne`), and the service's own
     * `manager.find` for categories. Staff/creator names come from the
     * separately-mocked `staffResolver`, not the manager.
     * The `CashPaymentEntity` branch mirrors the real query's WHERE clause so
     * an org/id mismatch reproduces the same 404 `getById` would give.
     */
    function buildPrintPayloadManager(
      opts: {
        payment?: typeof basePayment;
        branch?: any;
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

    it('resolves branch, the staff name and category names into a CASH_PAYMENT payload; no signatureNames key, no creator id/name anywhere (T-01-07)', async () => {
      const manager = buildPrintPayloadManager({
        payment: basePayment,
        branch: {
          id: 'branch-1',
          name: 'Chi nhánh Q1',
          address: '1 Đường ABC',
          phone: '0900000000',
        },
        categories: [{ id: 'cat-1', name: 'Mua vật tư' }],
      });
      await setup(manager);
      staffResolver.resolveOne.mockResolvedValue({ code: null, name: 'Nguyễn Văn A' });

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
        label: 'Nhân viên chi',
        value: 'Nguyễn Văn A',
      });
      expect(payload.info.some((row) => row.label === 'Quỹ tiền mặt')).toBe(false);
      expect(payload).not.toHaveProperty('signatureNames');
      expect(JSON.stringify(payload)).not.toContain('creator-1');
      expect(payload.lines[0]).toMatchObject({
        categoryName: 'Mua vật tư',
        amount: 500000,
      });
    });

    it('calls resolveOne exactly once with the voucher staffId; never queries the creator (AC-06)', async () => {
      const manager = buildPrintPayloadManager({
        payment: basePayment,
        branch: null,
        categories: [],
      });
      await setup(manager);

      await service.getPrintPayload('p-1', actor);

      expect(staffResolver.resolveOne).toHaveBeenCalledTimes(1);
      expect(staffResolver.resolveOne).toHaveBeenCalledWith(
        'staff-1',
        actor.organizationId,
      );
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

  describe('create — attachments (AC-14)', () => {
    it('syncs attachments before minting a document number or posting the movement/journal', async () => {
      const manager = buildManager({
        findOneResult: { id: 'p-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager, buildManager({}));
      mediaLink.syncOwner.mockResolvedValue(['media-1']);

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashPaymentPurpose.OTHER,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          attachmentIds: ['media-1'],
          lines: [{ description: 'Chi khác', amount: 100 }],
        } as any,
        actor,
      );

      // Call order, not just "both were called": a routine media conflict
      // must never leave a burned PC number or a JOURNAL_POSTED event for an
      // entry that never actually commits (security review T-04-04).
      const syncOrder = mediaLink.syncOwner.mock.invocationCallOrder[0];
      const numberOrder = docNumbering.generate.mock.invocationCallOrder[0];
      const movementOrder = cashService.recordMovement.mock.invocationCallOrder[0];
      expect(syncOrder).toBeLessThan(numberOrder);
      expect(syncOrder).toBeLessThan(movementOrder);

      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        MediaOwnerType.CASH_PAYMENT,
        expect.any(String),
        ['media-1'],
        actor,
        manager,
      );
      // The array `syncOwner` actually returned is what lands on the row —
      // never a second, unvalidated write of the caller's raw ids.
      expect(manager.update).toHaveBeenCalledWith(
        CashPaymentEntity,
        expect.any(String),
        { attachmentIds: ['media-1'] },
      );
    });

    it('rejects with 404 before minting a number or calling recordMovement when an id belongs to another organization', async () => {
      const manager = buildManager({
        findOneResult: { id: 'p-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager, buildManager({}));
      mediaLink.syncOwner.mockRejectedValue(
        new MediaException(404, 'MEDIA_NOT_FOUND', 'Media not found'),
      );

      const call = service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashPaymentPurpose.OTHER,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          attachmentIds: ['other-org-media'],
          lines: [{ description: 'Chi khác', amount: 100 }],
        } as any,
        actor,
      );

      await expect(call).rejects.toBeInstanceOf(MediaException);
      await expect(call).rejects.toMatchObject({ status: 404 });
      // Nothing downstream of the rejected syncOwner call ever runs: no
      // number minted, no movement/journal posted, no attachmentIds write.
      // The real transaction then rolls back the whole thing.
      expect(docNumbering.generate).not.toHaveBeenCalled();
      expect(cashService.recordMovement).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });
  });

  describe('update — attachments (AC-14, AC-16)', () => {
    const posted = (over: any = {}) => ({
      id: 'p-1',
      status: CashVoucherStatus.POSTED,
      referenceType: CashPaymentReferenceType.MANUAL,
      revision: 0,
      totalAmount: 100,
      documentNumber: 'PC-26-00001',
      cashAccountId: 'cash-1',
      contraAccountId: 'contra-1',
      organizationId: 'org-1',
      attachmentIds: ['existing-media'],
      ...over,
    });

    it('syncs and stores the returned array when attachmentIds is sent', async () => {
      const payment = posted();
      const manager = buildManager({
        qbResult: payment,
        findOneResult: payment,
        findResults: [{ amount: 100 }],
      });
      await setup(manager, buildManager({}));
      mediaLink.syncOwner.mockResolvedValue(['new-media']);

      await service.update(
        'p-1',
        { revision: 0, attachmentIds: ['new-media'] } as any,
        actor,
      );

      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        MediaOwnerType.CASH_PAYMENT,
        'p-1',
        ['new-media'],
        actor,
        manager,
      );
      expect(payment.attachmentIds).toEqual(['new-media']);
    });

    it('leaves the list unchanged when attachmentIds is omitted', async () => {
      const payment = posted();
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

      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
      expect(payment.attachmentIds).toEqual(['existing-media']);
    });

    it('never reaches syncOwner for a REVERSED voucher (AC-16)', async () => {
      const payment = posted({ reversedByVoucherId: 'p-2' });
      const manager = buildManager({ qbResult: payment, findOneResult: payment });
      await setup(manager);

      await expect(
        service.update(
          'p-1',
          { revision: 0, attachmentIds: ['new-media'] } as any,
          actor,
        ),
      ).rejects.toThrow(ConflictException);
      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
    });

    it('never reaches syncOwner for a non-manual (saga) voucher', async () => {
      const payment = posted({
        referenceType: CashPaymentReferenceType.GOODS_RECEIPT,
      });
      const manager = buildManager({ qbResult: payment, findOneResult: payment });
      await setup(manager);

      await expect(
        service.update(
          'p-1',
          { revision: 0, attachmentIds: ['new-media'] } as any,
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
    });

    it('never reaches syncOwner for a stale revision', async () => {
      const payment = posted({ revision: 3 });
      const manager = buildManager({ qbResult: payment, findOneResult: payment });
      await setup(manager);

      await expect(
        service.update(
          'p-1',
          { revision: 1, attachmentIds: ['new-media'] } as any,
          actor,
        ),
      ).rejects.toThrow(ConflictException);
      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
    });

    it('never reaches syncOwner for a deleted voucher', async () => {
      const payment = posted({ deletedAt: new Date() });
      const manager = buildManager({ qbResult: payment, findOneResult: payment });
      await setup(manager);

      await expect(
        service.update(
          'p-1',
          { revision: 0, attachmentIds: ['new-media'] } as any,
          actor,
        ),
      ).rejects.toThrow(ConflictException);
      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
    });
  });

  describe('getById — attachments (AC-14)', () => {
    it('maps media summaries to id/fileName/contentType/size', async () => {
      const payment = {
        id: 'p-1',
        organizationId: 'org-1',
        status: CashVoucherStatus.POSTED,
        referenceType: CashPaymentReferenceType.MANUAL,
      };
      const manager = buildManager({ findOneResult: payment });
      await setup(manager);
      mediaQuery.listForOwners.mockResolvedValue(
        new Map([
          [
            'p-1',
            [
              {
                id: 'media-1',
                fileName: 'hoa-don.pdf',
                contentType: 'application/pdf',
                size: 1024,
                sortOrder: 0,
                bucket: 'erp-media-private',
                objectKey: 'org/org-1/cash_payment/media-1',
                ownerType: MediaOwnerType.CASH_PAYMENT,
              },
            ],
          ],
        ]),
      );

      const result = await service.getById('p-1', actor);

      expect(mediaQuery.listForOwners).toHaveBeenCalledWith(
        MediaOwnerType.CASH_PAYMENT,
        ['p-1'],
        'org-1',
      );
      expect(result.attachments).toEqual([
        {
          id: 'media-1',
          fileName: 'hoa-don.pdf',
          contentType: 'application/pdf',
          size: 1024,
        },
      ]);
    });

    it('returns an empty array when no media is attached', async () => {
      const payment = {
        id: 'p-1',
        organizationId: 'org-1',
        status: CashVoucherStatus.POSTED,
        referenceType: CashPaymentReferenceType.MANUAL,
      };
      const manager = buildManager({ findOneResult: payment });
      await setup(manager);

      const result = await service.getById('p-1', actor);

      expect(result.attachments).toEqual([]);
    });
  });

  describe('onModuleInit — media reader (AC-15, ADR-06)', () => {
    it('registers a CASH_PAYMENT reader that maps NotFound/Forbidden to false and rethrows anything else', async () => {
      const manager = buildManager({});
      await setup(manager);

      service.onModuleInit();

      expect(mediaReaders.register).toHaveBeenCalledWith(
        MediaOwnerType.CASH_PAYMENT,
        expect.any(Function),
      );
      const reader = mediaReaders.register.mock.calls[0][1];
      const getByIdSpy = jest.spyOn(service, 'getById');

      getByIdSpy.mockResolvedValueOnce({} as any);
      await expect(reader('p-1', actor)).resolves.toBe(true);

      getByIdSpy.mockRejectedValueOnce(new NotFoundException());
      await expect(reader('p-1', actor)).resolves.toBe(false);

      getByIdSpy.mockRejectedValueOnce(new ForbiddenException());
      await expect(reader('p-1', actor)).resolves.toBe(false);

      getByIdSpy.mockRejectedValueOnce(new Error('db down'));
      await expect(reader('p-1', actor)).rejects.toThrow('db down');
    });

    it('denies a branchless actor without ever calling getById (BranchScopeGuard parity)', async () => {
      const manager = buildManager({});
      await setup(manager);

      service.onModuleInit();
      const reader = mediaReaders.register.mock.calls[0][1];
      const getByIdSpy = jest.spyOn(service, 'getById');

      await expect(
        reader('p-1', { ...actor, branchId: undefined }),
      ).resolves.toBe(false);
      await expect(
        reader('p-1', { ...actor, branchIds: [] }),
      ).resolves.toBe(false);
      await expect(
        reader('p-1', { ...actor, branchId: 'branch-2' }),
      ).resolves.toBe(false);
      expect(getByIdSpy).not.toHaveBeenCalled();
    });
  });
});
