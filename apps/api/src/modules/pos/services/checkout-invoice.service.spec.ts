import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CheckoutInvoiceService } from './checkout-invoice.service';
import { InvoiceEntity, InvoiceStatus } from '../entities/invoice.entity';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { InvoiceDebtService } from './invoice-debt.service';
import { CheckoutInvoiceDto } from '../dto/checkout-invoice.dto';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { StockLedgerService } from '../../inventory/ledger/stock-ledger.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { EventPublisher } from '../../events/event-publisher.service';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { PromotionApplyService } from '../../promotion/promotion-apply.service';

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

describe('CheckoutInvoiceService', () => {
  let service: CheckoutInvoiceService;
  let invoiceRepo: Record<string, jest.Mock>;
  let itemRepo: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;
  let invoiceDebtService: { createFromInvoice: jest.Mock };
  let documentNumberingService: { generate: jest.Mock };
  let stockLedgerService: { getBalance: jest.Mock; recordBatchMovements: jest.Mock };
  let journalService: { post: jest.Mock };
  let eventPublisher: { publish: jest.Mock };
  let wsEmitter: { emitToBranch: jest.Mock };
  let promotionApplyService: { commitPromotions: jest.Mock };
  let mockManager: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockManager = {
      save:   jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      create: jest.fn().mockImplementation((_entity, data) => ({ id: 'generated-id', ...data })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    invoiceRepo  = { findOne: jest.fn().mockResolvedValue(invoiceStub()) };
    itemRepo     = { find: jest.fn().mockResolvedValue([invoiceItemStub()]) };
    dataSource   = { transaction: jest.fn().mockImplementation((cb) => cb(mockManager)) };

    invoiceDebtService       = { createFromInvoice: jest.fn().mockResolvedValue({ id: 'debt-1' }) };
    documentNumberingService = { generate: jest.fn().mockResolvedValue('INV-2605-00001') };
    stockLedgerService       = {
      getBalance: jest.fn().mockResolvedValue({ quantity: 100 }),
      recordBatchMovements: jest.fn().mockResolvedValue([]),
    };
    journalService       = { post: jest.fn().mockResolvedValue({ id: 'journal-1' }) };
    eventPublisher       = { publish: jest.fn().mockResolvedValue(undefined) };
    wsEmitter            = { emitToBranch: jest.fn() };
    promotionApplyService = { commitPromotions: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutInvoiceService,
        { provide: getRepositoryToken(InvoiceEntity),     useValue: invoiceRepo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
        { provide: DataSource,                            useValue: dataSource },
        { provide: InvoiceDebtService,                    useValue: invoiceDebtService },
        { provide: DocumentNumberingService,              useValue: documentNumberingService },
        { provide: StockLedgerService,                    useValue: stockLedgerService },
        { provide: JournalService,                        useValue: journalService },
        { provide: EventPublisher,                        useValue: eventPublisher },
        { provide: WebSocketEmitterService,               useValue: wsEmitter },
        { provide: PromotionApplyService,                 useValue: promotionApplyService },
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

    it('throws when stock is insufficient', async () => {
      stockLedgerService.getBalance.mockResolvedValue({ quantity: 1 });
      await expect(service.checkout('inv-1', cashPaymentDto(), actor)).rejects.toThrow(/Insufficient stock/);
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
  // Split payment (CASH + BANK_TRANSFER)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('split payment CASH + BANK_TRANSFER', () => {
    const splitDto = (): CheckoutInvoiceDto => ({
      payments: [
        { paymentMethod: 'cash' as any,         amount: 100, accountId: CASH_ACCOUNT },
        { paymentMethod: 'bank_transfer' as any, amount: 100, accountId: BANK_ACCOUNT },
      ],
      revenueAccountId: REVENUE_ACCOUNT,
    });

    it('sets status=PAID when totalPaid = amountDue', async () => {
      const result = await service.checkout('inv-1', splitDto(), actor);
      expect(result.status).toBe(InvoiceStatus.PAID);
    });

    it('journal has 2 debit lines + 1 credit line', async () => {
      await service.checkout('inv-1', splitDto(), actor);
      expect(journalService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ accountId: CASH_ACCOUNT,    debitAmount: 100 }),
            expect.objectContaining({ accountId: BANK_ACCOUNT,    debitAmount: 100 }),
            expect.objectContaining({ accountId: REVENUE_ACCOUNT, creditAmount: 200 }),
          ]),
        }),
        expect.anything(),
      );
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

    it('journal has DR cash + DR receivable + CR revenue', async () => {
      await service.checkout('inv-1', partialDto(), actor);
      expect(journalService.post).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: expect.arrayContaining([
            expect.objectContaining({ accountId: CASH_ACCOUNT,       debitAmount: 120 }),
            expect.objectContaining({ accountId: RECEIVABLE_ACCOUNT, debitAmount: 80 }),
            expect.objectContaining({ accountId: REVENUE_ACCOUNT,    creditAmount: 200 }),
          ]),
        }),
        expect.anything(),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Full DEBT (payments = [])
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
  // Stock movement
  // ═══════════════════════════════════════════════════════════════════════════
  describe('stock movement', () => {
    it('calls recordBatchMovements with SALE_ISSUE and negative quantity', async () => {
      await service.checkout('inv-1', cashPaymentDto(), actor);
      expect(stockLedgerService.recordBatchMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            itemId: 'item-1',
            locationId: 'loc-1',
            quantity: -2,
            referenceType: 'INVOICE',
          }),
        ]),
      );
    });

    it('skips items without locationId', async () => {
      itemRepo.find.mockResolvedValue([invoiceItemStub({ locationId: undefined })]);
      await service.checkout('inv-1', cashPaymentDto(), actor);
      expect(stockLedgerService.recordBatchMovements).not.toHaveBeenCalled();
    });

    it('reverts invoice to DRAFT and throws when stock movement fails', async () => {
      stockLedgerService.recordBatchMovements.mockRejectedValue(new Error('stock error'));

      await expect(service.checkout('inv-1', cashPaymentDto(), actor)).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(dataSource.transaction).toHaveBeenCalledTimes(2);
      expect(mockManager.update).toHaveBeenCalledWith(
        InvoiceEntity,
        { id: 'inv-1' },
        expect.objectContaining({ isDraft: true, status: InvoiceStatus.DRAFT }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Journal
  // ═══════════════════════════════════════════════════════════════════════════
  describe('journal posting', () => {
    it('does NOT throw when journal posting fails (non-critical)', async () => {
      journalService.post.mockRejectedValue(new Error('journal error'));
      await expect(service.checkout('inv-1', cashPaymentDto(), actor)).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Events & WebSocket
  // ═══════════════════════════════════════════════════════════════════════════
  describe('events', () => {
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
});
