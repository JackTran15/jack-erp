import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
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
import {
  BankReceiptPurpose,
  BankReceiptReferenceType,
  BankVoucherStatus,
} from '../enums';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

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
  let dataSource: { transaction: jest.Mock; manager: any };

  const setup = async (manager: any) => {
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
    dataSource = {
      transaction: jest.fn((cb) => cb(manager)),
      manager,
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
});
