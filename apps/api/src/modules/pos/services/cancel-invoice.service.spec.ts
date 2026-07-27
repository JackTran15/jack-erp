import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WsEventType } from '@erp/shared-interfaces';
import { CancelInvoiceService } from './cancel-invoice.service';
import {
  InvoiceEntity,
  InvoicePaymentMethod,
  InvoiceStatus,
  InvoiceType,
} from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../entities/invoice-payment.entity';
import { InvoiceDebtEntity, DebtStatus } from '../entities/invoice-debt.entity';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { PromotionApplyService } from '../../promotion/promotion-apply.service';
import { AccountResolverService } from '../../accounting/payment-accounts/account-resolver.service';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';
import { InvoiceCancelledPublisher } from '../publishers/invoice-cancelled.publisher';

const actor = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
  permissions: [],
};

const invoiceStub = (overrides: Partial<InvoiceEntity> = {}): InvoiceEntity =>
  ({
    id: 'inv-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    code: 'INV-001',
    status: InvoiceStatus.PAID,
    type: InvoiceType.SALE,
    isDraft: false,
    subtotal: 200,
    discountAmount: 0,
    depositAmount: 0,
    amountDue: 200,
    totalPaid: 200,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as InvoiceEntity;

const itemStub = (overrides: Partial<InvoiceItemEntity> = {}): InvoiceItemEntity =>
  ({
    id: 'item-row-1',
    invoiceId: 'inv-1',
    organizationId: 'org-1',
    itemId: 'item-1',
    locationId: 'loc-1',
    quantity: 2,
    unitPrice: 100,
    lineTotal: 200,
    ...overrides,
  }) as InvoiceItemEntity;

const paymentStub = (
  overrides: Partial<InvoicePaymentEntity> = {},
): InvoicePaymentEntity =>
  ({
    id: 'pay-1',
    invoiceId: 'inv-1',
    organizationId: 'org-1',
    paymentMethod: InvoicePaymentMethod.CASH,
    amount: 200,
    accountId: 'coa-1111',
    ...overrides,
  }) as InvoicePaymentEntity;

/** The refunds[] carried by the single published INVOICE_CANCELLED event. */
const publishedRefunds = (publisher: { publish: jest.Mock }) =>
  publisher.publish.mock.calls[0][0].refunds;

describe('CancelInvoiceService', () => {
  let service: CancelInvoiceService;
  let invoiceRepo: { findOne: jest.Mock; count: jest.Mock };
  let itemRepo: { find: jest.Mock };
  let paymentRepo: { find: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let promotionApplyService: { revertPromotions: jest.Mock };
  let invoiceCancelledPublisher: { publish: jest.Mock };
  let wsEmitter: { emitToBranch: jest.Mock };
  let accountResolver: { resolveDefaultAccount: jest.Mock };
  let cashFundResolver: { resolveBranchCashFund: jest.Mock };
  let mockManager: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockManager = {
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    invoiceRepo = {
      findOne: jest.fn().mockResolvedValue(invoiceStub()),
      count: jest.fn().mockResolvedValue(0),
    };
    itemRepo = { find: jest.fn().mockResolvedValue([itemStub()]) };
    paymentRepo = { find: jest.fn().mockResolvedValue([paymentStub()]) };
    accountResolver = {
      resolveDefaultAccount: jest.fn().mockResolvedValue('coa-revenue'),
    };
    cashFundResolver = {
      resolveBranchCashFund: jest.fn().mockResolvedValue('cash-fund-1'),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };
    promotionApplyService = { revertPromotions: jest.fn().mockResolvedValue(undefined) };
    invoiceCancelledPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    wsEmitter = { emitToBranch: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CancelInvoiceService,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
        { provide: getRepositoryToken(InvoicePaymentEntity), useValue: paymentRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: PromotionApplyService, useValue: promotionApplyService },
        { provide: InvoiceCancelledPublisher, useValue: invoiceCancelledPublisher },
        { provide: WebSocketEmitterService, useValue: wsEmitter },
        { provide: AccountResolverService, useValue: accountResolver },
        { provide: CashFundResolverService, useValue: cashFundResolver },
      ],
    }).compile();

    service = module.get(CancelInvoiceService);
  });

  describe('validation', () => {
    it('throws NotFoundException when invoice not found', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);
      await expect(service.cancel('inv-x', { reason: 'mistake' }, actor)).rejects.toThrow(NotFoundException);
    });

    it('throws when invoice is DRAFT', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub({ status: InvoiceStatus.DRAFT }));
      await expect(service.cancel('inv-1', { reason: 'mistake' }, actor)).rejects.toThrow(BadRequestException);
    });

    it('throws when invoice is already CANCELLED', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub({ status: InvoiceStatus.CANCELLED }));
      await expect(service.cancel('inv-1', { reason: 'mistake' }, actor)).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel PAID invoice', () => {
    it('sets status=CANCELLED, does not close debt, publishes event', async () => {
      const result = await service.cancel('inv-1', { reason: 'mistake-paid' }, actor);

      expect(result.status).toBe(InvoiceStatus.CANCELLED);
      expect(result.cancelReason).toBe('mistake-paid');
      expect(mockManager.update).not.toHaveBeenCalledWith(
        InvoiceDebtEntity,
        expect.anything(),
        expect.anything(),
      );
      expect(invoiceCancelledPublisher.publish).toHaveBeenCalledTimes(1);
    });

    it('publishes event with items and branchId', async () => {
      await service.cancel('inv-1', { reason: 'mistake-paid' }, actor);

      expect(invoiceCancelledPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: 'inv-1',
          documentNumber: 'INV-001',
          reason: 'mistake-paid',
          branchId: 'branch-1',
          items: [{ itemId: 'item-1', locationId: 'loc-1', quantity: 2 }],
        }),
        actor,
      );
    });

    it('reverts promotions inside the transaction', async () => {
      await service.cancel('inv-1', { reason: 'mistake-paid' }, actor);
      expect(promotionApplyService.revertPromotions).toHaveBeenCalledWith('inv-1', mockManager);
    });
  });

  describe('cancel DEBT invoice', () => {
    it('closes outstanding debt', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub({ status: InvoiceStatus.DEBT, totalPaid: 0 }));
      await service.cancel('inv-1', { reason: 'mistake-debt' }, actor);

      expect(mockManager.update).toHaveBeenCalledWith(
        InvoiceDebtEntity,
        { invoiceId: 'inv-1', organizationId: 'org-1' },
        expect.objectContaining({ status: DebtStatus.PAID }),
      );
    });
  });

  describe('cancel PARTIAL_DEBT invoice', () => {
    it('is permitted and closes outstanding debt', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ status: InvoiceStatus.PARTIAL_DEBT, totalPaid: 120 }),
      );
      const result = await service.cancel('inv-1', { reason: 'mistake-partial' }, actor);

      expect(result.status).toBe(InvoiceStatus.CANCELLED);
      expect(mockManager.update).toHaveBeenCalledWith(
        InvoiceDebtEntity,
        { invoiceId: 'inv-1', organizationId: 'org-1' },
        expect.objectContaining({ status: DebtStatus.PAID }),
      );
      expect(invoiceCancelledPublisher.publish).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancellation guards (T-05-01)', () => {
    it('refuses a RETURN invoice', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ type: InvoiceType.RETURN }),
      );

      await expect(
        service.cancel('inv-1', { reason: 'mistake' }, actor),
      ).rejects.toThrow(/Only sale invoices/);
      expect(invoiceCancelledPublisher.publish).not.toHaveBeenCalled();
    });

    it('refuses an EXCHANGE invoice', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ type: InvoiceType.EXCHANGE }),
      );

      await expect(
        service.cancel('inv-1', { reason: 'mistake' }, actor),
      ).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuses a sale that already has a settled return', async () => {
      invoiceRepo.count.mockResolvedValue(1);

      await expect(
        service.cancel('inv-1', { reason: 'mistake' }, actor),
      ).rejects.toThrow(/already has a return\/exchange/);
      expect(invoiceCancelledPublisher.publish).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('allows a sale whose only returns are draft or cancelled', async () => {
      // Those are filtered out by the query, so the count comes back 0.
      invoiceRepo.count.mockResolvedValue(0);

      const result = await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(result.status).toBe(InvoiceStatus.CANCELLED);
      expect(invoiceRepo.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            originalInvoiceId: 'inv-1',
            isDraft: false,
          }),
        }),
      );
    });

    it('still rejects a draft invoice on status, as before', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ status: InvoiceStatus.DRAFT }),
      );

      await expect(
        service.cancel('inv-1', { reason: 'mistake' }, actor),
      ).rejects.toThrow(/Only paid\/debt\/partial-debt/);
    });
  });

  describe('refund legs (T-01-01)', () => {
    it('builds one CASH leg for a fully paid cash invoice', async () => {
      paymentRepo.find.mockResolvedValue([paymentStub({ amount: 1_000_000 })]);

      await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(publishedRefunds(invoiceCancelledPublisher)).toEqual([
        {
          invoicePaymentIds: ['pay-1'],
          fundKind: 'CASH',
          cashAccountId: 'cash-fund-1',
          amount: 1_000_000,
          contraAccountId: 'coa-revenue',
        },
      ]);
    });

    it('refunds only what was collected on a partial_debt invoice, not amountDue', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({
          status: InvoiceStatus.PARTIAL_DEBT,
          amountDue: 1_000_000,
          totalPaid: 600_000,
        }),
      );
      paymentRepo.find.mockResolvedValue([paymentStub({ amount: 600_000 })]);

      await service.cancel('inv-1', { reason: 'mistake' }, actor);

      const refunds = publishedRefunds(invoiceCancelledPublisher);
      expect(refunds).toHaveLength(1);
      expect(refunds[0].amount).toBe(600_000);
    });

    it('publishes an empty refunds[] when nothing was ever collected', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ status: InvoiceStatus.DEBT, totalPaid: 0 }),
      );
      paymentRepo.find.mockResolvedValue([]);

      const result = await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(publishedRefunds(invoiceCancelledPublisher)).toEqual([]);
      expect(result.status).toBe(InvoiceStatus.CANCELLED);
      expect(cashFundResolver.resolveBranchCashFund).not.toHaveBeenCalled();
    });

    it('splits a mixed-tender invoice into one CASH leg and one DEPOSIT leg', async () => {
      paymentRepo.find.mockResolvedValue([
        paymentStub({ id: 'pay-cash', amount: 1_000_000 }),
        paymentStub({
          id: 'pay-bank',
          paymentMethod: InvoicePaymentMethod.BANK_TRANSFER,
          amount: 2_000_000,
          accountId: 'coa-1121',
          depositAccountId: 'deposit-1',
        }),
      ]);

      await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(publishedRefunds(invoiceCancelledPublisher)).toEqual([
        {
          invoicePaymentIds: ['pay-cash'],
          fundKind: 'CASH',
          cashAccountId: 'cash-fund-1',
          amount: 1_000_000,
          contraAccountId: 'coa-revenue',
        },
        {
          invoicePaymentIds: ['pay-bank'],
          fundKind: 'DEPOSIT',
          depositAccountId: 'deposit-1',
          amount: 2_000_000,
          contraAccountId: 'coa-revenue',
        },
      ]);
    });

    it('folds several cash lines into a single CASH leg', async () => {
      paymentRepo.find.mockResolvedValue([
        paymentStub({ id: 'pay-1', amount: 300_000 }),
        paymentStub({ id: 'pay-2', amount: 200_000 }),
      ]);

      await service.cancel('inv-1', { reason: 'mistake' }, actor);

      const refunds = publishedRefunds(invoiceCancelledPublisher);
      expect(refunds).toHaveLength(1);
      expect(refunds[0].amount).toBe(500_000);
      expect(refunds[0].invoicePaymentIds).toEqual(['pay-1', 'pay-2']);
    });

    it('falls back to the line COA when no deposit fund was named', async () => {
      paymentRepo.find.mockResolvedValue([
        paymentStub({
          id: 'pay-card',
          paymentMethod: InvoicePaymentMethod.CARD,
          amount: 500_000,
          accountId: 'coa-1121',
          depositAccountId: undefined,
        }),
      ]);

      await service.cancel('inv-1', { reason: 'mistake' }, actor);

      const refunds = publishedRefunds(invoiceCancelledPublisher);
      expect(refunds[0].depositAccountId).toBe('coa-1121');
    });

    it('takes cashAccountId from the fund resolver, never from the payment COA', async () => {
      paymentRepo.find.mockResolvedValue([
        paymentStub({ accountId: 'coa-1111', amount: 100_000 }),
      ]);

      await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(cashFundResolver.resolveBranchCashFund).toHaveBeenCalledWith(
        'org-1',
        'branch-1',
      );
      expect(publishedRefunds(invoiceCancelledPublisher)[0].cashAccountId).toBe(
        'cash-fund-1',
      );
    });

    it('does not cancel the invoice when the branch has no cash fund', async () => {
      cashFundResolver.resolveBranchCashFund.mockRejectedValue(
        new BadRequestException('No cash fund configured for branch branch-1'),
      );

      await expect(
        service.cancel('inv-1', { reason: 'mistake' }, actor),
      ).rejects.toThrow(BadRequestException);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(invoiceCancelledPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('items filtering', () => {
    it('excludes items without locationId from the published payload', async () => {
      itemRepo.find.mockResolvedValue([
        itemStub({ itemId: 'item-1', locationId: 'loc-1' }),
        itemStub({ itemId: 'item-2', locationId: undefined }),
      ]);

      await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(invoiceCancelledPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ itemId: 'item-1', locationId: 'loc-1', quantity: 2 }],
        }),
        actor,
      );
    });
  });
});
