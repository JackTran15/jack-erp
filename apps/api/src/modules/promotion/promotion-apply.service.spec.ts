import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { InvoiceEntity, InvoiceStatus } from '../pos/entities/invoice.entity';
import { InvoicePromotionEntity, InvoicePromotionType } from './invoice-promotion.entity';
import { DiscountCodeEntity, DiscountType } from './discount-code.entity';
import { VoucherEntity } from './voucher.entity';
import { PromotionEntity, PromotionType } from './promotion.entity';
import { DiscountCodeService } from './discount-code.service';
import { VoucherService } from './voucher.service';
import { PromotionService } from './promotion.service';
import { PromotionApplyService } from './promotion-apply.service';

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
    code: 'INV-001',
    status: InvoiceStatus.DRAFT,
    subtotal: 1000,
    discountAmount: 0,
    depositAmount: 0,
    amountDue: 1000,
    isDraft: true,
    sessionId: 'session-1',
    staffId: 'staff-1',
    customerId: 'customer-1',
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as InvoiceEntity;

const discountCodeStub = (
  overrides: Partial<DiscountCodeEntity> = {},
): DiscountCodeEntity =>
  ({
    id: 'dc-1',
    organizationId: 'org-1',
    code: 'SAVE10',
    discountType: DiscountType.PERCENTAGE,
    discountValue: 10,
    minOrderValue: 0,
    maxUses: 100,
    usedCount: 0,
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2026-12-31'),
    isActive: true,
    ...overrides,
  }) as DiscountCodeEntity;

const voucherStub = (overrides: Partial<VoucherEntity> = {}): VoucherEntity =>
  ({
    id: 'voucher-1',
    organizationId: 'org-1',
    code: 'VOUCHER200',
    faceValue: 200,
    customerId: undefined,
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2026-12-31'),
    isUsed: false,
    isActive: true,
    ...overrides,
  }) as VoucherEntity;

const promotionStub = (overrides: Partial<PromotionEntity> = {}): PromotionEntity =>
  ({
    id: 'promo-1',
    organizationId: 'org-1',
    name: 'Summer Sale',
    type: PromotionType.ORDER_DISCOUNT,
    conditions: {},
    benefits: { discount_type: 'percentage', discount_value: 10 },
    validFrom: new Date('2026-01-01'),
    validTo: new Date('2026-12-31'),
    applicableBranchIds: [],
    isActive: true,
    ...overrides,
  }) as PromotionEntity;

