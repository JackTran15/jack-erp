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
import { LoyaltyPointsReversePublisher } from '../../customer/publishers/loyalty-points-reverse.publisher';
import {
  InvoiceCancelledPublisher,
  InvoiceCancelledRefundLeg,
} from '../publishers/invoice-cancelled.publisher';
import { InvoiceRefundLegsService } from './invoice-refund-legs.service';

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

/** Leg composition itself lives in InvoiceRefundLegsService and is tested there. */
const cashLegStub = (
  overrides: Partial<InvoiceCancelledRefundLeg> = {},
): InvoiceCancelledRefundLeg => ({
  invoicePaymentIds: ['pay-1'],
  fundKind: 'CASH',
  cashAccountId: 'cash-fund-1',
  amount: 200,
  contraAccountId: 'coa-revenue',
  ...overrides,
});

/** The refunds[] carried by the single published INVOICE_CANCELLED event. */
const publishedRefunds = (publisher: { publish: jest.Mock }) =>
  publisher.publish.mock.calls[0][0].refunds;

describe('CancelInvoiceService', () => {
  let service: CancelInvoiceService;
  let invoiceRepo: { findOne: jest.Mock; count: jest.Mock };
  let itemRepo: { find: jest.Mock };
  let refundLegs: { build: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let promotionApplyService: { revertPromotions: jest.Mock };
  let invoiceCancelledPublisher: { publish: jest.Mock };
  let wsEmitter: { emitToBranch: jest.Mock };
  let loyaltyPointsReversePublisher: { publish: jest.Mock };
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
    refundLegs = { build: jest.fn().mockResolvedValue([cashLegStub()]) };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };
    promotionApplyService = { revertPromotions: jest.fn().mockResolvedValue(undefined) };
    invoiceCancelledPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    loyaltyPointsReversePublisher = { publish: jest.fn().mockResolvedValue(true) };
    wsEmitter = { emitToBranch: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CancelInvoiceService,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: PromotionApplyService, useValue: promotionApplyService },
        { provide: InvoiceCancelledPublisher, useValue: invoiceCancelledPublisher },
        { provide: WebSocketEmitterService, useValue: wsEmitter },
        { provide: InvoiceRefundLegsService, useValue: refundLegs },
        {
          provide: LoyaltyPointsReversePublisher,
          useValue: loyaltyPointsReversePublisher,
        },
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
      ).rejects.toThrow(/đã có phiếu đổi trả/);
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
    it('publishes the legs the builder produced', async () => {
      refundLegs.build.mockResolvedValue([
        cashLegStub({ amount: 1_000_000 }),
        {
          invoicePaymentIds: ['pay-bank'],
          fundKind: 'DEPOSIT',
          depositAccountId: 'deposit-1',
          amount: 2_000_000,
          contraAccountId: 'coa-revenue',
        },
      ]);

      await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(refundLegs.build).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'inv-1' }),
        actor,
      );
      expect(publishedRefunds(invoiceCancelledPublisher)).toHaveLength(2);
    });

    it('publishes an empty refunds[] when nothing was ever collected', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ status: InvoiceStatus.DEBT, totalPaid: 0 }),
      );
      refundLegs.build.mockResolvedValue([]);

      const result = await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(publishedRefunds(invoiceCancelledPublisher)).toEqual([]);
      expect(result.status).toBe(InvoiceStatus.CANCELLED);
    });

    it('does not cancel the invoice when the branch has no cash fund', async () => {
      refundLegs.build.mockRejectedValue(
        new BadRequestException('No cash fund configured for branch branch-1'),
      );

      await expect(
        service.cancel('inv-1', { reason: 'mistake' }, actor),
      ).rejects.toThrow(BadRequestException);

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(invoiceCancelledPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('loyalty points reversal', () => {
    it('reverses points earned when the invoice has a customer', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ customerId: 'cust-1', amountDue: 200, pointsEarned: 20 }),
      );

      const result = await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(result.pointsReversed).toBe(20);
      expect(loyaltyPointsReversePublisher.publish).toHaveBeenCalledWith(
        {
          returnInvoiceId: 'inv-1',
          customerId: 'cust-1',
          subtotalDelta: 200,
          branchId: 'branch-1',
        },
        actor,
      );
    });

    it('does not publish a reversal for a walk-in invoice without a customer', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ customerId: undefined, pointsEarned: 20 }),
      );

      await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(loyaltyPointsReversePublisher.publish).not.toHaveBeenCalled();
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
