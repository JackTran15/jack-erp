import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CashCountsService } from './cash-counts.service';
import { CashCountEntity } from './cash-count.entity';
import { CashAccountEntity } from '../../cash/cash-account.entity';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { CashReceiptsService } from '../cash-receipts/cash-receipts.service';
import { CashPaymentsService } from '../cash-payments/cash-payments.service';
import { CashCountStatus, CashCountVarianceVoucherKind } from '../enums';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'u-1',
  organizationId: 'org-1',
  branchId: 'b-1',
  roles: [],
};

describe('CashCountsService', () => {
  let service: CashCountsService;
  let countRepo: any;
  let cashAccountRepo: any;
  let docNumbering: { generate: jest.Mock };
  let receiptsService: { createAndPostInternal: jest.Mock };
  let paymentsService: { createAndPostInternal: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  /** Manager whose locked count + cash account are configurable. */
  function buildManager(count: any, accountBalance: number) {
    const accountRow = { id: 'acc-1', balance: accountBalance };
    return {
      createQueryBuilder: jest.fn((entity: any) => {
        const isCount = entity === CashCountEntity;
        const qb: any = {
          setLock: jest.fn(() => qb),
          where: jest.fn(() => qb),
          andWhere: jest.fn(() => qb),
          getOne: jest.fn(async () => (isCount ? count : accountRow)),
        };
        return qb;
      }),
      save: jest.fn(async (e: any) => e),
      findOne: jest.fn(async () => accountRow),
      query: jest.fn(async () => [{ id: 'contra-acc' }]),
    };
  }

  const setup = async () => {
    countRepo = {
      create: jest.fn((d: any) => ({ id: 'cc-1', ...d })),
      save: jest.fn(async (e: any) => e),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    cashAccountRepo = { findOne: jest.fn() };
    docNumbering = { generate: jest.fn().mockResolvedValue('KKQ-26-00001') };
    receiptsService = {
      createAndPostInternal: jest.fn().mockResolvedValue({
        voucherId: 'r-1',
        voucherNumber: 'PT-26-00001',
        cashMovementId: 'mv-1',
        journalEntryId: 'je-1',
      }),
    };
    paymentsService = {
      createAndPostInternal: jest.fn().mockResolvedValue({
        voucherId: 'p-1',
        voucherNumber: 'PC-26-00001',
        cashMovementId: 'mv-2',
        journalEntryId: 'je-2',
      }),
    };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashCountsService,
        { provide: getRepositoryToken(CashCountEntity), useValue: countRepo },
        { provide: getRepositoryToken(CashAccountEntity), useValue: cashAccountRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: DocumentNumberingService, useValue: docNumbering },
        { provide: CashReceiptsService, useValue: receiptsService },
        { provide: CashPaymentsService, useValue: paymentsService },
      ],
    }).compile();

    service = module.get(CashCountsService);
  };

  beforeEach(setup);

  describe('create', () => {
    it('stores DRAFT with expected NULL and returns currentBalance', async () => {
      cashAccountRepo.findOne.mockResolvedValue({ id: 'acc-1', balance: 5000 });

      const res = await service.create(
        { cashAccountId: 'acc-1', countedAt: '2026-05-01T00:00:00Z', actualAmount: 5000 },
        actor,
      );

      expect(res.status).toBe(CashCountStatus.DRAFT);
      expect(res.expectedAmount).toBeUndefined();
      expect(res.currentBalance).toBe(5000);
    });

    it('rejects mismatched denominations', async () => {
      cashAccountRepo.findOne.mockResolvedValue({ id: 'acc-1', balance: 5000 });
      await expect(
        service.create(
          {
            cashAccountId: 'acc-1',
            countedAt: '2026-05-01T00:00:00Z',
            actualAmount: 5000,
            denominations: [{ denom: 1000, count: 3 }],
          },
          actor,
        ),
      ).rejects.toThrow(/Denominations total/);
    });
  });

  describe('post', () => {
    it('variance > 0 creates an OTHER_INCOME cash receipt (TK 711)', async () => {
      const count = {
        id: 'cc-1',
        organizationId: 'org-1',
        status: CashCountStatus.DRAFT,
        cashAccountId: 'acc-1',
        actualAmount: 5200,
      };
      const manager = buildManager(count, 5000); // expected 5000, actual 5200 → +200
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      const res = await service.post('cc-1', actor);

      expect(receiptsService.createAndPostInternal).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 200, contraAccountId: 'contra-acc' }),
        manager,
      );
      expect(paymentsService.createAndPostInternal).not.toHaveBeenCalled();
      expect(res.variance).toBe(200);
      expect(res.expectedAmount).toBe(5000);
      expect(res.status).toBe(CashCountStatus.POSTED);
      expect(res.varianceVoucher).toMatchObject({
        kind: CashCountVarianceVoucherKind.CASH_RECEIPT,
        documentNumber: 'PT-26-00001',
      });
    });

    it('variance < 0 creates an OTHER cash payment (TK 811)', async () => {
      const count = {
        id: 'cc-1',
        organizationId: 'org-1',
        status: CashCountStatus.DRAFT,
        cashAccountId: 'acc-1',
        actualAmount: 4800,
      };
      const manager = buildManager(count, 5000); // -200
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      const res = await service.post('cc-1', actor);

      expect(paymentsService.createAndPostInternal).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 200, contraAccountId: 'contra-acc' }),
        manager,
      );
      expect(receiptsService.createAndPostInternal).not.toHaveBeenCalled();
      expect(res.variance).toBe(-200);
      expect(res.varianceVoucher).toMatchObject({
        kind: CashCountVarianceVoucherKind.CASH_PAYMENT,
      });
    });

    it('variance = 0 posts without creating any voucher', async () => {
      const count = {
        id: 'cc-1',
        organizationId: 'org-1',
        status: CashCountStatus.DRAFT,
        cashAccountId: 'acc-1',
        actualAmount: 5000,
      };
      const manager = buildManager(count, 5000);
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      const res = await service.post('cc-1', actor);

      expect(receiptsService.createAndPostInternal).not.toHaveBeenCalled();
      expect(paymentsService.createAndPostInternal).not.toHaveBeenCalled();
      expect(res.variance).toBe(0);
      expect(res.varianceVoucher).toBeNull();
      expect(res.status).toBe(CashCountStatus.POSTED);
    });

    it('rejects double-post (count already POSTED)', async () => {
      const count = {
        id: 'cc-1',
        organizationId: 'org-1',
        status: CashCountStatus.POSTED,
        cashAccountId: 'acc-1',
        actualAmount: 5000,
      };
      const manager = buildManager(count, 5000);
      dataSource.transaction.mockImplementation((cb) => cb(manager));

      await expect(service.post('cc-1', actor)).rejects.toThrow(
        /already posted/,
      );
    });

    it('propagates insufficient-balance (400) from the shortage payment', async () => {
      const count = {
        id: 'cc-1',
        organizationId: 'org-1',
        status: CashCountStatus.DRAFT,
        cashAccountId: 'acc-1',
        actualAmount: 4000,
      };
      const manager = buildManager(count, 5000); // -1000
      dataSource.transaction.mockImplementation((cb) => cb(manager));
      paymentsService.createAndPostInternal.mockRejectedValue(
        new BadRequestException('Insufficient cash balance'),
      );

      await expect(service.post('cc-1', actor)).rejects.toThrow(
        /Insufficient cash balance/,
      );
    });
  });
});
