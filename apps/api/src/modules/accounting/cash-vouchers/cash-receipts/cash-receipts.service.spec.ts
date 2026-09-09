import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CashReceiptsService } from './cash-receipts.service';
import { CashReceiptEntity } from './cash-receipt.entity';
import { CashReceiptLineEntity } from './cash-receipt-line.entity';
import { CashService } from '../../cash/cash.service';
import { CashMovementType } from '../../cash/cash-movement.entity';
import { CashAccountEntity } from '../../cash/cash-account.entity';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { PartnerResolverService } from '../shared/partner-resolver.service';
import { AccountResolverService } from '../../payment-accounts/account-resolver.service';
import { VoucherLinksService } from '../../voucher-links/voucher-links.service';
import { AccountingDefaultAccountRole } from '../../payment-accounts/enums';
import { DebtCollectionSagaService } from '../debt-collection/debt-collection-saga.service';
import {
  CashReceiptPurpose,
  CashReceiptReferenceType,
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

describe('CashReceiptsService', () => {
  let service: CashReceiptsService;
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
    docNumbering = { generate: jest.fn().mockResolvedValue('PT-26-00001') };
    partnerResolver = { resolve: jest.fn().mockResolvedValue(null) };
    accountResolver = {
      resolveContraAccount: jest.fn().mockResolvedValue('contra-resolved'),
    };
    dataSource = {
      transaction: jest.fn((cb) => cb(manager)),
      manager,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashReceiptsService,
        { provide: getRepositoryToken(CashReceiptEntity), useValue: {} },
        { provide: getRepositoryToken(CashReceiptLineEntity), useValue: {} },
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
          provide: DebtCollectionSagaService,
          useValue: { compensate: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(CashReceiptsService);
  };

  describe('create', () => {
    it('auto-posts: resolves contra by purpose and records a DEPOSIT movement', async () => {
      const manager = buildManager({
        findOneResult: {
          id: 'r-new',
          status: CashVoucherStatus.POSTED,
          documentNumber: 'PT-26-00001',
        },
      });
      await setup(manager);

      const result = await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashReceiptPurpose.OTHER,
          cashAccountId: 'cash-1',
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
      expect(cashService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          cashAccountId: 'cash-1',
          type: CashMovementType.DEPOSIT,
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
        CashReceiptReferenceType.MANUAL,
      );
      expect(createdVoucher[1].contraAccountId).toBe('contra-resolved');
      expect(createdVoucher[1].journalEntryId).toBe('je-1');
      expect(result.status).toBe(CashVoucherStatus.POSTED);
    });

    it('stores a hand-typed party name and never looks it up', async () => {
      const manager = buildManager({
        findOneResult: { id: 'r-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashReceiptPurpose.OTHER,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          partnerType: 'OTHER',
          partnerName: '  Nguyễn Văn A  ',
          lines: [{ description: 'Thu khác', amount: 100 }],
        } as any,
        actor,
      );

      // Nothing to resolve: a free-text party has no catalogue row behind it.
      expect(partnerResolver.resolve).not.toHaveBeenCalled();
      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === CashVoucherStatus.POSTED,
      );
      expect(created[1].partnerNameSnapshot).toBe('Nguyễn Văn A');
    });

    it('drops any partnerId sent alongside a hand-typed party', async () => {
      const manager = buildManager({
        findOneResult: { id: 'r-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashReceiptPurpose.OTHER,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          partnerType: 'OTHER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          partnerName: 'Nguyễn Văn A',
          lines: [{ description: 'Thu khác', amount: 100 }],
        } as any,
        actor,
      );

      // A free-text party must not leave a partner_id dangling against a row it
      // never actually referenced.
      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === CashVoucherStatus.POSTED,
      );
      expect(created[1].partnerId).toBeUndefined();
    });

    it('overrides the catalogue name with a hand-typed partnerName, keeping partnerId (ADR-02)', async () => {
      const manager = buildManager({
        findOneResult: { id: 'r-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'Khách hàng thật',
        address: 'HCM',
      });

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashReceiptPurpose.OTHER,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          partnerType: 'CUSTOMER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          partnerName: 'Công ty A — CN Bình Tân',
          lines: [{ description: 'Thu khác', amount: 100 }],
        } as any,
        actor,
      );

      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === CashVoucherStatus.POSTED,
      );
      expect(created[1].partnerNameSnapshot).toBe('Công ty A — CN Bình Tân');
      expect(created[1].partnerId).toBe('11111111-1111-4111-8111-111111111111');
    });

    it('falls back to the catalogue name when partnerName is not sent (auto-create paths unaffected)', async () => {
      const manager = buildManager({
        findOneResult: { id: 'r-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'Khách hàng thật',
        address: 'HCM',
      });

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashReceiptPurpose.OTHER,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          partnerType: 'CUSTOMER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          lines: [{ description: 'Thu khác', amount: 100 }],
        } as any,
        actor,
      );

      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === CashVoucherStatus.POSTED,
      );
      expect(created[1].partnerNameSnapshot).toBe('Khách hàng thật');
    });

    it('rejects when total_amount does not match the line sum', async () => {
      const manager = buildManager({});
      await setup(manager);

      await expect(
        service.create(
          {
            voucherDate: '2026-06-30',
            cashAccountId: 'cash-1',
            totalAmount: 100,
            lines: [{ description: 'x', amount: 80 }],
          } as any,
          actor,
        ),
      ).rejects.toThrow(/must equal sum/);
      expect(cashService.recordMovement).not.toHaveBeenCalled();
    });

    it('stores the hand-typed address for a free-text party (ADR-03)', async () => {
      const manager = buildManager({
        findOneResult: { id: 'r-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashReceiptPurpose.OTHER,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          partnerType: 'OTHER',
          partnerName: 'Nguyễn Văn A',
          address: '123 Lê Lợi, Q1',
          lines: [{ description: 'Thu khác', amount: 100 }],
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
        findOneResult: { id: 'r-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'Khách hàng thật',
        address: 'HCM',
      });

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashReceiptPurpose.OTHER,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          partnerType: 'CUSTOMER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          address: '123 Lê Lợi, Q1',
          lines: [{ description: 'Thu khác', amount: 100 }],
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
        findOneResult: { id: 'r-new', status: CashVoucherStatus.POSTED },
      });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'Khách hàng thật',
        address: 'HCM',
      });

      await service.create(
        {
          voucherDate: '2026-06-30',
          purpose: CashReceiptPurpose.OTHER,
          cashAccountId: 'cash-1',
          totalAmount: 100,
          partnerType: 'CUSTOMER',
          partnerId: '11111111-1111-4111-8111-111111111111',
          lines: [{ description: 'Thu khác', amount: 100 }],
        } as any,
        actor,
      );

      const created = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.status === CashVoucherStatus.POSTED,
      );
      expect(created[1].partnerAddressSnapshot).toBe('HCM');
    });
  });

  describe('post', () => {
    it('records a DEPOSIT movement and marks the receipt POSTED', async () => {
      const receipt: any = {
        id: 'r-1',
        organizationId: 'org-1',
        status: CashVoucherStatus.DRAFT,
        cashAccountId: 'cash-1',
        contraAccountId: 'contra-1',
        totalAmount: 100,
      };
      const manager = buildManager({
        qbResult: receipt,
        findResults: [{ amount: 100 }],
        findOneResult: receipt,
      });
      await setup(manager);

      const result = await service.post('r-1', actor);

      expect(cashService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          cashAccountId: 'cash-1',
          type: CashMovementType.DEPOSIT,
          amount: 100,
          contraAccountId: 'contra-1',
          reference: 'PT-26-00001',
        }),
        actor,
        manager,
      );
      expect(result.status).toBe(CashVoucherStatus.POSTED);
      expect(result.documentNumber).toBe('PT-26-00001');
      expect(result.cashMovementId).toBe('mv-1');
      expect(result.journalEntryId).toBe('je-1');
    });

    it('rejects when total_amount does not match the line sum', async () => {
      const receipt: any = {
        id: 'r-1',
        organizationId: 'org-1',
        status: CashVoucherStatus.DRAFT,
        cashAccountId: 'cash-1',
        contraAccountId: 'contra-1',
        totalAmount: 100,
      };
      const manager = buildManager({
        qbResult: receipt,
        findResults: [{ amount: 80 }],
      });
      await setup(manager);

      await expect(service.post('r-1', actor)).rejects.toThrow(
        /must equal sum/,
      );
      expect(cashService.recordMovement).not.toHaveBeenCalled();
    });

    it('rejects posting a non-DRAFT receipt', async () => {
      const receipt: any = {
        id: 'r-1',
        organizationId: 'org-1',
        status: CashVoucherStatus.POSTED,
      };
      const manager = buildManager({ qbResult: receipt });
      await setup(manager);

      await expect(service.post('r-1', actor)).rejects.toThrow(
        /not in DRAFT/,
      );
    });
  });

  describe('reverse', () => {
    const original: any = {
      id: 'r-1',
      organizationId: 'org-1',
      status: CashVoucherStatus.POSTED,
      documentNumber: 'PT-26-00001',
      cashAccountId: 'cash-1',
      contraAccountId: 'contra-1',
      totalAmount: 100,
      purpose: CashReceiptPurpose.OTHER,
    };

    it('posts an opposite WITHDRAWAL and flips original to REVERSED', async () => {
      const manager = buildManager({
        qbResult: { ...original },
        findResults: [
          { description: 'line', amount: 100, categoryId: null, referenceNote: null },
        ],
        findOneResult: { id: 'r-1', status: CashVoucherStatus.REVERSED },
      });
      await setup(manager);
      cashService.recordMovement.mockResolvedValue({
        movement: { id: 'mv-2' },
        journalEntryId: 'je-2',
      });

      await service.reverse('r-1', 'wrong amount', actor);

      expect(cashService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CashMovementType.WITHDRAWAL,
          amount: 100,
          contraAccountId: 'contra-1',
        }),
        actor,
        manager,
      );
      // Reversal voucher created with REVERSAL reference + linked movement/JE.
      const createdReversal = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.referenceType === CashReceiptReferenceType.REVERSAL,
      );
      expect(createdReversal).toBeDefined();
      expect(createdReversal[1].reversesVoucherId).toBe('r-1');
      expect(createdReversal[1].reversalReason).toBe('wrong amount');
      expect(createdReversal[1].totalAmount).toBe(100);
    });

    it('propagates insufficient-balance (400) from recordMovement', async () => {
      const manager = buildManager({
        qbResult: { ...original },
        findResults: [],
      });
      await setup(manager);
      cashService.recordMovement.mockRejectedValue(
        new BadRequestException('Insufficient cash balance'),
      );

      await expect(service.reverse('r-1', 'reason', actor)).rejects.toThrow(
        /Insufficient cash balance/,
      );
    });
  });

  describe('update — party snapshot', () => {
    // A voucher the user created by hand and already posted — the only shape
    // that update() accepts now (ADR-05).
    const draft = (over: any = {}) => ({
      id: 'r-1',
      status: CashVoucherStatus.POSTED,
      referenceType: CashReceiptReferenceType.MANUAL,
      revision: 0,
      totalAmount: 0,
      documentNumber: 'PT-26-00001',
      organizationId: 'org-1',
      partnerType: 'OTHER',
      partnerId: undefined,
      partnerNameSnapshot: 'Nguyễn Văn A',
      partnerAddressSnapshot: undefined,
      ...over,
    });

    it('edits a hand-typed party name in place', async () => {
      const receipt = draft();
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);

      await service.update('r-1', { revision: 0, partnerName: 'Trần Thị B' } as any, actor);

      expect(receipt.partnerNameSnapshot).toBe('Trần Thị B');
      expect(partnerResolver.resolve).not.toHaveBeenCalled();
    });

    it('clears the hand-typed name when switching to a catalogue party', async () => {
      const receipt = draft();
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'Khách hàng thật',
        address: 'HCM',
      });

      await service.update(
        'r-1',
        {
          revision: 0,
          partnerType: 'CUSTOMER',
          partnerId: '11111111-1111-4111-8111-111111111111',
        } as any,
        actor,
      );

      // null, not undefined — TypeORM's save() skips undefined, which would
      // leave "Nguyễn Văn A" showing against a real customer.
      expect(receipt.partnerNameSnapshot).toBe('Khách hàng thật');
      expect(receipt.partnerId).toBe('11111111-1111-4111-8111-111111111111');
    });

    it('clears partnerId when switching from a catalogue party to hand-typed', async () => {
      const receipt = draft({
        partnerType: 'CUSTOMER',
        partnerId: '11111111-1111-4111-8111-111111111111',
        partnerNameSnapshot: 'Khách hàng thật',
        partnerAddressSnapshot: 'HCM',
      });
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);

      await service.update(
        'r-1',
        { revision: 0, partnerType: 'OTHER', partnerName: 'Nguyễn Văn A' } as any,
        actor,
      );

      expect(receipt.partnerId).toBeNull();
      expect(receipt.partnerNameSnapshot).toBe('Nguyễn Văn A');
      expect(receipt.partnerAddressSnapshot).toBeNull();
    });

    it('leaves the party untouched when the payload does not mention it', async () => {
      const receipt = draft();
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);

      await service.update('r-1', { revision: 0, reason: 'Đổi lý do' } as any, actor);

      expect(receipt.partnerNameSnapshot).toBe('Nguyễn Văn A');
      expect(partnerResolver.resolve).not.toHaveBeenCalled();
    });

    it('overrides the catalogue name with a hand-typed partnerName, keeping the catalogue link (AC-03)', async () => {
      const receipt = draft({
        partnerType: 'CUSTOMER',
        partnerId: '11111111-1111-4111-8111-111111111111',
        partnerNameSnapshot: 'Công ty A',
        partnerAddressSnapshot: 'HCM',
      });
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
      const receipt = draft({
        partnerType: 'CUSTOMER',
        partnerId: '11111111-1111-4111-8111-111111111111',
        partnerNameSnapshot: 'Công ty A',
        partnerAddressSnapshot: 'HCM',
      });
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

  describe('update — address snapshot (ADR-03)', () => {
    const draft = (over: any = {}) => ({
      id: 'r-1',
      status: CashVoucherStatus.POSTED,
      referenceType: CashReceiptReferenceType.MANUAL,
      revision: 0,
      totalAmount: 100,
      documentNumber: 'PT-26-00001',
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
      const receipt = draft();
      const manager = buildManager({
        qbResult: receipt,
        findOneResult: receipt,
        findResults: [{ amount: 100 }],
      });
      await setup(manager);

      await service.update(
        'r-1',
        { revision: 0, address: '123 Lê Lợi, Q1, lầu 3' } as any,
        actor,
      );

      expect(receipt.partnerAddressSnapshot).toBe('123 Lê Lợi, Q1, lầu 3');
      expect(receipt.revision).toBe(1);
      // The amount did not change, so no compensating movement may be posted.
      expect(cashService.recordMovement).not.toHaveBeenCalled();
    });

    it('clears the address to null when sent as an empty string', async () => {
      const receipt = draft();
      const manager = buildManager({
        qbResult: receipt,
        findOneResult: receipt,
        findResults: [{ amount: 100 }],
      });
      await setup(manager);

      await service.update('r-1', { revision: 0, address: '' } as any, actor);

      expect(receipt.partnerAddressSnapshot).toBeNull();
    });

    it('keeps the existing address when the payload does not mention it', async () => {
      const receipt = draft();
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

      expect(receipt.partnerAddressSnapshot).toBe('Địa chỉ cũ');
    });

    it('takes the new party address when switching catalogue party without sending address', async () => {
      const receipt = draft();
      const manager = buildManager({
        qbResult: receipt,
        findOneResult: receipt,
        findResults: [{ amount: 100 }],
      });
      await setup(manager);
      partnerResolver.resolve.mockResolvedValue({
        name: 'Khách hàng thật',
        address: 'HCM',
      });

      await service.update(
        'r-1',
        {
          revision: 0,
          partnerType: 'CUSTOMER',
          partnerId: '11111111-1111-4111-8111-111111111111',
        } as any,
        actor,
      );

      expect(receipt.partnerAddressSnapshot).toBe('HCM');
    });
  });

  describe('update — editing a posted voucher (ADR-01)', () => {
    const posted = (over: any = {}) => ({
      id: 'r-1',
      status: CashVoucherStatus.POSTED,
      referenceType: CashReceiptReferenceType.MANUAL,
      revision: 0,
      totalAmount: 5_000_000,
      documentNumber: 'PT-26-00001',
      cashAccountId: 'cash-1',
      contraAccountId: 'contra-1',
      organizationId: 'org-1',
      ...over,
    });

    it('posts ONE compensating WITHDRAWAL when the receipt shrinks', async () => {
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

      expect(cashService.recordMovement).toHaveBeenCalledTimes(1);
      expect(cashService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          cashAccountId: 'cash-1',
          type: CashMovementType.WITHDRAWAL,
          amount: 1_000_000,
          reference: 'PT-26-00001',
          notes: 'Adjustment for PT-26-00001 rev 1',
        }),
        actor,
        manager,
      );
      // The number is the point of the whole feature: same voucher, not a second one.
      expect(receipt.documentNumber).toBe('PT-26-00001');
      expect(receipt.revision).toBe(1);
    });

    it('posts ONE compensating DEPOSIT when the receipt grows', async () => {
      const receipt = posted();
      const manager = buildManager({
        qbResult: receipt,
        findOneResult: receipt,
        findResults: [{ amount: 7_500_000 }],
      });
      await setup(manager);

      await service.update(
        'r-1',
        {
          revision: 0,
          totalAmount: 7_500_000,
          lines: [{ description: 'Thu khác', amount: 7_500_000 }],
        } as any,
        actor,
      );

      expect(cashService.recordMovement).toHaveBeenCalledTimes(1);
      expect(cashService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CashMovementType.DEPOSIT,
          amount: 2_500_000,
        }),
        actor,
        manager,
      );
    });

    it('moves nothing when only the wording changed', async () => {
      const receipt = posted();
      const manager = buildManager({
        qbResult: receipt,
        findOneResult: receipt,
        findResults: [{ amount: 5_000_000 }],
      });
      await setup(manager);

      await service.update(
        'r-1',
        { revision: 0, totalAmount: 5_000_000, reason: 'Sửa diễn giải' } as any,
        actor,
      );

      expect(cashService.recordMovement).not.toHaveBeenCalled();
      expect(receipt.revision).toBe(1);
    });

    it('refuses a voucher produced by a saga', async () => {
      const receipt = posted({
        referenceType: CashReceiptReferenceType.INVOICE_DEBT,
      });
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);

      await expect(
        service.update('r-1', { revision: 0, totalAmount: 1 } as any, actor),
      ).rejects.toThrow(BadRequestException);
      expect(cashService.recordMovement).not.toHaveBeenCalled();
    });

    it('refuses an already-reversed voucher', async () => {
      const receipt = posted({ reversedByVoucherId: 'r-2' });
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);

      await expect(
        service.update('r-1', { revision: 0, totalAmount: 1 } as any, actor),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses a stale revision instead of overwriting a concurrent edit', async () => {
      const receipt = posted({ revision: 3 });
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);

      await expect(
        service.update('r-1', { revision: 1, totalAmount: 1 } as any, actor),
      ).rejects.toThrow(ConflictException);
      expect(cashService.recordMovement).not.toHaveBeenCalled();
    });

    it('lets an insufficient-balance refusal from recordMovement through', async () => {
      const receipt = posted();
      const manager = buildManager({
        qbResult: receipt,
        findOneResult: receipt,
        findResults: [{ amount: 9_000_000 }],
      });
      await setup(manager);
      cashService.recordMovement.mockRejectedValue(
        new BadRequestException('Insufficient balance'),
      );

      await expect(
        service.update(
          'r-1',
          {
            revision: 0,
            totalAmount: 9_000_000,
            lines: [{ description: 'Thu khác', amount: 9_000_000 }],
          } as any,
          actor,
        ),
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('delete — edit down to nothing (ADR-02)', () => {
    const posted = (over: any = {}) => ({
      id: 'r-1',
      status: CashVoucherStatus.POSTED,
      referenceType: CashReceiptReferenceType.MANUAL,
      revision: 0,
      totalAmount: 3_000_000,
      documentNumber: 'PT-26-00001',
      cashAccountId: 'cash-1',
      contraAccountId: 'contra-1',
      organizationId: 'org-1',
      ...over,
    });

    it('reverses the whole amount and soft-deletes, keeping status POSTED', async () => {
      const receipt = posted();
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);

      await service.delete('r-1', actor);

      expect(cashService.recordMovement).toHaveBeenCalledTimes(1);
      expect(cashService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CashMovementType.WITHDRAWAL,
          amount: 3_000_000,
        }),
        actor,
        manager,
      );
      expect(manager.softDelete).toHaveBeenCalled();
      // No CANCELLED enum value exists; deleted_at is the answer to "still here?".
      expect(receipt.status).toBe(CashVoucherStatus.POSTED);
    });

    it('refuses to delete a saga-produced voucher', async () => {
      const receipt = posted({
        referenceType: CashReceiptReferenceType.INVOICE_DEBT,
      });
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);

      await expect(service.delete('r-1', actor)).rejects.toThrow(
        BadRequestException,
      );
      expect(cashService.recordMovement).not.toHaveBeenCalled();
      expect(manager.softDelete).not.toHaveBeenCalled();
    });

    it('refuses to delete an already-deleted voucher', async () => {
      const receipt = posted({ deletedAt: new Date() });
      const manager = buildManager({ qbResult: receipt, findOneResult: receipt });
      await setup(manager);

      await expect(service.delete('r-1', actor)).rejects.toThrow(
        ConflictException,
      );
      expect(cashService.recordMovement).not.toHaveBeenCalled();
    });

    it('shares the delta engine with update() rather than reversing separately', async () => {
      // Deleting a 3,000,000 receipt and editing it down to zero must produce
      // the same single movement — that equivalence is what ADR-02 buys.
      const forDelete = posted();
      const md = buildManager({ qbResult: forDelete, findOneResult: forDelete });
      await setup(md);
      await service.delete('r-1', actor);
      const deleteCall = cashService.recordMovement.mock.calls[0][0];

      const forEdit = posted();
      const me = buildManager({
        qbResult: forEdit,
        findOneResult: forEdit,
        findResults: [],
      });
      await setup(me);
      await service.update(
        'r-1',
        { revision: 0, totalAmount: 0, lines: [] } as any,
        actor,
      );
      const editCall = cashService.recordMovement.mock.calls[0][0];

      expect(deleteCall.type).toBe(editCall.type);
      expect(deleteCall.amount).toBe(editCall.amount);
    });
  });

  describe('createVoucherForMovement', () => {
    it('inserts a POSTED voucher WITHOUT creating a movement/JE', async () => {
      const manager = buildManager({});
      await setup(manager);

      const result = await service.createVoucherForMovement({
        cashMovementId: 'mv-existing',
        journalEntryId: 'je-existing',
        purpose: CashReceiptPurpose.DEBT_COLLECTION,
        cashAccountId: 'cash-1',
        contraAccountId: 'contra-1',
        amount: 250,
        referenceType: CashReceiptReferenceType.INVOICE_DEBT,
        referenceId: 'debt-1',
        actor,
        description: 'Thu nợ',
      });

      // No new movement / JE / balance change.
      expect(cashService.recordMovement).not.toHaveBeenCalled();
      // Voucher links the pre-existing movement + JE.
      const createdVoucher = manager.create.mock.calls.find(
        (c: any[]) => c[1]?.cashMovementId === 'mv-existing',
      );
      expect(createdVoucher).toBeDefined();
      expect(createdVoucher[1].journalEntryId).toBe('je-existing');
      expect(createdVoucher[1].status).toBe(CashVoucherStatus.POSTED);
      expect(result.voucherNumber).toBe('PT-26-00001');
    });
  });

  describe('getPrintPayload (T-03-03, AC-10)', () => {
    const baseReceipt = {
      id: 'r-1',
      organizationId: 'org-1',
      branchId: 'branch-1',
      documentNumber: 'PT-26-00001',
      voucherDate: '2026-09-08',
      status: CashVoucherStatus.POSTED,
      purpose: CashReceiptPurpose.OTHER,
      partnerNameSnapshot: 'Nguyễn Văn A',
      partnerAddressSnapshot: '123 Lê Lợi',
      payerName: 'Nguyễn Văn A',
      reason: 'Thu tiền bán hàng',
      cashAccountId: 'cash-acc-1',
      contraAccountId: 'contra-1',
      totalAmount: 500000,
      referenceType: CashReceiptReferenceType.MANUAL,
      revision: 0,
      lines: [
        { id: 'line-1', description: 'Bán hàng', categoryId: 'cat-1', amount: 500000 },
      ],
    };

    /**
     * Entity-aware `EntityManager` mock: `getPrintPayload` fans out to
     * `getById` (via `manager.findOne`), `loadVoucherBranch` (via
     * `manager.getRepository(BranchEntity).findOne`), and the service's own
     * `manager.findOne`/`manager.find` for the cash account and categories.
     * The `CashReceiptEntity` branch mirrors the real query's WHERE clause so
     * an org/id mismatch reproduces the same 404 `getById` would give.
     */
    function buildPrintPayloadManager(
      opts: {
        receipt?: typeof baseReceipt;
        branch?: any;
        cashAccount?: any;
        categories?: any[];
      } = {},
    ) {
      const manager: any = {
        findOne: jest.fn(async (entity: any, options: any) => {
          if (entity === CashReceiptEntity) {
            const receipt = opts.receipt;
            if (!receipt) return null;
            if (options.where.organizationId !== receipt.organizationId) return null;
            if (options.where.id !== receipt.id) return null;
            return receipt;
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

    it('resolves branch, cash account name and category names into a CASH_RECEIPT payload', async () => {
      const manager = buildPrintPayloadManager({
        receipt: baseReceipt,
        branch: {
          id: 'branch-1',
          name: 'Chi nhánh Q1',
          address: '1 Đường ABC',
          phone: '0900000000',
        },
        cashAccount: { id: 'cash-acc-1', name: 'Quỹ tiền mặt chính' },
        categories: [{ id: 'cat-1', name: 'Bán hàng' }],
      });
      await setup(manager);

      const payload = await service.getPrintPayload('r-1', actor);

      expect(payload.kind).toBe('CASH_RECEIPT');
      expect(payload.paper).toBe('A5');
      expect(payload.title).toBe('PHIẾU THU');
      expect(payload.docNo).toBe('PT-26-00001');
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
        categoryName: 'Bán hàng',
        amount: 500000,
      });
    });

    it('id not found ⇒ 404 (not 403)', async () => {
      const manager = buildPrintPayloadManager({ receipt: undefined });
      await setup(manager);

      await expect(service.getPrintPayload('missing-id', actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('voucher of another organization ⇒ 404, same as sibling GET :id', async () => {
      const manager = buildPrintPayloadManager({
        receipt: { ...baseReceipt, organizationId: 'org-2' },
      });
      await setup(manager);

      await expect(service.getPrintPayload('r-1', actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
