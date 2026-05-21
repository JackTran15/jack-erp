import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CashReceiptsService } from './cash-receipts.service';
import { CashReceiptEntity } from './cash-receipt.entity';
import { CashReceiptLineEntity } from './cash-receipt-line.entity';
import { CashService } from '../../cash/cash.service';
import { CashMovementType } from '../../cash/cash-movement.entity';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { PartnerResolverService } from '../shared/partner-resolver.service';
import {
  CashReceiptPurpose,
  CashReceiptReferenceType,
  CashVoucherStatus,
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

describe('CashReceiptsService', () => {
  let service: CashReceiptsService;
  let cashService: { recordMovement: jest.Mock };
  let docNumbering: { generate: jest.Mock };
  let partnerResolver: { resolve: jest.Mock };
  let dataSource: { transaction: jest.Mock; manager: any };

  const setup = async (manager: any) => {
    cashService = {
      recordMovement: jest
        .fn()
        .mockResolvedValue({ movement: { id: 'mv-1' }, journalEntryId: 'je-1' }),
    };
    docNumbering = { generate: jest.fn().mockResolvedValue('PT-26-00001') };
    partnerResolver = { resolve: jest.fn().mockResolvedValue(null) };
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
      ],
    }).compile();

    service = module.get(CashReceiptsService);
  };

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
});
