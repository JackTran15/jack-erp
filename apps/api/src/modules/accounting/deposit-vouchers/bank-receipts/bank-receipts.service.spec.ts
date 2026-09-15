import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DepositMovementType } from '@erp/shared-interfaces';
import { BankReceiptsService } from './bank-receipts.service';
import { BankReceiptEntity } from './bank-receipt.entity';
import { BankReceiptLineEntity } from './bank-receipt-line.entity';
import { DepositService } from '../../deposit/deposit.service';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { PartnerResolverService } from '../../cash-vouchers/shared/partner-resolver.service';
import { AccountResolverService } from '../../payment-accounts/account-resolver.service';
import { AccountingDefaultAccountRole } from '../../payment-accounts/enums';
import { DepositPeriodGuardService } from '../../deposit-period-lock/deposit-period-guard.service';
import { VoucherStaffResolver } from '../../cash-vouchers/shared/voucher-staff.resolver';
import { DepositDebtCollectionSagaService } from '../debt-collection/deposit-debt-collection-saga.service';
import { MediaLinkService } from '../../../media/media-link.service';
import { MediaQueryService } from '../../../media/media-query.service';
import { MediaOwnerReaderRegistry } from '../../../media/media-owner-reader.registry';
import { MediaOwnerType } from '../../../media/media-object.entity';
import { MediaException } from '../../../media/media.exception';
import {
  BankReceiptPurpose,
  BankReceiptReferenceType,
  BankVoucherStatus,
} from '../enums';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../../branch/branch.entity';
import { CashVoucherCategoryEntity } from '../../cash-vouchers/cash-voucher-categories/cash-voucher-category.entity';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1'],
  roles: ['admin'],
};

/** Build a mock EntityManager whose chainable query builder returns `qbResult`. */
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

