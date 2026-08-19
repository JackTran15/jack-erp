import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WsEventType } from '@erp/shared-interfaces';
import { CancelInvoiceService } from './cancel-invoice.service';
import { MembershipCardService } from '../../customer/services/membership-card.service';
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
  let membershipCardService: {
    getPointBalanceForUpdate: jest.Mock;
    refundRedeemedPoints: jest.Mock;
  };
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
    membershipCardService = {
      getPointBalanceForUpdate: jest.fn().mockResolvedValue(0),
      refundRedeemedPoints: jest.fn().mockResolvedValue(undefined),
    };
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
        { provide: MembershipCardService, useValue: membershipCardService },
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
          // The count the invoice recorded, not floor(amountDue / 10.000) — which for
          // this fixture would be 0 and would contradict pointsReversed = 20.
          points: 20,
          branchId: 'branch-1',
        },
        actor,
      );
    });

    /**
     * QA #16, the reported case. A promotion with "Tích điểm cho khách hàng"
     * unchecked means the sale earned nothing while 800.000đ still moved. Publishing
     * the money alone let the consumer re-derive floor(800000 / 10000) = 80 and debit
     * a card that never received them.
     */
    it('reverses nothing when the sale earned nothing, however much money moved', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ customerId: 'cust-1', amountDue: 800_000, pointsEarned: 0 }),
      );

      const result = await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(result.pointsReversed).toBe(0);
      expect(loyaltyPointsReversePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          points: 0,
          // The money stays on the payload: it is the audit value, and the
          // publisher's `subtotalDelta <= 0` guard is what still fires the event so
          // the consumer writes the replay marker.
          subtotalDelta: 800_000,
        }),
        actor,
      );
    });

    it('still reverses the full earn on an ordinary sale — the number did not change', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ customerId: 'cust-1', amountDue: 800_000, pointsEarned: 80 }),
      );

      const result = await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(result.pointsReversed).toBe(80);
      expect(loyaltyPointsReversePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ points: 80, subtotalDelta: 800_000 }),
        actor,
      );
    });

    it('gives redeemed points back on a blocked sale without clawing anything else', async () => {
      // Card holds 7.575; the sale earned nothing and spent 100.
      // Cancelling: +100 back, −0 clawed back → 7.675.
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(7_575);
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({
          customerId: 'cust-1',
          amountDue: 800_000,
          pointsEarned: 0,
          pointsRedeemed: 100,
        }),
      );

      const result = await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(membershipCardService.refundRedeemedPoints).toHaveBeenCalledWith(
        { customerId: 'cust-1', points: 100, invoiceId: 'inv-1' },
        mockManager,
        actor,
      );
      expect(result.pointsReversed).toBe(0);
      expect(result.pointsBalanceAfter).toBe(7_675);
      expect(loyaltyPointsReversePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ points: 0 }),
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

    /**
     * QA #3. Cancelling used to handle only the earn side: an invoice that
     * redeemed 100 points and earned 138 clawed back the 138 and silently
     * destroyed the 100 — the sale was void but the customer never got their
     * points back. The return flow had done this correctly all along
     * (checkout-return.service), cancel simply never called it.
     */
    it('gives back the points the sale redeemed, leaving the card as it was before', async () => {
      // Card holds 4,203 now; the sale earned 138 and spent 100.
      // Cancelling: +100 back, −138 clawed back → 4,165, the pre-sale balance.
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(4203);
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ customerId: 'cust-1', pointsEarned: 138, pointsRedeemed: 100 }),
      );

      const result = await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(membershipCardService.refundRedeemedPoints).toHaveBeenCalledWith(
        { customerId: 'cust-1', points: 100, invoiceId: 'inv-1' },
        mockManager,
        actor,
      );
      expect(result.pointsReversed).toBe(138);
      expect(result.pointsBalanceAfter).toBe(4165);
    });

    it('refunds inside the cancel transaction, so there is no path that voids the sale but keeps the points', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ customerId: 'cust-1', pointsEarned: 0, pointsRedeemed: 50 }),
      );

      await service.cancel('inv-1', { reason: 'mistake' }, actor);

      // The manager handed to the refund must be the transaction's, not a
      // free-standing repository.
      const [, managerArg] = membershipCardService.refundRedeemedPoints.mock.calls[0];
      expect(managerArg).toBe(mockManager);
    });

    it('does not refund when the sale redeemed nothing', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ customerId: 'cust-1', pointsEarned: 20, pointsRedeemed: 0 }),
      );

      await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(membershipCardService.refundRedeemedPoints).not.toHaveBeenCalled();
    });

    it('never touches a card for a walk-in invoice, even one that somehow recorded points', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ customerId: undefined, pointsEarned: 20, pointsRedeemed: 10 }),
      );

      const result = await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(membershipCardService.refundRedeemedPoints).not.toHaveBeenCalled();
      expect(membershipCardService.getPointBalanceForUpdate).not.toHaveBeenCalled();
      expect(result.pointsBalanceAfter).toBeNull();
    });

    it('clamps the projected balance at 0 rather than reporting a negative card', async () => {
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(10);
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ customerId: 'cust-1', pointsEarned: 500, pointsRedeemed: 0 }),
      );

      const result = await service.cancel('inv-1', { reason: 'mistake' }, actor);

      expect(result.pointsBalanceAfter).toBe(0); // 10 + 0 − 500 would be negative
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
