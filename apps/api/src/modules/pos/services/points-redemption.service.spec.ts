import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InvoiceEntity, InvoiceStatus } from '../entities/invoice.entity';
import { MembershipCardService } from '../../customer/services/membership-card.service';
import { PointsRedemptionService } from './points-redemption.service';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

const invoiceStub = (overrides: Partial<InvoiceEntity> = {}): InvoiceEntity =>
  ({
    id: 'invoice-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    code: 'DRAFT-1',
    status: InvoiceStatus.DRAFT,
    subtotal: 100000,
    discountAmount: 0,
    pointsRedeemed: 0,
    pointsDiscountAmount: 0,
    depositAmount: 0,
    amountDue: 100000,
    isDraft: true,
    customerId: 'customer-1',
    createdBy: 'user-1',
    ...overrides,
  }) as InvoiceEntity;

describe('PointsRedemptionService', () => {
  let service: PointsRedemptionService;
  let invoiceRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let manager: { findOne: jest.Mock; save: jest.Mock };
  let membershipCardService: {
    findActiveCard: jest.Mock;
    getPointBalanceForUpdate: jest.Mock;
  };

  beforeEach(async () => {
    // Manager GIẢ đứng thay transaction: `applyRedemption` nay chỉ là lớp mỏng
    // mở một transaction rồi gọi `applyRedemptionIn`, nên mọi ca cũ vẫn chạy
    // qua đúng một đường — đó là điểm của lần tách này.
    manager = {
      findOne: jest.fn(),
      save: jest.fn((_entity, e) => Promise.resolve(e)),
    };
    invoiceRepo = {
      findOne: jest.fn(),
      save: jest.fn((e) => Promise.resolve(e)),
      manager: { transaction: jest.fn((cb) => cb(manager)) },
    };
    membershipCardService = {
      findActiveCard: jest.fn(),
      getPointBalanceForUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PointsRedemptionService,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: MembershipCardService, useValue: membershipCardService },
      ],
    }).compile();

    service = module.get(PointsRedemptionService);
  });

  describe('applyRedemption', () => {
    it('throws NotFoundException when invoice not found', async () => {
      manager.findOne.mockResolvedValue(null);
      await expect(
        service.applyRedemption('missing', 10, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException on a non-draft invoice', async () => {
      manager.findOne.mockResolvedValue(invoiceStub({ isDraft: false }));
      await expect(
        service.applyRedemption('invoice-1', 10, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when the invoice has no customer', async () => {
      manager.findOne.mockResolvedValue(invoiceStub({ customerId: undefined }));
      await expect(
        service.applyRedemption('invoice-1', 10, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-integer or non-positive points', async () => {
      manager.findOne.mockResolvedValue(invoiceStub());
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(100);
      await expect(
        service.applyRedemption('invoice-1', 0, actor),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.applyRedemption('invoice-1', 1.5, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when customer has no active card', async () => {
      manager.findOne.mockResolvedValue(invoiceStub());
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(null);
      await expect(
        service.applyRedemption('invoice-1', 10, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when requested points exceed the balance', async () => {
      manager.findOne.mockResolvedValue(invoiceStub());
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(5);
      await expect(
        service.applyRedemption('invoice-1', 10, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when the point discount exceeds the redeemable amount', async () => {
      // subtotal 4.000đ → maxDiscount 4.000đ; 10 points = 5.000đ > max.
      manager.findOne.mockResolvedValue(invoiceStub({ subtotal: 4000 }));
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(100);
      await expect(
        service.applyRedemption('invoice-1', 10, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('sets pointsRedeemed, pointsDiscountAmount and recomputes amountDue', async () => {
      const invoice = invoiceStub({ subtotal: 100000 });
      manager.findOne.mockResolvedValue(invoice);
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(100);

      const result = await service.applyRedemption('invoice-1', 30, actor);

      // 30 points * 500đ = 15.000đ off → 85.000đ due.
      expect(result.pointsRedeemed).toBe(30);
      expect(result.pointsDiscountAmount).toBe(15000);
      expect(result.amountDue).toBe(85000);
      expect(manager.save).toHaveBeenCalled();
    });
  });

  describe('removeRedemption', () => {
    it('resets redemption fields and recomputes amountDue', async () => {
      const invoice = invoiceStub({
        subtotal: 100000,
        pointsRedeemed: 30,
        pointsDiscountAmount: 30000,
        amountDue: 70000,
      });
      invoiceRepo.findOne.mockResolvedValue(invoice);

      const result = await service.removeRedemption('invoice-1', actor);

      expect(result.pointsRedeemed).toBe(0);
      expect(result.pointsDiscountAmount).toBe(0);
      expect(result.amountDue).toBe(100000);
    });
  });
});