describe('BankReceiptsService', () => {
  let service: BankReceiptsService;
  let depositService: { recordMovement: jest.Mock };
  let docNumbering: { generate: jest.Mock };
  let partnerResolver: { resolve: jest.Mock };
  let accountResolver: { resolveContraAccount: jest.Mock };
  let periodGuard: { assertNotLocked: jest.Mock };
  let mediaLink: { syncOwner: jest.Mock };
  let mediaQuery: { listForOwners: jest.Mock };
  let mediaReaders: { register: jest.Mock };
  let dataSource: { transaction: jest.Mock; manager: any };

  /**
   * `readManager` defaults to a *different* mock object than the transaction's
   * `manager`. `getById`/`getPrintPayload` read through `this.dataSource.manager`
   * outside any transaction; `create()`/`update()` must only ever hand the
   * transaction-scoped `manager` to `syncOwner`. If those two were the same
   * object (as they were before this fix), a bug that passed
   * `this.dataSource.manager` instead of the transaction's `manager` would go
   * undetected — `toBe(manager)` assertions would still pass by coincidence.
   * Tests that exercise `getById`/`getPrintPayload` pass their own manager as
   * `readManager` explicitly.
   */
  const setup = async (manager: any, readManager: any = buildManager({})) => {
    depositService = {
      recordMovement: jest
        .fn()
        .mockResolvedValue({ movement: { id: 'mv-1' }, journalEntryId: 'je-1' }),
    };
    docNumbering = { generate: jest.fn().mockResolvedValue('NTTK-26-00001') };
    partnerResolver = { resolve: jest.fn().mockResolvedValue(null) };
    accountResolver = {
      resolveContraAccount: jest.fn().mockResolvedValue('contra-resolved'),
    };
    periodGuard = { assertNotLocked: jest.fn().mockResolvedValue(undefined) };
    // Default: no attachments sent, nothing attached — individual tests override.
    mediaLink = { syncOwner: jest.fn().mockResolvedValue([]) };
    mediaQuery = { listForOwners: jest.fn().mockResolvedValue(new Map()) };
    mediaReaders = { register: jest.fn() };
    dataSource = {
      transaction: jest.fn((cb) => cb(manager)),
      manager: readManager,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankReceiptsService,
        { provide: getRepositoryToken(BankReceiptEntity), useValue: {} },
        { provide: getRepositoryToken(BankReceiptLineEntity), useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: DepositService, useValue: depositService },
        { provide: DocumentNumberingService, useValue: docNumbering },
        { provide: PartnerResolverService, useValue: partnerResolver },
        { provide: AccountResolverService, useValue: accountResolver },
        { provide: DepositPeriodGuardService, useValue: periodGuard },
        { provide: VoucherStaffResolver, useValue: staffResolver },
        // Only reached when reversing a DEBT_COLLECTION receipt.
        {
          provide: DepositDebtCollectionSagaService,
          useValue: { compensate: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: MediaLinkService, useValue: mediaLink },
        { provide: MediaQueryService, useValue: mediaQuery },
        { provide: MediaOwnerReaderRegistry, useValue: mediaReaders },
      ],
    }).compile();

    service = module.get(BankReceiptsService);
  };

  describe('create', () => {
    it('auto-posts: resolves contra by purpose and records a DEPOSIT movement', async () => {
      const manager = buildManager({
        findOneResult: {
          id: 'r-new',
          status: BankVoucherStatus.POSTED,
          documentNumber: 'NTTK-26-00001',
        },
      });
      await setup(manager);

      const result = await service.create(
        {
          depositAccountId: 'dep-1',
          docDate: '2026-07-15',
          purpose: BankReceiptPurpose.OTHER,
          totalAmount: 100,
          lines: [{ description: 'Thu khác', amount: 100 }],
        } as any,
        actor,
      );

      // OTHER receipt purpose → OTHER_INCOME contra account, resolved server-side.
      expect(accountResolver.resolveContraAccount).toHaveBeenCalledWith(
        AccountingDefaultAccountRole.OTHER_INCOME,
        actor,
        undefined,
      );
      expect(depositService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          depositAccountId: 'dep-1',
          type: DepositMovementType.DEPOSIT,
          amount: 100,
          contraAccountId: 'contra-resolved',
        }),
        actor,
        manager,
      );
      const createdVoucher = manager.create.mock.calls.find(
        (c: any[]) =>
          c[1]?.status === BankVoucherStatus.POSTED &&
          c[1]?.depositMovementId === 'mv-1',
      );
      expect(createdVoucher).toBeDefined();
      expect(createdVoucher[1].referenceType).toBe(
        BankReceiptReferenceType.MANUAL,
      );
      expect(createdVoucher[1].contraAccountId).toBe('contra-resolved');
      expect(createdVoucher[1].journalEntryId).toBe('je-1');
      expect(result.status).toBe(BankVoucherStatus.POSTED);
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
        findOneResult: { id: 'r-new', status: BankVoucherStatus.POSTED },
      });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'Khách hàng thật',
        address: 'HCM',
      });

      await service.create(
        {
          depositAccountId: 'dep-1',
          docDate: '2026-07-15',
          purpose: BankReceiptPurpose.OTHER,
          totalAmount: 100,
          partnerType: 'CUSTOMER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          partnerName: 'Công ty A — CN Bình Tân',
          lines: [{ description: 'Thu khác', amount: 100 }],
        } as any,
        actor,
      );

      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === BankVoucherStatus.POSTED,
      );
      expect(created[1].partnerNameSnapshot).toBe('Công ty A — CN Bình Tân');
      expect(created[1].partnerId).toBe('11111111-1111-4111-8111-111111111111');
    });

    it('falls back to the catalogue name when partnerName is not sent (auto-create paths unaffected)', async () => {
      const manager = buildManager({
        findOneResult: { id: 'r-new', status: BankVoucherStatus.POSTED },
      });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'Khách hàng thật',
        address: 'HCM',
      });

      await service.create(
        {
          depositAccountId: 'dep-1',
          docDate: '2026-07-15',
          purpose: BankReceiptPurpose.OTHER,
          totalAmount: 100,
          partnerType: 'CUSTOMER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          lines: [{ description: 'Thu khác', amount: 100 }],
        } as any,
        actor,
      );

      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === BankVoucherStatus.POSTED,
      );
      expect(created[1].partnerNameSnapshot).toBe('Khách hàng thật');
    });
  });

  describe('free-text party', () => {
    it('stores a hand-typed name without a lookup, and drops partnerId', async () => {
      const manager = buildManager({
        findOneResult: { id: 'r-new', status: BankVoucherStatus.POSTED },
      });
      await setup(manager);

      await service.create(
        {
          depositAccountId: 'dep-1',
          docDate: '2026-07-15',
          purpose: BankReceiptPurpose.OTHER,
          totalAmount: 100,
          partnerType: 'OTHER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          partnerName: '  Nguyễn Văn A  ',
          lines: [{ description: 'Thu khác', amount: 100 }],
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
      const receipt = {
        id: 'r-new',
        status: BankVoucherStatus.POSTED,
        referenceType: BankReceiptReferenceType.MANUAL,
        revision: 0,
        totalAmount: 0,
        branchId: 'branch-1',
        docDate: '2026-07-15',
        documentNumber: 'NTTK-26-00001',
        organizationId: 'org-1',
        partnerType: 'CUSTOMER',
        partnerId: '11111111-1111-4111-8111-111111111111',
        partnerNameSnapshot: 'Khách hàng thật',
        partnerAddressSnapshot: 'HCM',
      };
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);

      await service.update(
        'r-new',
        { revision: 0, partnerType: 'OTHER', partnerName: 'Nguyễn Văn A' } as any,
        actor,
      );

      expect(receipt.partnerId).toBeNull();
      expect(receipt.partnerNameSnapshot).toBe('Nguyễn Văn A');
    });
  });

  describe('update — party snapshot (ADR-02)', () => {
    it('overrides the catalogue name with a hand-typed partnerName, keeping the catalogue link', async () => {
      const receipt = {
        id: 'r-1',
        status: BankVoucherStatus.POSTED,
        referenceType: BankReceiptReferenceType.MANUAL,
        revision: 0,
        totalAmount: 0,
        branchId: 'branch-1',
        docDate: '2026-07-15',
        documentNumber: 'NTTK-26-00001',
        organizationId: 'org-1',
        partnerType: 'CUSTOMER',
        partnerId: '11111111-1111-4111-8111-111111111111',
        partnerNameSnapshot: 'Công ty A',
        partnerAddressSnapshot: 'HCM',
      };
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'Công ty A',
        address: 'HCM',
      });

      await service.update(
        'r-1',
        {
          revision: 0,
          partnerType: 'CUSTOMER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          partnerName: 'Công ty A — CN Bình Tân',
        } as any,
        actor,
      );

      expect(receipt.partnerNameSnapshot).toBe('Công ty A — CN Bình Tân');
      expect(receipt.partnerId).toBe('11111111-1111-4111-8111-111111111111');
    });

    it('clears the snapshot to null (not the old value) when partnerName is sent as an empty string', async () => {
      const receipt = {
        id: 'r-1',
        status: BankVoucherStatus.POSTED,
        referenceType: BankReceiptReferenceType.MANUAL,
        revision: 0,
        totalAmount: 0,
        branchId: 'branch-1',
        docDate: '2026-07-15',
        documentNumber: 'NTTK-26-00001',
        organizationId: 'org-1',
        partnerType: 'CUSTOMER',
        partnerId: '11111111-1111-4111-8111-111111111111',
        partnerNameSnapshot: 'Công ty A',
        partnerAddressSnapshot: 'HCM',
      };
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'Công ty A',
        address: 'HCM',
      });

      // TypeORM's save() skips `undefined` as "not provided" — an explicit ''
      // is what proves the snapshot was actually cleared, not just left alone.
      await service.update(
        'r-1',
        { revision: 0, partnerName: '' } as any,
        actor,
      );

      expect(receipt.partnerNameSnapshot).toBeNull();
    });
  });

  describe('update — editing a posted voucher (ADR-01)', () => {
    const posted = (over: any = {}) => ({
      id: 'r-1',
      status: BankVoucherStatus.POSTED,
      referenceType: BankReceiptReferenceType.MANUAL,
      revision: 0,
      totalAmount: 5_000_000,
      documentNumber: 'NTTK-26-00001',
      depositAccountId: 'dep-1',
      contraAccountId: 'contra-1',
      branchId: 'branch-1',
      docDate: '2026-08-15',
      organizationId: 'org-1',
      ...over,
    });

    it('posts one compensating movement keyed on the new revision', async () => {
      const receipt = posted();
      const manager = buildManager({
        qbResult: receipt,
        findOneResult: receipt,
        findResults: [{ amount: 4_000_000 }],
      });
      await setup(manager);

      await service.update(
        'r-1',
        {
          revision: 0,
          totalAmount: 4_000_000,
          lines: [{ description: 'Thu khác', amount: 4_000_000 }],
        } as any,
        actor,
      );

      expect(depositService.recordMovement).toHaveBeenCalledTimes(1);
      expect(depositService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1_000_000,
          sourceRefId: 'r-1',
          sourceRefLineId: 'REV1',
        }),
        actor,
        manager,
      );
      expect(receipt.revision).toBe(1);
    });

    it('refuses when the voucher already sits in a locked period', async () => {
      const receipt = posted();
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);
      periodGuard.assertNotLocked.mockRejectedValue(
        new ConflictException('Period 2026-08 is locked for this branch'),
      );

      await expect(
        service.update('r-1', { revision: 0, totalAmount: 1 } as any, actor),
      ).rejects.toThrow('locked');
      // Checked on the voucher's OWN date, not just an incoming one.
      expect(periodGuard.assertNotLocked).toHaveBeenCalledWith(
        'branch-1',
        '2026-08-15',
        manager,
      );
      expect(depositService.recordMovement).not.toHaveBeenCalled();
    });

    it('also checks the incoming date when it differs', async () => {
      const receipt = posted();
      const manager = buildManager({
        qbResult: receipt,
        findOneResult: receipt,
        findResults: [{ amount: 5_000_000 }],
      });
      await setup(manager);

      await service.update(
        'r-1',
        {
          revision: 0,
          docDate: '2026-07-20',
          totalAmount: 5_000_000,
          lines: [{ description: 'Thu khác', amount: 5_000_000 }],
        } as any,
        actor,
      );

      expect(periodGuard.assertNotLocked).toHaveBeenCalledWith(
        'branch-1',
        '2026-07-20',
        manager,
      );
    });
  });

  describe('post', () => {
    it('records a DEPOSIT movement and marks the receipt POSTED', async () => {
      const receipt: any = {
        id: 'r-1',
        organizationId: 'org-1',
        status: BankVoucherStatus.DRAFT,
        depositAccountId: 'dep-1',
        contraAccountId: 'contra-1',
        docDate: '2026-07-15',
        totalAmount: 100,
      };
      const manager = buildManager({
        qbResult: receipt,
        findResults: [{ amount: 100 }],
        findOneResult: receipt,
      });
      await setup(manager);

      const result = await service.post('r-1', actor);

      expect(depositService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          depositAccountId: 'dep-1',
          type: DepositMovementType.DEPOSIT,
          amount: 100,
          contraAccountId: 'contra-1',
          documentNumber: 'NTTK-26-00001',
        }),
        actor,
        manager,
      );
      expect(result.status).toBe(BankVoucherStatus.POSTED);
      expect(result.documentNumber).toBe('NTTK-26-00001');
      expect(result.depositMovementId).toBe('mv-1');
      expect(result.journalEntryId).toBe('je-1');
    });

    it('rejects when total_amount does not match the line sum', async () => {
      const receipt: any = {
        id: 'r-1',
        organizationId: 'org-1',
        status: BankVoucherStatus.DRAFT,
        depositAccountId: 'dep-1',
        contraAccountId: 'contra-1',
        totalAmount: 100,
      };
      const manager = buildManager({
        qbResult: receipt,
        findResults: [{ amount: 80 }],
      });
      await setup(manager);

      await expect(service.post('r-1', actor)).rejects.toThrow(/must equal sum/);
      expect(depositService.recordMovement).not.toHaveBeenCalled();
    });

    it('BR-LOCK-01: rejects posting a DRAFT whose docDate falls in a locked period', async () => {
      const receipt: any = {
        id: 'r-1',
        organizationId: 'org-1',
        status: BankVoucherStatus.DRAFT,
        depositAccountId: 'dep-1',
        contraAccountId: 'contra-1',
        docDate: '2026-06-15',
        totalAmount: 100,
      };
      const manager = buildManager({
        qbResult: receipt,
        findResults: [{ amount: 100 }],
      });
      await setup(manager);
      periodGuard.assertNotLocked.mockRejectedValue(
        new BadRequestException('Period 2026-06 is locked for this branch (BR-LOCK-01)'),
      );

      await expect(service.post('r-1', actor)).rejects.toThrow(/BR-LOCK-01/);
      expect(depositService.recordMovement).not.toHaveBeenCalled();
    });

    it('rejects posting a non-DRAFT receipt', async () => {
      const receipt: any = {
        id: 'r-1',
        organizationId: 'org-1',
        status: BankVoucherStatus.POSTED,
      };
      const manager = buildManager({ qbResult: receipt });
      await setup(manager);

      await expect(service.post('r-1', actor)).rejects.toThrow(/not in DRAFT/);
    });
  });

  describe('reverse', () => {
    const original: any = {
      id: 'r-1',
      organizationId: 'org-1',
      status: BankVoucherStatus.POSTED,
      documentNumber: 'NTTK-26-00001',
      depositAccountId: 'dep-1',
      contraAccountId: 'contra-1',
      totalAmount: 100,
      purpose: BankReceiptPurpose.OTHER,
    };

    it('posts an opposite WITHDRAWAL, copies lines and flips original to REVERSED', async () => {
      const manager = buildManager({
        qbResult: { ...original },
        findResults: [
          { description: 'line', amount: 100, categoryId: null, referenceNote: null },
        ],
        findOneResult: { id: 'r-1', status: BankVoucherStatus.REVERSED },
      });
      await setup(manager);
      depositService.recordMovement.mockResolvedValue({
        movement: { id: 'mv-2' },
        journalEntryId: 'je-2',
      });

      await service.reverse('r-1', 'wrong amount', actor);

      expect(depositService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          type: DepositMovementType.WITHDRAWAL,
          amount: 100,
          contraAccountId: 'contra-1',
        }),
        actor,
        manager,
      );
      // Reversal voucher created with REVERSAL reference + linked movement/JE.
      const createdReversal = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.referenceType === BankReceiptReferenceType.REVERSAL,
      );
      expect(createdReversal).toBeDefined();
      expect(createdReversal[1].reversesVoucherId).toBe('r-1');
      expect(createdReversal[1].reversalReason).toBe('wrong amount');
      expect(createdReversal[1].totalAmount).toBe(100);
      expect(createdReversal[1].depositMovementId).toBe('mv-2');
      // Original line copied verbatim onto the reversal (amount > 0 — CHECK passes).
      const copiedLine = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.bankReceiptId && c[1]?.amount === 100,
      );
      expect(copiedLine).toBeDefined();
    });

    it('propagates insufficient-balance (400) from recordMovement', async () => {
      const manager = buildManager({
        qbResult: { ...original },
        findResults: [],
      });
      await setup(manager);
      depositService.recordMovement.mockRejectedValue(
        new BadRequestException('Insufficient deposit balance'),
      );

      await expect(service.reverse('r-1', 'reason', actor)).rejects.toThrow(
        /Insufficient deposit balance/,
      );
    });
  });

  describe('createVoucherForMovement', () => {
    it('inserts a POSTED voucher WITHOUT creating a movement/JE', async () => {
      const manager = buildManager({});
      await setup(manager);

      const result = await service.createVoucherForMovement({
        depositMovementId: 'mv-existing',
        journalEntryId: 'je-existing',
        purpose: BankReceiptPurpose.INTER_BRANCH_IN,
        depositAccountId: 'dep-1',
        contraAccountId: 'contra-1',
        amount: 250,
        referenceType: BankReceiptReferenceType.TRANSFER,
        referenceId: 'transfer-1',
        actor,
        description: 'Điều chuyển đến',
      });

      // No new movement / JE / balance change.
      expect(depositService.recordMovement).not.toHaveBeenCalled();
      const createdVoucher = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.depositMovementId === 'mv-existing',
      );
      expect(createdVoucher).toBeDefined();
      expect(createdVoucher[1].journalEntryId).toBe('je-existing');
      expect(createdVoucher[1].status).toBe(BankVoucherStatus.POSTED);
      expect(result.voucherNumber).toBe('NTTK-26-00001');
    });
  });

  describe('getPrintPayload (T-03-03, AC-11; staff/creator T-01-04)', () => {
    const baseReceipt = {
      id: 'r-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
      documentNumber: 'NTTK-26-00001',
      docDate: '2026-09-08',
      status: BankVoucherStatus.POSTED,
      purpose: BankReceiptPurpose.OTHER,
      partnerNameSnapshot: 'Công ty A',
      partnerAddressSnapshot: '123 Lê Lợi',
      payerName: 'Công ty A',
      reason: 'Thu tiền bán hàng',
      reference: 'UNC000123',
      depositAccountId: 'dep-acc-1',
      contraAccountId: 'contra-1',
      totalAmount: 500000,
      referenceType: BankReceiptReferenceType.MANUAL,
      revision: 0,
      collectedBy: 'staff-1',
      createdBy: 'creator-1',
      lines: [
        { id: 'line-1', description: 'Bán hàng', categoryId: 'cat-1', amount: 500000 },
      ],
    };

    /**
     * Entity-aware `EntityManager` mock: `getPrintPayload` fans out to
     * `getById` (via `manager.findOne`), `loadVoucherBranch` (via
     * `manager.getRepository(BranchEntity).findOne`), and the service's own
     * `manager.find` for categories. Staff/creator names come from the
     * separately-mocked `staffResolver`, not the manager.
     * The `BankReceiptEntity` branch mirrors the real query's WHERE clause so
     * an org/id mismatch reproduces the same 404 `getById` would give.
     */
    function buildPrintPayloadManager(
      opts: {
        receipt?: typeof baseReceipt;
        branch?: any;
        categories?: any[];
      } = {},
    ) {
      const manager: any = {
        findOne: jest.fn(async (entity: any, options: any) => {
          if (entity === BankReceiptEntity) {
            const receipt = opts.receipt;
            if (!receipt) return null;
            if (options.where.organizationId !== receipt.organizationId) return null;
            if (options.where.id !== receipt.id) return null;
            return receipt;
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

    it('resolves branch, the staff name (via attachStaff\'s collectedByName) and category names into a BANK_RECEIPT payload, and drops "Tài khoản ngân hàng"; no signatureNames key, no creator id/name anywhere (AC-03, T-01-07)', async () => {
      const manager = buildPrintPayloadManager({
        receipt: { ...baseReceipt },
        branch: {
          id: 'branch-1',
          name: 'Chi nhánh Q1',
          address: '1 Đường ABC',
          phone: '0900000000',
        },
        categories: [{ id: 'cat-1', name: 'Bán hàng' }],
      });
      // `getPrintPayload`/`getById` never open a transaction — they read only
      // through `this.dataSource.manager`, so this manager must back that slot.
      await setup(manager, manager);

      const payload = await service.getPrintPayload('r-1', actor);

      expect(payload.kind).toBe('BANK_RECEIPT');
      expect(payload.paper).toBe('A5');
      expect(payload.title).toBe('PHIẾU THU (tiền gửi)');
      expect(payload.docNo).toBe('NTTK-26-00001');
      expect(payload.branch).toEqual({
        name: 'Chi nhánh Q1',
        address: '1 Đường ABC',
        phone: '0900000000',
      });
      expect(payload.info).toContainEqual({
        label: 'Nhân viên thu',
        value: 'Nguyễn Văn A',
      });
      expect(payload.info.some((row) => row.label === 'Tài khoản ngân hàng')).toBe(false);
      expect(payload).not.toHaveProperty('signatureNames');
      expect(JSON.stringify(payload)).not.toContain('creator-1');
      expect(payload.lines[0]).toMatchObject({
        categoryName: 'Bán hàng',
        amount: 500000,
      });
    });

    it('reads collectedByName straight off the entity that getById/attachStaff already resolved — resolveMany is called only once, not a second time by getPrintPayload', async () => {
      const manager = buildPrintPayloadManager({
        receipt: { ...baseReceipt },
        branch: null,
        categories: [],
      });
      await setup(manager);
      staffResolver.resolveMany.mockResolvedValue(
        new Map([['staff-1', { code: null, name: 'Nguyễn Văn A' }]]),
      );

      const payload = await service.getPrintPayload('r-1', actor);

      expect(payload.info.find((row) => row.label === 'Nhân viên thu')?.value).toBe(
        'Nguyễn Văn A',
      );
      expect(staffResolver.resolveMany).toHaveBeenCalledTimes(1);
    });

    it('id not found ⇒ 404 (not 403)', async () => {
      const manager = buildPrintPayloadManager({ receipt: undefined });
      await setup(manager, manager);

      await expect(service.getPrintPayload('missing-id', actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('voucher of another organization ⇒ 404, same as sibling GET :id', async () => {
      const manager = buildPrintPayloadManager({
        receipt: { ...baseReceipt, organizationId: 'org-2' },
      });
      await setup(manager, manager);

      await expect(service.getPrintPayload('r-1', actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('attachments (T-04-05, AC-14)', () => {
    it('create: syncs media once the voucher id exists and persists the returned ids', async () => {
      const manager = buildManager({
        findOneResult: { id: 'r-new', status: BankVoucherStatus.POSTED },
      });
      await setup(manager);
      mediaLink.syncOwner.mockResolvedValue(['media-1', 'media-2']);

      await service.create(
        {
          depositAccountId: 'dep-1',
          docDate: '2026-07-15',
          purpose: BankReceiptPurpose.OTHER,
          totalAmount: 100,
          attachmentIds: ['media-1', 'media-2'],
          lines: [{ description: 'Thu khác', amount: 100 }],
        } as any,
        actor,
      );

      expect(mediaLink.syncOwner).toHaveBeenCalledTimes(1);
      const [ownerType, voucherId, ids, syncActor, syncManager] =
        mediaLink.syncOwner.mock.calls[0];
      expect(ownerType).toBe(MediaOwnerType.BANK_RECEIPT);
      expect(ids).toEqual(['media-1', 'media-2']);
      expect(syncActor).toBe(actor);
      expect(syncManager).toBe(manager);
      expect(manager.update).toHaveBeenCalledWith(BankReceiptEntity, voucherId, {
        attachmentIds: ['media-1', 'media-2'],
      });
    });

    it('create: syncs media before minting the document number or posting the movement', async () => {
      const manager = buildManager({
        findOneResult: { id: 'r-new', status: BankVoucherStatus.POSTED },
      });
      await setup(manager);
      mediaLink.syncOwner.mockResolvedValue(['media-1']);

      await service.create(
        {
          depositAccountId: 'dep-1',
          docDate: '2026-07-15',
          purpose: BankReceiptPurpose.OTHER,
          totalAmount: 100,
          attachmentIds: ['media-1'],
          lines: [{ description: 'Thu khác', amount: 100 }],
        } as any,
        actor,
      );

      // T-04-05 security review: a routine 404/409 from `syncOwner` must not
      // burn a document number or post a movement (whose journal entry
      // publishes JOURNAL_POSTED to Kafka immediately, uncommitted by this
      // transaction's eventual rollback) for a voucher that is about to fail.
      const syncOrder = mediaLink.syncOwner.mock.invocationCallOrder[0];
      const docNumberOrder = docNumbering.generate.mock.invocationCallOrder[0];
      const movementOrder = depositService.recordMovement.mock.invocationCallOrder[0];
      expect(syncOrder).toBeLessThan(docNumberOrder);
      expect(syncOrder).toBeLessThan(movementOrder);
    });

    it('create: an attachment id from another organization rejects with 404, and never mints a number or posts the movement', async () => {
      const manager = buildManager({
        findOneResult: { id: 'r-new', status: BankVoucherStatus.POSTED },
      });
      await setup(manager);
      mediaLink.syncOwner.mockRejectedValue(
        new MediaException(404, 'MEDIA_NOT_FOUND', 'Media not found'),
      );

      await expect(
        service.create(
          {
            depositAccountId: 'dep-1',
            docDate: '2026-07-15',
            purpose: BankReceiptPurpose.OTHER,
            totalAmount: 100,
            attachmentIds: ['media-other-org'],
            lines: [{ description: 'Thu khác', amount: 100 }],
          } as any,
          actor,
        ),
      ).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });

      // `create()` runs entirely inside `dataSource.transaction`; syncOwner's
      // rejection propagates out of that callback, so a real transaction rolls
      // back anything already written. Because syncOwner now runs first, this
      // also proves nothing was minted or posted in the first place: no
      // document number burned, no movement/journal entry, no Kafka publish.
      expect(docNumbering.generate).not.toHaveBeenCalled();
      expect(depositService.recordMovement).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('update: a voucher assertEditable rejects never reaches syncOwner', async () => {
      const receipt = {
        id: 'r-1',
        status: BankVoucherStatus.POSTED,
        // Not MANUAL ⇒ assertEditable throws before any attachment handling.
        referenceType: BankReceiptReferenceType.INVOICE_DEBT,
        revision: 0,
        totalAmount: 100,
        documentNumber: 'NTTK-26-00001',
        organizationId: 'org-1',
      };
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);

      await expect(
        service.update(
          'r-1',
          { revision: 0, attachmentIds: ['media-1'] } as any,
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
    });

    it('update: syncs media for an editable voucher and persists the returned ids', async () => {
      const receipt = {
        id: 'r-1',
        status: BankVoucherStatus.POSTED,
        referenceType: BankReceiptReferenceType.MANUAL,
        revision: 0,
        totalAmount: 100,
        documentNumber: 'NTTK-26-00001',
        depositAccountId: 'dep-1',
        contraAccountId: 'contra-1',
        branchId: 'branch-1',
        docDate: '2026-08-15',
        organizationId: 'org-1',
        attachmentIds: ['old-media'],
      };
      const manager = buildManager({
        qbResult: receipt,
        findOneResult: receipt,
        findResults: [{ amount: 100 }],
      });
      await setup(manager);
      mediaLink.syncOwner.mockResolvedValue(['media-1']);

      await service.update(
        'r-1',
        { revision: 0, attachmentIds: ['media-1'] } as any,
        actor,
      );

      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        MediaOwnerType.BANK_RECEIPT,
        'r-1',
        ['media-1'],
        actor,
        manager,
      );
      expect(receipt.attachmentIds).toEqual(['media-1']);
    });

    it('update: not sending attachmentIds leaves the list unchanged and never calls syncOwner', async () => {
      const receipt = {
        id: 'r-1',
        status: BankVoucherStatus.POSTED,
        referenceType: BankReceiptReferenceType.MANUAL,
        revision: 0,
        totalAmount: 100,
        documentNumber: 'NTTK-26-00001',
        depositAccountId: 'dep-1',
        contraAccountId: 'contra-1',
        branchId: 'branch-1',
        docDate: '2026-08-15',
        organizationId: 'org-1',
        attachmentIds: ['old-media'],
      };
      const manager = buildManager({
        qbResult: receipt,
        findOneResult: receipt,
        findResults: [{ amount: 100 }],
      });
      await setup(manager);

      await service.update(
        'r-1',
        { revision: 0, reason: 'Đổi lý do' } as any,
        actor,
      );

      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
      expect(receipt.attachmentIds).toEqual(['old-media']);
    });

    it('getById returns attachments copied from MediaQueryService, never spreading MediaSummary', async () => {
      const receipt = {
        id: 'r-1',
        organizationId: 'org-1',
        status: BankVoucherStatus.POSTED,
      };
      const manager = buildManager({ findOneResult: receipt });
      // `getById` reads through `this.dataSource.manager`, not a transaction.
      await setup(manager, manager);
      mediaQuery.listForOwners.mockResolvedValue(
        new Map([
          [
            'r-1',
            [
              {
                id: 'm-1',
                fileName: 'hoa-don.pdf',
                contentType: 'application/pdf',
                size: 2048,
                sortOrder: 0,
                bucket: 'erp-media-private',
                objectKey: 'org/org-1/bank_receipt/m-1',
                ownerType: MediaOwnerType.BANK_RECEIPT,
              },
            ],
          ],
        ]),
      );

      const result = await service.getById('r-1', actor);

      expect(mediaQuery.listForOwners).toHaveBeenCalledWith(
        MediaOwnerType.BANK_RECEIPT,
        ['r-1'],
        'org-1',
      );
      expect(result.attachments).toEqual([
        { id: 'm-1', fileName: 'hoa-don.pdf', contentType: 'application/pdf', size: 2048 },
      ]);
    });
  });

  describe('media reader (ADR-06)', () => {
    it('registers a reader for BANK_RECEIPT on module init', async () => {
      const manager = buildManager({});
      await setup(manager);

      service.onModuleInit();

      expect(mediaReaders.register).toHaveBeenCalledWith(
        MediaOwnerType.BANK_RECEIPT,
        expect.any(Function),
      );
    });

    it('reader allows (true) when the actor can see the voucher (getById resolves)', async () => {
      const manager = buildManager({
        findOneResult: {
          id: 'r-1',
          organizationId: 'org-1',
          status: BankVoucherStatus.POSTED,
        },
      });
      // `getById` reads through `this.dataSource.manager`, not a transaction.
      await setup(manager, manager);
      service.onModuleInit();
      const reader = mediaReaders.register.mock.calls[0][1];

      await expect(reader('r-1', actor)).resolves.toBe(true);
    });

    it('reader denies (false) when the actor cannot see the voucher (404 from getById)', async () => {
      const manager = buildManager({ findOneResult: null });
      await setup(manager, manager);
      service.onModuleInit();
      const reader = mediaReaders.register.mock.calls[0][1];

      await expect(reader('missing-id', actor)).resolves.toBe(false);
    });

    it('reader denies (false) on a Forbidden read, and rethrows any other error', async () => {
      const manager = buildManager({});
      manager.findOne = jest.fn(async () => {
        throw new ForbiddenException('no branch access');
      });
      // `getById` reads through `this.dataSource.manager`; the test mutates
      // `manager.findOne` after setup, so `dataSource.manager` must be this
      // same object for the mutation to take effect.
      await setup(manager, manager);
      service.onModuleInit();
      const reader = mediaReaders.register.mock.calls[0][1];

      await expect(reader('r-1', actor)).resolves.toBe(false);

      manager.findOne = jest.fn(async () => {
        throw new Error('db unavailable');
      });
      await expect(reader('r-1', actor)).rejects.toThrow('db unavailable');
    });

    it('reader denies (false) for a branchless actor, without calling getById', async () => {
      const manager = buildManager({
        findOneResult: {
          id: 'r-1',
          organizationId: 'org-1',
          status: BankVoucherStatus.POSTED,
        },
      });
      await setup(manager, manager);
      service.onModuleInit();
      const reader = mediaReaders.register.mock.calls[0][1];
      const getByIdSpy = jest.spyOn(service, 'getById');

      await expect(
        reader('r-1', { ...actor, branchId: undefined, branchIds: [] }),
      ).resolves.toBe(false);
      expect(getByIdSpy).not.toHaveBeenCalled();
    });
  });
});
