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
import { TempWarehouseFulfillPublisher } from '../../inventory/publishers/temp-warehouse-fulfill.publisher';
import { LoyaltyPointsPublisher } from '../../customer/publishers/loyalty-points.publisher';
import { JournalSalePublisher } from '../../accounting/publishers/journal-sale.publisher';
import { CashFromPaymentPublisher } from '../../accounting/publishers/cash-from-payment.publisher';
import { AccountResolverService } from '../../accounting/payment-accounts/account-resolver.service';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';
import { MembershipCardService } from '../../customer/services/membership-card.service';
import {
  AccountingDefaultAccountRole,
  PaymentAccountMethod,
} from '../../accounting/payment-accounts/enums';
import { PosSessionEntity } from '../entities/pos-session.entity';

const actor = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
  permissions: [],
};

// Accounts the resolver returns (server-side config). Client never supplies these.
const CASH_ACCOUNT       = 'acct-cash-1';
const CASH_FUND          = 'cash-fund-1';
const BANK_ACCOUNT       = 'acct-bank-1';
const REVENUE_ACCOUNT    = 'acct-rev-1';
const RECEIVABLE_ACCOUNT = 'acct-ar-1';

const cashPaymentDto = (overrides: Partial<CheckoutInvoiceDto> = {}): CheckoutInvoiceDto => ({
  payments: [{ paymentMethod: 'cash' as any, amount: 200 }],
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
  let tempWarehouseFulfillPublisher: { publish: jest.Mock };
  let loyaltyPointsPublisher: { publish: jest.Mock };
  let journalSalePublisher: { publish: jest.Mock };
  let cashFromPaymentPublisher: { publish: jest.Mock };
  let cashFundResolver: { resolveBranchCashFund: jest.Mock };
  let membershipCardService: { redeemPointsForInvoice: jest.Mock };
  let accountResolver: {
    resolveDefaultAccount: jest.Mock;
    resolvePaymentAccount: jest.Mock;
  };
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
    tempWarehouseFulfillPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    loyaltyPointsPublisher   = { publish: jest.fn().mockResolvedValue(true) };
    journalSalePublisher     = { publish: jest.fn().mockResolvedValue(undefined) };
    cashFromPaymentPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    cashFundResolver = {
      resolveBranchCashFund: jest.fn().mockResolvedValue(CASH_FUND),
    };
    accountResolver = {
      resolveDefaultAccount: jest.fn().mockImplementation((role) =>
        Promise.resolve(
          role === AccountingDefaultAccountRole.RECEIVABLE
            ? RECEIVABLE_ACCOUNT
            : REVENUE_ACCOUNT,
        ),
      ),
      resolvePaymentAccount: jest.fn().mockImplementation((method) =>
        Promise.resolve(
          method === PaymentAccountMethod.CASH ? CASH_ACCOUNT : BANK_ACCOUNT,
        ),
      ),
    };
    sessionRepo              = { findOne: jest.fn().mockResolvedValue(null) };
    membershipCardService    = { redeemPointsForInvoice: jest.fn().mockResolvedValue(undefined) };

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
        { provide: TempWarehouseFulfillPublisher,         useValue: tempWarehouseFulfillPublisher },
        { provide: LoyaltyPointsPublisher,                useValue: loyaltyPointsPublisher },
        { provide: JournalSalePublisher,                  useValue: journalSalePublisher },
        { provide: CashFromPaymentPublisher,              useValue: cashFromPaymentPublisher },
        { provide: AccountResolverService,                useValue: accountResolver },
        { provide: CashFundResolverService,               useValue: cashFundResolver },
        { provide: MembershipCardService,                 useValue: membershipCardService },
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
        payments: [{ paymentMethod: 'cash' as any, amount: 999 }],
      });
      await expect(service.checkout('inv-1', dto, actor)).rejects.toThrow(/exceed/);
    });

    it('resolves the receivable account server-side when remainder > 0', async () => {
      const dto = cashPaymentDto({
        payments: [{ paymentMethod: 'cash' as any, amount: 100 }],
      });
      await service.checkout('inv-1', dto, actor);
      expect(accountResolver.resolveDefaultAccount).toHaveBeenCalledWith(
        AccountingDefaultAccountRole.RECEIVABLE,
        actor,
      );
    });

    it('throws when the receivable default account is not configured', async () => {
      accountResolver.resolveDefaultAccount.mockImplementation((role) =>
        role === AccountingDefaultAccountRole.RECEIVABLE
          ? Promise.reject(new BadRequestException('No default RECEIVABLE account configured'))
          : Promise.resolve(REVENUE_ACCOUNT),
      );
      const dto = cashPaymentDto({
        payments: [{ paymentMethod: 'cash' as any, amount: 100 }],
      });
      await expect(service.checkout('inv-1', dto, actor)).rejects.toThrow(/RECEIVABLE/);
    });

    it('throws when remainder > 0 but invoice has no customerId', async () => {
      invoiceRepo.findOne.mockResolvedValue(invoiceStub({ customerId: undefined }));
      const dto = cashPaymentDto({
        payments: [{ paymentMethod: 'cash' as any, amount: 100 }],
      });
      await expect(service.checkout('inv-1', dto, actor)).rejects.toThrow(/customer/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Server-side account resolution
  // ═══════════════════════════════════════════════════════════════════════════
  describe('server-side account resolution', () => {
    it('forwards the selected paymentAccountId and posts the resolved COA account', async () => {
      const dto = cashPaymentDto({
        payments: [
          { paymentMethod: 'cash' as any, amount: 200, paymentAccountId: 'pa-cash-1' },
        ],
      });

      await service.checkout('inv-1', dto, actor);

      expect(accountResolver.resolveDefaultAccount).toHaveBeenCalledWith(
        AccountingDefaultAccountRole.REVENUE,
        actor,
      );
      // Resolver decides the COA account; the client only references the mapping id.
      expect(accountResolver.resolvePaymentAccount).toHaveBeenCalledWith(
        PaymentAccountMethod.CASH,
        actor,
        'pa-cash-1',
      );
      expect(journalSalePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          revenueAccountId: REVENUE_ACCOUNT,
          payments: [expect.objectContaining({ accountId: CASH_ACCOUNT })],
        }),
        actor,
      );
    });

    it('resolves a repeated (method, paymentAccountId) only once', async () => {
      const dto = cashPaymentDto({
        payments: [
          { paymentMethod: 'cash' as any, amount: 100 },
          { paymentMethod: 'cash' as any, amount: 100 },
        ],
      });
      await service.checkout('inv-1', dto, actor);
      expect(accountResolver.resolvePaymentAccount).toHaveBeenCalledTimes(1);
    });

    it('resolves each distinct selected account independently', async () => {
      const dto = cashPaymentDto({
        payments: [
          { paymentMethod: 'bank_transfer' as any, amount: 100, paymentAccountId: 'pa-vcb' },
          { paymentMethod: 'bank_transfer' as any, amount: 100, paymentAccountId: 'pa-tcb' },
        ],
      });
      await service.checkout('inv-1', dto, actor);
      expect(accountResolver.resolvePaymentAccount).toHaveBeenCalledTimes(2);
      expect(accountResolver.resolvePaymentAccount).toHaveBeenCalledWith(
        PaymentAccountMethod.BANK_TRANSFER,
        actor,
        'pa-vcb',
      );
      expect(accountResolver.resolvePaymentAccount).toHaveBeenCalledWith(
        PaymentAccountMethod.BANK_TRANSFER,
        actor,
        'pa-tcb',
      );
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
      payments: [{ paymentMethod: 'cash' as any, amount: 120 }],
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
        { dueDate: undefined, creditDays: undefined },
      );
    });

    it('passes dueDate + creditDays through to createFromInvoice', async () => {
      await service.checkout(
        'inv-1',
        { ...partialDto(), dueDate: '2999-12-31', creditDays: 9 },
        actor,
      );
      expect(invoiceDebtService.createFromInvoice).toHaveBeenCalledWith(
        expect.anything(),
        80,
        mockManager,
        { dueDate: '2999-12-31', creditDays: 9 },
      );
    });

    it('publishes journal event with resolved receivableAccountId and remainder', async () => {
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
        { dueDate: undefined, creditDays: undefined },
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Split payment
  // ═══════════════════════════════════════════════════════════════════════════
  describe('split payment CASH + BANK_TRANSFER', () => {
    const splitDto = (): CheckoutInvoiceDto => ({
      payments: [
        { paymentMethod: 'cash' as any,          amount: 100 },
        { paymentMethod: 'bank_transfer' as any, amount: 100 },
      ],
    });

    it('publishes journal with both resolved payment accounts and revenue', async () => {
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

    it('throws when any item is missing a locationId', async () => {
      itemRepo.find.mockResolvedValue([invoiceItemStub({ locationId: undefined })]);
      await expect(service.checkout('inv-1', cashPaymentDto(), actor)).rejects.toThrow(
        /without an assigned location/,
      );
      expect(stockDeductionPublisher.publish).not.toHaveBeenCalled();
    });

    it('publishes one temp-warehouse fulfill event with item-aggregated lines + the invoice code', async () => {
      itemRepo.find.mockResolvedValue([
        invoiceItemStub({ id: 'row-1', itemId: 'item-1', quantity: 2 }),
        invoiceItemStub({ id: 'row-2', itemId: 'item-1', quantity: 3 }),
        invoiceItemStub({ id: 'row-3', itemId: 'item-2', quantity: 1 }),
      ]);

      await service.checkout('inv-1', cashPaymentDto(), actor);

      expect(tempWarehouseFulfillPublisher.publish).toHaveBeenCalledTimes(1);
      expect(tempWarehouseFulfillPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          branchId: 'branch-1',
          invoiceId: 'inv-1',
          invoiceNumber: 'INV-2605-00001',
          lines: expect.arrayContaining([
            { itemId: 'item-1', quantity: 5 },
            { itemId: 'item-2', quantity: 1 },
          ]),
        }),
      );
      // exactly the two aggregated items, no per-row duplication.
      expect(
        tempWarehouseFulfillPublisher.publish.mock.calls[0][0].lines,
      ).toHaveLength(2);
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
  // Loyalty point redemption (synchronous, in-transaction)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('loyalty point redemption', () => {
    it('deducts redeemed points in-transaction and reduces amountDue', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        invoiceStub({ pointsRedeemed: 30, pointsDiscountAmount: 30 }),
      );

      const result = await service.checkout(
        'inv-1',
        { payments: [{ paymentMethod: 'cash' as any, amount: 170 }] },
        actor,
      );

      // 200 subtotal − 30 point discount = 170 due.
      expect(result.amountDue).toBe(170);
      expect(result.status).toBe(InvoiceStatus.PAID);
      expect(membershipCardService.redeemPointsForInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-1', points: 30, invoiceId: 'inv-1' }),
        mockManager,
        actor,
      );
      // Revenue posts the net (discounted) amount — no separate discount GL line.
      expect(journalSalePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ amountDue: 170 }),
        actor,
      );
    });

    it('does not redeem points when pointsRedeemed = 0', async () => {
      await service.checkout('inv-1', cashPaymentDto(), actor);
      expect(membershipCardService.redeemPointsForInvoice).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Cash movement integration (TKT-058)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('cash movement integration', () => {
    const cardOnlyDto: CheckoutInvoiceDto = {
      payments: [{ paymentMethod: 'card' as any, amount: 200 }],
    };

    it('publishes cash event for CASH payment using the branch cash fund', async () => {
      await service.checkout('inv-1', cashPaymentDto(), actor);

      expect(cashFromPaymentPublisher.publish).toHaveBeenCalledTimes(1);
      expect(cashFundResolver.resolveBranchCashFund).toHaveBeenCalledWith(
        actor.organizationId,
        'branch-1',
      );
      expect(cashFromPaymentPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: 'inv-1',
          invoiceCode: 'INV-2605-00001',
          sessionId: undefined,
          cashAccountId: CASH_FUND,
          contraAccountId: REVENUE_ACCOUNT,
          amount: 200,
        }),
        actor,
      );
    });

    it('resolves the branch fund regardless of POS session (no session dependency)', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await service.checkout('inv-1', cashPaymentDto(), actor);

      expect(cashFromPaymentPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: undefined,
          cashAccountId: CASH_FUND,
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
          { paymentMethod: 'cash' as any, amount: 100 },
          { paymentMethod: 'card' as any, amount: 50 },
          { paymentMethod: 'cash' as any, amount: 50 },
        ],
      };

      await service.checkout('inv-1', splitDto, actor);

      expect(cashFromPaymentPublisher.publish).toHaveBeenCalledTimes(2);
    });
  });
});
