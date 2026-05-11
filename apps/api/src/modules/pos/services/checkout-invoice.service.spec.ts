import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CheckoutInvoiceService } from './checkout-invoice.service';
import { InvoiceEntity, InvoiceStatus } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { InvoiceDebtService } from './invoice-debt.service';
import { CheckoutInvoiceDto } from '../dto/checkout-invoice.dto';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { EventPublisher } from '../../events/event-publisher.service';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { PromotionApplyService } from '../../promotion/promotion-apply.service';
import { StockDeductionPublisher } from '../../inventory/publishers/stock-deduction.publisher';
import { LoyaltyPointsPublisher } from '../../customer/publishers/loyalty-points.publisher';
import { JournalSalePublisher } from '../../accounting/publishers/journal-sale.publisher';
import { CashFromPaymentPublisher } from '../../accounting/publishers/cash-from-payment.publisher';
import { PosSessionEntity } from '../entities/pos-session.entity';

const actor = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
  permissions: [],
};

const CASH_ACCOUNT       = 'acct-cash-1';
const BANK_ACCOUNT       = 'acct-bank-1';
const REVENUE_ACCOUNT    = 'acct-rev-1';
const RECEIVABLE_ACCOUNT = 'acct-ar-1';

const cashPaymentDto = (overrides: Partial<CheckoutInvoiceDto> = {}): CheckoutInvoiceDto => ({
  payments: [{ paymentMethod: 'cash' as any, amount: 200, accountId: CASH_ACCOUNT }],
  revenueAccountId: REVENUE_ACCOUNT,
  ...overrides,
});

const invoiceStub = (overrides: Partial<InvoiceEntity> = {}): InvoiceEntity =>
  ({
    id: 'inv-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    createdBy: 'user-1',
    code: 'DRAFT-12345',
    sessionId: 'session-1',
    customerId: 'cust-1',
    isDraft: true,
    status: InvoiceStatus.DRAFT,
    subtotal: 200,
    discountAmount: 0,
    depositAmount: 0,
    amountDue: 200,
    totalPaid: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    staffId: 'user-1',
    ...overrides,
  }) as InvoiceEntity;