const invoicePromotionStub = (
  overrides: Partial<InvoicePromotionEntity> = {},
): InvoicePromotionEntity =>
  ({
    id: 'ip-1',
    invoiceId: 'invoice-1',
    promotionType: InvoicePromotionType.DISCOUNT_CODE,
    refId: 'dc-1',
    discountAmount: 100,
    organizationId: 'org-1',
    branchId: 'branch-1',
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as InvoicePromotionEntity;

describe('PromotionApplyService', () => {
  let service: PromotionApplyService;
  let invoicePromotionRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let invoiceRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    save: jest.Mock;
  };
  let discountCodeService: {
    validate: jest.Mock;
    incrementUsedCount: jest.Mock;
  };
  let voucherService: {
    validate: jest.Mock;
    markUsed: jest.Mock;
  };
  let promotionService: {
    findOne: jest.Mock;
    findByName: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  // Mocks for transaction manager repos
  let mockIpManagerRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
  };
  let mockInvManagerRepo: {
    save: jest.Mock;
  };

  beforeEach(async () => {
    mockIpManagerRepo = {
      create: jest.fn((dto) => ({ id: 'ip-new', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      find: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    mockInvManagerRepo = {
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    invoicePromotionRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((dto) => ({ id: 'ip-new', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    invoiceRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    discountCodeService = {
      validate: jest.fn(),
      incrementUsedCount: jest.fn().mockResolvedValue(undefined),
    };
    voucherService = {
      validate: jest.fn(),
      markUsed: jest.fn().mockResolvedValue(undefined),
    };
    promotionService = {
      findOne: jest.fn(),
      findByName: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => {
        const mockManager = {
          getRepository: jest.fn((Entity) => {
            if (Entity === InvoicePromotionEntity) return mockIpManagerRepo;
            if (Entity === InvoiceEntity) return mockInvManagerRepo;
            return {};
          }),
        };
        return cb(mockManager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromotionApplyService,
        {
          provide: getRepositoryToken(InvoicePromotionEntity),
          useValue: invoicePromotionRepo,
        },
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: DiscountCodeService, useValue: discountCodeService },
        { provide: VoucherService, useValue: voucherService },
        { provide: PromotionService, useValue: promotionService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(PromotionApplyService);
  });

  // =========================================================================
  // apply
  // =========================================================================
  describe('apply', () => {
    it('throws NotFoundException when invoice not found', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);

      await expect(
        service.apply(
          'missing-invoice',
          { type: InvoicePromotionType.DISCOUNT_CODE, code: 'SAVE10' },
          actor,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when invoice.isDraft=false', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub({ isDraft: false }));

      await expect(
        service.apply(
          'invoice-1',
          { type: InvoicePromotionType.DISCOUNT_CODE, code: 'SAVE10' },
          actor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    // -----------------------------------------------------------------------
    // DISCOUNT_CODE type
    // -----------------------------------------------------------------------
    describe('DISCOUNT_CODE type', () => {
      it('calls discountCodeService.validate with (code, subtotal, actor)', async () => {
        const invoice = invoiceStub({ subtotal: 1000 });
        invoiceRepo.findOne
          .mockResolvedValueOnce(invoice) // first call in apply()
          .mockResolvedValueOnce(invoice); // reload at end
        invoicePromotionRepo.find.mockResolvedValue([]);
        const dc = discountCodeStub({ discountType: DiscountType.PERCENTAGE, discountValue: 10 });
        discountCodeService.validate.mockResolvedValue(dc);
        mockIpManagerRepo.find.mockResolvedValue([{ discountAmount: 100 }]);

        await service.apply(
          'invoice-1',
          { type: InvoicePromotionType.DISCOUNT_CODE, code: 'SAVE10' },
          actor,
        );

        expect(discountCodeService.validate).toHaveBeenCalledWith('SAVE10', 1000, actor);
      });

      it('computes discountAmount for PERCENTAGE type correctly (10% of 1000 = 100)', async () => {
        const invoice = invoiceStub({ subtotal: 1000 });
        invoiceRepo.findOne
          .mockResolvedValueOnce(invoice)
          .mockResolvedValueOnce(invoice);
        invoicePromotionRepo.find.mockResolvedValue([]);
        const dc = discountCodeStub({ discountType: DiscountType.PERCENTAGE, discountValue: 10 });
        discountCodeService.validate.mockResolvedValue(dc);
        mockIpManagerRepo.find.mockResolvedValue([{ discountAmount: 100 }]);

        await service.apply(
          'invoice-1',
          { type: InvoicePromotionType.DISCOUNT_CODE, code: 'SAVE10' },
          actor,
        );

        expect(mockIpManagerRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ discountAmount: 100 }),
        );
      });

      it('computes discountAmount for FIXED_AMOUNT type correctly (50)', async () => {
        const invoice = invoiceStub({ subtotal: 1000 });
        invoiceRepo.findOne
          .mockResolvedValueOnce(invoice)
          .mockResolvedValueOnce(invoice);
        invoicePromotionRepo.find.mockResolvedValue([]);
        const dc = discountCodeStub({ discountType: DiscountType.FIXED_AMOUNT, discountValue: 50 });
        discountCodeService.validate.mockResolvedValue(dc);
        mockIpManagerRepo.find.mockResolvedValue([{ discountAmount: 50 }]);

        await service.apply(
          'invoice-1',
          { type: InvoicePromotionType.DISCOUNT_CODE, code: 'FIXED50' },
          actor,
        );

        expect(mockIpManagerRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ discountAmount: 50 }),
        );
      });

      it('inserts InvoicePromotionEntity with correct refId and discountAmount', async () => {
        const invoice = invoiceStub({ subtotal: 1000 });
        invoiceRepo.findOne
          .mockResolvedValueOnce(invoice)
          .mockResolvedValueOnce(invoice);
        invoicePromotionRepo.find.mockResolvedValue([]);
        const dc = discountCodeStub({ id: 'dc-1', discountType: DiscountType.PERCENTAGE, discountValue: 10 });
        discountCodeService.validate.mockResolvedValue(dc);
        mockIpManagerRepo.find.mockResolvedValue([{ discountAmount: 100 }]);

        await service.apply(
          'invoice-1',
          { type: InvoicePromotionType.DISCOUNT_CODE, code: 'SAVE10' },
          actor,
        );

        expect(mockIpManagerRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({
            invoiceId: 'invoice-1',
            promotionType: InvoicePromotionType.DISCOUNT_CODE,
            refId: 'dc-1',
            discountAmount: 100,
          }),
        );
      });

      it('recalculates invoice.discountAmount and invoice.amountDue', async () => {
        const invoice = invoiceStub({ subtotal: 1000, depositAmount: 0 });
        invoiceRepo.findOne
          .mockResolvedValueOnce(invoice)
          .mockResolvedValueOnce(invoice);
        invoicePromotionRepo.find.mockResolvedValue([]);
        const dc = discountCodeStub({ discountType: DiscountType.PERCENTAGE, discountValue: 10 });
        discountCodeService.validate.mockResolvedValue(dc);
        // After saving, allPromotions returns the new entry
        mockIpManagerRepo.find.mockResolvedValue([{ discountAmount: 100 }]);

        await service.apply(
          'invoice-1',
          { type: InvoicePromotionType.DISCOUNT_CODE, code: 'SAVE10' },
          actor,
        );

        expect(mockInvManagerRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({
            discountAmount: 100,
            amountDue: 900,
          }),
        );
      });
    });

    // -----------------------------------------------------------------------
    // VOUCHER type
    // -----------------------------------------------------------------------
    describe('VOUCHER type', () => {
      it('calls voucherService.validate with (code, invoice.customerId, actor)', async () => {
        const invoice = invoiceStub({ subtotal: 1000, customerId: 'customer-1' });
        invoiceRepo.findOne
          .mockResolvedValueOnce(invoice)
          .mockResolvedValueOnce(invoice);
        invoicePromotionRepo.find.mockResolvedValue([]);
        const voucher = voucherStub({ faceValue: 200 });
        voucherService.validate.mockResolvedValue(voucher);
        mockIpManagerRepo.find.mockResolvedValue([{ discountAmount: 200 }]);

        await service.apply(
          'invoice-1',
          { type: InvoicePromotionType.VOUCHER, code: 'VOUCHER200' },
          actor,
        );

        expect(voucherService.validate).toHaveBeenCalledWith(
          'VOUCHER200',
          'customer-1',
          actor,
        );
      });

      it('discountAmount = faceValue when faceValue <= subtotal (200 <= 1000)', async () => {
        const invoice = invoiceStub({ subtotal: 1000 });
        invoiceRepo.findOne
          .mockResolvedValueOnce(invoice)
          .mockResolvedValueOnce(invoice);
        invoicePromotionRepo.find.mockResolvedValue([]);
        const voucher = voucherStub({ faceValue: 200 });
        voucherService.validate.mockResolvedValue(voucher);
        mockIpManagerRepo.find.mockResolvedValue([{ discountAmount: 200 }]);

        await service.apply(
          'invoice-1',
          { type: InvoicePromotionType.VOUCHER, code: 'VOUCHER200' },
          actor,
        );

        expect(mockIpManagerRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ discountAmount: 200 }),
        );
      });

      it('discountAmount = subtotal when faceValue > subtotal (1500 > 1000 → capped at 1000)', async () => {
        const invoice = invoiceStub({ subtotal: 1000 });
        invoiceRepo.findOne
          .mockResolvedValueOnce(invoice)
          .mockResolvedValueOnce(invoice);
        invoicePromotionRepo.find.mockResolvedValue([]);
        const voucher = voucherStub({ faceValue: 1500 });
        voucherService.validate.mockResolvedValue(voucher);
        mockIpManagerRepo.find.mockResolvedValue([{ discountAmount: 1000 }]);

        await service.apply(
          'invoice-1',
          { type: InvoicePromotionType.VOUCHER, code: 'BIGVOUCHER' },
          actor,
        );

        expect(mockIpManagerRepo.save).toHaveBeenCalledWith(
          expect.objectContaining({ discountAmount: 1000 }),
        );
      });
    });

    // -----------------------------------------------------------------------
    // PROMOTION type
    // -----------------------------------------------------------------------
    describe('PROMOTION type', () => {
      it('calls promotionService.findByName with (dto.code, actor.organizationId)', async () => {
        const invoice = invoiceStub({ subtotal: 1000 });
        invoiceRepo.findOne
          .mockResolvedValueOnce(invoice)
          .mockResolvedValueOnce(invoice);
        invoicePromotionRepo.find.mockResolvedValue([]);
        const promo = promotionStub({ benefits: { discount_type: 'percentage', discount_value: 10 } });
        promotionService.findByName.mockResolvedValue(promo);
        mockIpManagerRepo.find.mockResolvedValue([{ discountAmount: 100 }]);

        await service.apply(
          'invoice-1',
          { type: InvoicePromotionType.PROMOTION, code: 'Summer Sale' },
          actor,
        );

        expect(promotionService.findByName).toHaveBeenCalledWith('Summer Sale', actor.organizationId);
      });
    });

    // -----------------------------------------------------------------------
    // Stacking check
    // -----------------------------------------------------------------------
    describe('stacking check', () => {
      it('throws BadRequestException when existing promotion has can_stack=false in conditions', async () => {
        const invoice = invoiceStub({ subtotal: 1000 });
        invoiceRepo.findOne.mockResolvedValueOnce(invoice);
        // Already has a non-stackable PROMOTION applied
        invoicePromotionRepo.find.mockResolvedValue([
          invoicePromotionStub({
            promotionType: InvoicePromotionType.PROMOTION,
            refId: 'promo-existing',
          }),
        ]);
        // The new discount code validates fine
        const dc = discountCodeStub({ discountType: DiscountType.PERCENTAGE, discountValue: 10 });
        discountCodeService.validate.mockResolvedValue(dc);
        // The existing promotion has can_stack=false in conditions
        promotionService.findOne.mockResolvedValue(
          promotionStub({ conditions: { can_stack: false } }),
        );

        await expect(
          service.apply(
            'invoice-1',
            { type: InvoicePromotionType.DISCOUNT_CODE, code: 'SAVE10' },
            actor,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('allows stacking when existing promotion has can_stack=true', async () => {
        const invoice = invoiceStub({ subtotal: 1000 });
        invoiceRepo.findOne
          .mockResolvedValueOnce(invoice)
          .mockResolvedValueOnce(invoice);
        // Already has a stackable PROMOTION applied
        invoicePromotionRepo.find.mockResolvedValue([
          invoicePromotionStub({
            promotionType: InvoicePromotionType.PROMOTION,
            refId: 'promo-existing',
            discountAmount: 50,
          }),
        ]);
        const dc = discountCodeStub({ discountType: DiscountType.PERCENTAGE, discountValue: 10 });
        discountCodeService.validate.mockResolvedValue(dc);
        // Existing promotion allows stacking
        promotionService.findOne.mockResolvedValue(
          promotionStub({ conditions: { can_stack: true } }),
        );
        mockIpManagerRepo.find.mockResolvedValue([
          { discountAmount: 50 },
          { discountAmount: 100 },
        ]);

        await expect(
          service.apply(
            'invoice-1',
            { type: InvoicePromotionType.DISCOUNT_CODE, code: 'SAVE10' },
            actor,
          ),
        ).resolves.not.toThrow();
      });
    });
  });

  // =========================================================================
  // remove
  // =========================================================================
  describe('remove', () => {
    it('throws NotFoundException when invoice not found', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);

      await expect(
        service.remove('missing-invoice', 'ip-1', actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when invoice.isDraft=false', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub({ isDraft: false }));

      await expect(
        service.remove('invoice-1', 'ip-1', actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('deletes InvoicePromotionEntity and recalculates invoice discountAmount from remaining promotions', async () => {
      const invoice = invoiceStub({ subtotal: 1000, discountAmount: 150, depositAmount: 0 });
      invoiceRepo.findOne.mockResolvedValue(invoice);
      // After deletion, 1 promotion remains with discountAmount=100
      mockIpManagerRepo.find.mockResolvedValue([{ discountAmount: 100 }]);

      await service.remove('invoice-1', 'ip-1', actor);

      expect(mockIpManagerRepo.delete).toHaveBeenCalledWith({
        id: 'ip-1',
        invoiceId: 'invoice-1',
      });
      expect(mockInvManagerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          discountAmount: 100,
          amountDue: 900,
        }),
      );
    });

    it('sets amountDue to 0 (not negative) when total discount exceeds subtotal', async () => {
      const invoice = invoiceStub({ subtotal: 100, discountAmount: 200, depositAmount: 0 });
      invoiceRepo.findOne.mockResolvedValue(invoice);
      // After deletion, remaining discount still exceeds subtotal
      mockIpManagerRepo.find.mockResolvedValue([{ discountAmount: 150 }]);

      await service.remove('invoice-1', 'ip-1', actor);

      expect(mockInvManagerRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          discountAmount: 150,
          amountDue: 0,
        }),
      );
    });
  });
});
