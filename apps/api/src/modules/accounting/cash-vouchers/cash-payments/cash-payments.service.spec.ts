import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CashPaymentsService } from './cash-payments.service';
import { CashPaymentEntity } from './cash-payment.entity';
import { CashPaymentLineEntity } from './cash-payment-line.entity';
import { CashService } from '../../cash/cash.service';
import { CashMovementType } from '../../cash/cash-movement.entity';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { PartnerResolverService } from '../shared/partner-resolver.service';
import { SupplierDebtPaymentSagaService } from '../supplier-debt-payment/supplier-debt-payment-saga.service';
import {
  CashPaymentPurpose,
  CashPaymentReferenceType,
  CashVoucherStatus,
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

describe('CashPaymentsService', () => {
  let service: CashPaymentsService;
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
    docNumbering = { generate: jest.fn().mockResolvedValue('PC-26-00001') };
    partnerResolver = { resolve: jest.fn().mockResolvedValue(null) };
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
        {
          provide: SupplierDebtPaymentSagaService,
          useValue: { compensate: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(CashPaymentsService);
  };

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
});