const invoiceItemStub = (overrides: Partial<InvoiceItemEntity> = {}): InvoiceItemEntity =>
  ({
    id: 'item-row-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    createdBy: 'user-1',
    invoiceId: 'inv-1',
    itemId: 'item-1',
    locationId: 'loc-1',
    itemCode: 'A',
    itemName: 'A Name',
    unit: 'pcs',
    quantity: 2,
    unitPrice: 100,
    unitPriceDefault: 100,
    costPrice: 60,
    lineDiscount: 0,
    lineTotal: 200,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as InvoiceItemEntity;

describe('CheckoutInvoiceService (event-driven)', () => {
  let service: CheckoutInvoiceService;
  let invoiceRepo: Record<string, jest.Mock>;
  let itemRepo: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;
  let invoiceDebtService: { createFromInvoice: jest.Mock };
  let documentNumberingService: { generate: jest.Mock };
  let eventPublisher: { publish: jest.Mock };
  let wsEmitter: { emitToBranch: jest.Mock };
  let promotionApplyService: { commitPromotions: jest.Mock };
  let stockDeductionPublisher: { publish: jest.Mock };
  let loyaltyPointsPublisher: { publish: jest.Mock };
  let journalSalePublisher: { publish: jest.Mock };
  let cashFromPaymentPublisher: { publish: jest.Mock };
  let sessionRepo: { findOne: jest.Mock };
  let mockManager: Record<string, jest.Mock>;

  beforeEach(async () => {
    let createCounter = 0;
    mockManager = {
      save:   jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      create: jest.fn().mockImplementation((_entity, data) => ({
        id: `generated-id-${++createCounter}`,
        ...data,
      })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    invoiceRepo  = { findOne: jest.fn().mockResolvedValue(invoiceStub()) };
    itemRepo     = { find: jest.fn().mockResolvedValue([invoiceItemStub()]) };
    dataSource   = { transaction: jest.fn().mockImplementation((cb) => cb(mockManager)) };

    invoiceDebtService       = { createFromInvoice: jest.fn().mockResolvedValue({ id: 'debt-1' }) };
    documentNumberingService = { generate: jest.fn().mockResolvedValue('INV-2605-00001') };
    eventPublisher           = { publish: jest.fn().mockResolvedValue(undefined) };
    wsEmitter                = { emitToBranch: jest.fn() };
    promotionApplyService    = { commitPromotions: jest.fn().mockResolvedValue(undefined) };
    stockDeductionPublisher  = { publish: jest.fn().mockResolvedValue(undefined) };
    loyaltyPointsPublisher   = { publish: jest.fn().mockResolvedValue(true) };
    journalSalePublisher     = { publish: jest.fn().mockResolvedValue(undefined) };
    cashFromPaymentPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    sessionRepo              = { findOne: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutInvoiceService,
        { provide: getRepositoryToken(InvoiceEntity),     useValue: invoiceRepo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
        { provide: getRepositoryToken(PosSessionEntity),  useValue: sessionRepo },
        { provide: DataSource,                            useValue: dataSource },
        { provide: InvoiceDebtService,                    useValue: invoiceDebtService },
        { provide: DocumentNumberingService,              useValue: documentNumberingService },
        { provide: EventPublisher,                        useValue: eventPublisher },
        { provide: WebSocketEmitterService,               useValue: wsEmitter },
        { provide: PromotionApplyService,                 useValue: promotionApplyService },
        { provide: StockDeductionPublisher,               useValue: stockDeductionPublisher },
        { provide: LoyaltyPointsPublisher,                useValue: loyaltyPointsPublisher },
        { provide: JournalSalePublisher,                  useValue: journalSalePublisher },
        { provide: CashFromPaymentPublisher,              useValue: cashFromPaymentPublisher },
      ],
    }).compile();

    service = module.get(CheckoutInvoiceService);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Validation
  // ═══════════════════════════════════════════════════════════════════════════
  describe('validation', () => {
    it('throws when invoice not found', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);
      await expect(service.checkout('inv-x', cashPaymentDto(), actor)).rejects.toThrow(BadRequestException);
    });

    it('throws when invoice is not a draft', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub({ isDraft: false }));
      await expect(service.checkout('inv-1', cashPaymentDto(), actor)).rejects.toThrow(BadRequestException);
    });

    it('throws when invoice has no items', async () => {
      itemRepo.find.mockResolvedValue([]);
      await expect(service.checkout('inv-1', cashPaymentDto(), actor)).rejects.toThrow(/no items/);
    });

    it('throws when totalPaid > amountDue (overpayment)', async () => {
      const dto = cashPaymentDto({
        payments: [{ paymentMethod: 'cash' as any, amount: 999, accountId: CASH_ACCOUNT }],
      });
      await expect(service.checkout('inv-1', dto, actor)).rejects.toThrow(/exceed/);
    });

    it('throws when remainder > 0 but no receivableAccountId', async () => {
      const dto = cashPaymentDto({
        payments: [{ paymentMethod: 'cash' as any, amount: 100, accountId: CASH_ACCOUNT }],
      });
      await expect(service.checkout('inv-1', dto, actor)).rejects.toThrow(/receivableAccountId/);
    });

    it('throws when remainder > 0 but invoice has no customerId', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub({ customerId: undefined }));
      const dto = cashPaymentDto({
        payments: [{ paymentMethod: 'cash' as any, amount: 100, accountId: CASH_ACCOUNT }],
        receivableAccountId: RECEIVABLE_ACCOUNT,
      });
      await expect(service.checkout('inv-1', dto, actor)).rejects.toThrow(/customer/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Full CASH payment
  // ═══════════════════════════════════════════════════════════════════════════
  describe('full CASH payment', () => {
    it('sets status=PAID, isDraft=false, uses generated code', async () => {
      const result = await service.checkout('inv-1', cashPaymentDto(), actor);
      expect(result.status).toBe(InvoiceStatus.PAID);
      expect(result.isDraft).toBe(false);
      expect(result.code).toBe('INV-2605-00001');
    });

    it('sets totalPaid = sum of payments', async () => {
      const result = await service.checkout('inv-1', cashPaymentDto(), actor);
      expect(result.totalPaid).toBe(200);
    });

    it('does NOT call invoiceDebtService.createFromInvoice', async () => {
      await service.checkout('inv-1', cashPaymentDto(), actor);
      expect(invoiceDebtService.createFromInvoice).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Partial DEBT
  // ═══════════════════════════════════════════════════════════════════════════
  describe('partial DEBT (totalPaid < amountDue)', () => {
    const partialDto = (): CheckoutInvoiceDto => ({
      payments: [{ paymentMethod: 'cash' as any, amount: 120, accountId: CASH_ACCOUNT }],
      revenueAccountId: REVENUE_ACCOUNT,
      receivableAccountId: RECEIVABLE_ACCOUNT,
    });

    it('sets status=PARTIAL_DEBT', async () => {
      const result = await service.checkout('inv-1', partialDto(), actor);
      expect(result.status).toBe(InvoiceStatus.PARTIAL_DEBT);
    });

    it('calls createFromInvoice with remainder amount (80)', async () => {
      await service.checkout('inv-1', partialDto(), actor);
      expect(invoiceDebtService.createFromInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ status: InvoiceStatus.PARTIAL_DEBT }),
        80,
        mockManager,
      );
    });

    it('publishes journal event with receivableAccountId and remainder', async () => {
      await service.checkout('inv-1', partialDto(), actor);
      expect(journalSalePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: 'inv-1',
          amountDue: 200,
          remainder: 80,
          receivableAccountId: RECEIVABLE_ACCOUNT,
          payments: [expect.objectContaining({ accountId: CASH_ACCOUNT, amount: 120 })],
        }),
        actor,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Full DEBT
  // ═══════════════════════════════════════════════════════════════════════════
  describe('full DEBT (no payments)', () => {
    const debtDto = (): CheckoutInvoiceDto => ({
      payments: [],
      revenueAccountId: REVENUE_ACCOUNT,
      receivableAccountId: RECEIVABLE_ACCOUNT,
    });

    it('sets status=DEBT', async () => {
      const result = await service.checkout('inv-1', debtDto(), actor);
      expect(result.status).toBe(InvoiceStatus.DEBT);
    });

    it('calls createFromInvoice with full amountDue (200)', async () => {
      await service.checkout('inv-1', debtDto(), actor);
      expect(invoiceDebtService.createFromInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ status: InvoiceStatus.DEBT }),
        200,
        mockManager,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Split payment
  // ═══════════════════════════════════════════════════════════════════════════
  describe('split payment CASH + BANK_TRANSFER', () => {
    const splitDto = (): CheckoutInvoiceDto => ({
      payments: [
        { paymentMethod: 'cash' as any,          amount: 100, accountId: CASH_ACCOUNT },
        { paymentMethod: 'bank_transfer' as any, amount: 100, accountId: BANK_ACCOUNT },
      ],
      revenueAccountId: REVENUE_ACCOUNT,
    });

    it('publishes journal with both payment accounts and revenue', async () => {
      await service.checkout('inv-1', splitDto(), actor);
      expect(journalSalePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          payments: expect.arrayContaining([
            expect.objectContaining({ accountId: CASH_ACCOUNT, amount: 100 }),
            expect.objectContaining({ accountId: BANK_ACCOUNT, amount: 100 }),
          ]),
          revenueAccountId: REVENUE_ACCOUNT,
        }),
        actor,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Event publishing
  // ═══════════════════════════════════════════════════════════════════════════
  describe('event publishing', () => {
    it('publishes stock deduction events for items with location', async () => {
      await service.checkout('inv-1', cashPaymentDto(), actor);
      expect(stockDeductionPublisher.publish).toHaveBeenCalledWith(
        'inv-1',
        [{ itemId: 'item-1', locationId: 'loc-1', quantity: 2 }],
        'branch-1',
        actor,
      );
    });

    it('skips stock deduction publish for items without locationId', async () => {
      itemRepo.find.mockResolvedValue([invoiceItemStub({ locationId: undefined })]);
      await service.checkout('inv-1', cashPaymentDto(), actor);
      expect(stockDeductionPublisher.publish).toHaveBeenCalledWith(
        'inv-1',
        [],
        'branch-1',
        actor,
      );
    });

    it('publishes loyalty points award event when customer present', async () => {
      await service.checkout('inv-1', cashPaymentDto(), actor);
      expect(loyaltyPointsPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId: 'inv-1', customerId: 'cust-1', subtotal: 200 }),
        actor,
      );
    });

    it('publishes journal sale event', async () => {
      await service.checkout('inv-1', cashPaymentDto(), actor);
      expect(journalSalePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId: 'inv-1', amountDue: 200, remainder: 0 }),
        actor,
      );
    });

    it('publishes SALE_POSTED Kafka event', async () => {
      await service.checkout('inv-1', cashPaymentDto(), actor);
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ eventType: 'SALE_POSTED' }),
        'inv-1',
      );
    });

    it('emits WebSocket POS_CHECKOUT_ACKNOWLEDGED to branch', async () => {
      await service.checkout('inv-1', cashPaymentDto(), actor);
      expect(wsEmitter.emitToBranch).toHaveBeenCalledWith(
        'branch-1',
        expect.objectContaining({ eventType: 'POS_CHECKOUT_ACKNOWLEDGED' }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Cash movement integration (TKT-058)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('cash movement integration', () => {
    const cardOnlyDto: CheckoutInvoiceDto = {
      payments: [{ paymentMethod: 'card' as any, amount: 200, accountId: BANK_ACCOUNT }],
      revenueAccountId: REVENUE_ACCOUNT,
    };

    it('publishes cash event for CASH payment using session cash_account', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        cashAccountId: 'register-1',
      });

      await service.checkout('inv-1', cashPaymentDto(), actor);

      expect(cashFromPaymentPublisher.publish).toHaveBeenCalledTimes(1);
      expect(cashFromPaymentPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: 'inv-1',
          invoiceCode: 'INV-2605-00001',
          sessionId: 'session-1',
          cashAccountId: 'register-1',
          contraAccountId: REVENUE_ACCOUNT,
          amount: 200,
        }),
        actor,
      );
    });

    it('falls back to payment.accountId when no active session', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await service.checkout('inv-1', cashPaymentDto(), actor);

      expect(cashFromPaymentPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: undefined,
          cashAccountId: CASH_ACCOUNT,
        }),
        actor,
      );
    });

    it('does NOT publish cash event for CARD-only payment', async () => {
      await service.checkout('inv-1', cardOnlyDto, actor);
      expect(cashFromPaymentPublisher.publish).not.toHaveBeenCalled();
    });

    it('publishes one event per CASH payment in a split payment', async () => {
      sessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        cashAccountId: 'register-1',
      });

      const splitDto: CheckoutInvoiceDto = {
        payments: [
          { paymentMethod: 'cash' as any, amount: 100, accountId: CASH_ACCOUNT },
          { paymentMethod: 'card' as any, amount: 50, accountId: BANK_ACCOUNT },
          { paymentMethod: 'cash' as any, amount: 50, accountId: CASH_ACCOUNT },
        ],
        revenueAccountId: REVENUE_ACCOUNT,
      };

      await service.checkout('inv-1', splitDto, actor);

      expect(cashFromPaymentPublisher.publish).toHaveBeenCalledTimes(2);
    });
  });
});
