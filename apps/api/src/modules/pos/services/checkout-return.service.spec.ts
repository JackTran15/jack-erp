import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CheckoutReturnService } from './checkout-return.service';
import {
  InvoiceEntity,
  InvoicePaymentMethod,
  InvoiceStatus,
  InvoiceType,
  RefundMethod,
} from '../entities/invoice.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../entities/invoice-item.entity';
import {
  InvoiceDebtEntity,
  DebtStatus,
  DebtDocumentType,
} from '../entities/invoice-debt.entity';
import { PosSessionEntity } from '../entities/pos-session.entity';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { CustomerCreditService } from '../../customer/services/customer-credit.service';
import { MembershipCardService } from '../../customer/services/membership-card.service';
import { AccountResolverService } from '../../accounting/payment-accounts/account-resolver.service';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';
import { InvoiceDebtService } from './invoice-debt.service';
import { AccountingDefaultAccountRole } from '../../accounting/payment-accounts/enums';
import { ReturnPostedPublisher } from '../publishers/return-posted.publisher';
import { StockReturnInPublisher } from '../publishers/stock-return-in.publisher';
import { StockDeductionPublisher } from '../../inventory/publishers/stock-deduction.publisher';
import { CashRefundPublisher } from '../../accounting/publishers/cash-refund.publisher';
import { CashFromPaymentPublisher } from '../../accounting/publishers/cash-from-payment.publisher';
import { JournalReturnPublisher } from '../../accounting/publishers/journal-return.publisher';
import { LoyaltyPointsPublisher } from '../../customer/publishers/loyalty-points.publisher';
import { LoyaltyPointsReversePublisher } from '../../customer/publishers/loyalty-points-reverse.publisher';

const actor = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
  permissions: [],
};

const REVENUE_ACCOUNT = 'acct-rev-1';
const RECEIVABLE_ACCOUNT = 'acct-ar-1';
const CASH_FUND = 'cash-fund-1';

/** Draft RETURN of a 200 line (net = -200, refunded = 200). */
const returnDraftStub = (overrides: Partial<InvoiceEntity> = {}): InvoiceEntity =>
  ({
    id: 'ret-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    originalInvoiceId: 'orig-1',
    code: 'DRAFT-RET',
    sessionId: 'session-1',
    customerId: 'cust-1',
    isDraft: true,
    status: InvoiceStatus.DRAFT,
    type: InvoiceType.RETURN,
    subtotal: 200,
    amountDue: 200,
    totalPaid: 0,
    pointsRedeemed: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    staffId: 'user-1',
    ...overrides,
  }) as InvoiceEntity;

const originalStub = (status: InvoiceStatus): InvoiceEntity =>
  ({
    id: 'orig-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    code: 'INV-ORIG',
    customerId: 'cust-1',
    status,
    type: InvoiceType.SALE,
    subtotal: 500,
    pointsRedeemed: 0,
  }) as InvoiceEntity;

/** Single returned (IN) line, no originalInvoiceItemId → skips the qty guard. */
const inLineStub = (): InvoiceItemEntity =>
  ({
    id: 'item-row-1',
    organizationId: 'org-1',
    invoiceId: 'ret-1',
    itemId: 'item-1',
    locationId: 'loc-1',
    itemCode: 'A',
    itemName: 'A Name',
    unit: 'pcs',
    quantity: 2,
    unitPrice: 100,
    lineTotal: 200,
    direction: ItemDirection.IN,
    sortOrder: 0,
  }) as InvoiceItemEntity;

/** FE default: pay cash for a net refund (operator did NOT tick offset). */
const cashDto = () => ({
  refundMethod: RefundMethod.CASH,
  revenueAccountId: REVENUE_ACCOUNT,
});

/** Operator ticked "Tính vào công nợ" → FE sends OFFSET. */
const offsetDto = () => ({
  refundMethod: RefundMethod.OFFSET,
  revenueAccountId: REVENUE_ACCOUNT,
});

/** Draft EXCHANGE: return a 750k line, buy a 780k line → net = +30k (khách nợ thêm). */
const exchangeDraftStub = (
  overrides: Partial<InvoiceEntity> = {},
): InvoiceEntity =>
  ({
    id: 'exc-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    originalInvoiceId: undefined,
    code: 'DRAFT-EXC',
    sessionId: 'session-1',
    customerId: 'cust-1',
    isDraft: true,
    status: InvoiceStatus.DRAFT,
    type: InvoiceType.EXCHANGE,
    subtotal: 780000,
    amountDue: 0,
    totalPaid: 0,
    pointsRedeemed: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    staffId: 'user-1',
    ...overrides,
  }) as InvoiceEntity;

const exchangeItems = (): InvoiceItemEntity[] => [
  {
    id: 'exc-in',
    organizationId: 'org-1',
    invoiceId: 'exc-1',
    itemId: 'item-old',
    locationId: 'loc-1',
    itemCode: 'OLD',
    itemName: 'Old',
    unit: 'pcs',
    quantity: 1,
    unitPrice: 750000,
    lineTotal: 750000,
    direction: ItemDirection.IN,
    sortOrder: 0,
  } as InvoiceItemEntity,
  {
    id: 'exc-out',
    organizationId: 'org-1',
    invoiceId: 'exc-1',
    itemId: 'item-new',
    locationId: 'loc-1',
    itemCode: 'NEW',
    itemName: 'New',
    unit: 'pcs',
    quantity: 1,
    unitPrice: 780000,
    lineTotal: 780000,
    direction: ItemDirection.OUT,
    sortOrder: 1,
  } as InvoiceItemEntity,
];

/** net > 0 exchange checkout body (FE sends CASH for the top-up). */
const exchangeDto = (
  payments: Array<{ paymentMethod: InvoicePaymentMethod; amount: number }>,
) => ({
  refundMethod: RefundMethod.CASH,
  revenueAccountId: REVENUE_ACCOUNT,
  payments,
  creditDays: 30,
});

describe('CheckoutReturnService — debt offset routing', () => {
  let service: CheckoutReturnService;
  let invoiceRepo: { findOne: jest.Mock };
  let itemRepo: { find: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let mockManager: Record<string, jest.Mock>;
  let accountResolver: {
    resolveDefaultAccount: jest.Mock;
    resolvePaymentAccount: jest.Mock;
  };
  let cashFundResolver: { resolveBranchCashFund: jest.Mock };
  let journalReturnPublisher: { publish: jest.Mock };
  let cashRefundPublisher: { publish: jest.Mock };
  let loyaltyReversePublisher: { publish: jest.Mock };
  let debtRepo: { findOne: jest.Mock };
  let invoiceDebtService: { createFromInvoice: jest.Mock };
  let debtRow: Partial<InvoiceDebtEntity>;

  beforeEach(async () => {
    debtRow = {
      id: 'debt-1',
      invoiceId: 'orig-1',
      organizationId: 'org-1',
      originalAmount: 500,
      paidAmount: 0,
      remainingAmount: 500,
      status: DebtStatus.OPEN,
    };

    mockManager = {
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      create: jest.fn().mockImplementation((_e, data) => ({ id: 'gen-1', ...data })),
      // offsetOriginalDebt looks up the original invoice's debt row.
      findOne: jest.fn().mockResolvedValue(debtRow),
      // Atomic returned_quantity guard (unused here — IN line has no originalInvoiceItemId).
      query: jest.fn().mockResolvedValue([undefined, 1]),
    };

    invoiceRepo = {
      findOne: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          where.id === 'ret-1' ? returnDraftStub() : null,
        ),
      ),
    };
    itemRepo = { find: jest.fn().mockResolvedValue([inLineStub()]) };
    dataSource = { transaction: jest.fn().mockImplementation((cb) => cb(mockManager)) };

    accountResolver = {
      resolveDefaultAccount: jest.fn().mockResolvedValue(RECEIVABLE_ACCOUNT),
      resolvePaymentAccount: jest.fn(),
    };
    cashFundResolver = {
      resolveBranchCashFund: jest.fn().mockResolvedValue(CASH_FUND),
    };
    journalReturnPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    cashRefundPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    loyaltyReversePublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    // Up-front debt lookup (only queried when the operator opts into OFFSET).
    debtRepo = { findOne: jest.fn().mockResolvedValue(debtRow) };
    invoiceDebtService = {
      createFromInvoice: jest.fn().mockResolvedValue({ id: 'debt-new' }),
    };

    const noop = { publish: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutReturnService,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
        { provide: getRepositoryToken(PosSessionEntity), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(InvoiceDebtEntity), useValue: debtRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: DocumentNumberingService, useValue: { generate: jest.fn().mockResolvedValue('RET-0001') } },
        { provide: WebSocketEmitterService, useValue: { emitToBranch: jest.fn() } },
        { provide: CustomerCreditService, useValue: { issue: jest.fn() } },
        { provide: AccountResolverService, useValue: accountResolver },
        { provide: CashFundResolverService, useValue: cashFundResolver },
        { provide: InvoiceDebtService, useValue: invoiceDebtService },
        { provide: ReturnPostedPublisher, useValue: noop },
        { provide: StockReturnInPublisher, useValue: noop },
        { provide: StockDeductionPublisher, useValue: noop },
        { provide: CashRefundPublisher, useValue: cashRefundPublisher },
        { provide: CashFromPaymentPublisher, useValue: noop },
        { provide: JournalReturnPublisher, useValue: journalReturnPublisher },
        { provide: LoyaltyPointsPublisher, useValue: noop },
        { provide: LoyaltyPointsReversePublisher, useValue: loyaltyReversePublisher },
        { provide: MembershipCardService, useValue: { refundRedeemedPoints: jest.fn() } },
      ],
    }).compile();

    service = module.get(CheckoutReturnService);
  });

  it('does NOT offset debt when the operator chose CASH, even against a DEBT invoice', async () => {
    invoiceRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'ret-1'
          ? returnDraftStub()
          : originalStub(InvoiceStatus.DEBT),
      ),
    );

    await service.checkout('ret-1', cashDto(), actor);

    // No debt is looked up or settled — the customer is paid cash instead.
    expect(debtRepo.findOne).not.toHaveBeenCalled();
    expect(mockManager.findOne).not.toHaveBeenCalled();
    expect(accountResolver.resolveDefaultAccount).not.toHaveBeenCalled();
    expect(cashRefundPublisher.publish).toHaveBeenCalled();
    expect(journalReturnPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ refundMethod: RefundMethod.CASH }),
      actor,
    );
  });

  it('offsets the original invoice debt when the operator chose OFFSET and debt exists', async () => {
    invoiceRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'ret-1'
          ? returnDraftStub()
          : originalStub(InvoiceStatus.DEBT),
      ),
    );
    debtRepo.findOne.mockResolvedValue(debtRow);

    await service.checkout('ret-1', offsetDto(), actor);

    // Receivable account resolved server-side (FE never supplies it).
    expect(accountResolver.resolveDefaultAccount).toHaveBeenCalledWith(
      AccountingDefaultAccountRole.RECEIVABLE,
      actor,
    );
    // Debt row settled by the refunded amount: 500 - 200 = 300 remaining.
    expect(mockManager.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'debt-1', paidAmount: 200, remainingAmount: 300 }),
    );
    expect(journalReturnPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        refundMethod: RefundMethod.OFFSET,
        receivableAccountId: RECEIVABLE_ACCOUNT,
      }),
      actor,
    );
    expect(cashRefundPublisher.publish).not.toHaveBeenCalled();
  });

  it('records the return as its own adjustment debt row when offsetting', async () => {
    invoiceRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'ret-1'
          ? returnDraftStub()
          : originalStub(InvoiceStatus.DEBT),
      ),
    );
    debtRepo.findOne.mockResolvedValue(debtRow);

    await service.checkout('ret-1', offsetDto(), actor);

    // A second invoice_debts row is created for the RETURN invoice so it is
    // visible/clickable in the customer's Công nợ tab (keyed on the return id).
    expect(mockManager.create).toHaveBeenCalledWith(
      InvoiceDebtEntity,
      expect.objectContaining({
        documentType: DebtDocumentType.ADJUSTMENT,
        invoiceId: 'ret-1',
        referenceCode: 'RET-0001',
        customerId: 'cust-1',
        originalAmount: -200,
        paidAmount: 0,
        remainingAmount: 0,
        status: DebtStatus.PAID,
      }),
    );
    expect(mockManager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: DebtDocumentType.ADJUSTMENT,
        invoiceId: 'ret-1',
      }),
    );
  });

  it('falls back to CASH when the operator chose OFFSET but there is no debt to settle', async () => {
    invoiceRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'ret-1'
          ? returnDraftStub()
          : originalStub(InvoiceStatus.PAID),
      ),
    );
    debtRepo.findOne.mockResolvedValue(null); // no outstanding debt

    await service.checkout('ret-1', offsetDto(), actor);

    // Offset opt-in, but nothing to offset → cash refund, no debt settlement,
    // and no adjustment row (nothing was applied to any debt).
    expect(mockManager.findOne).not.toHaveBeenCalled();
    expect(mockManager.create).not.toHaveBeenCalled();
    expect(accountResolver.resolveDefaultAccount).not.toHaveBeenCalled();
    expect(cashRefundPublisher.publish).toHaveBeenCalled();
    expect(journalReturnPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ refundMethod: RefundMethod.CASH }),
      actor,
    );
  });

  describe('EXCHANGE net > 0 → "tính vào công nợ"', () => {
    beforeEach(() => {
      invoiceRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'exc-1' ? exchangeDraftStub() : null),
      );
      itemRepo.find.mockResolvedValue(exchangeItems());
      accountResolver.resolvePaymentAccount.mockResolvedValue('pay-acct-1');
    });

    it('books the full difference as customer debt when no payment is tendered', async () => {
      const result = await service.checkout('exc-1', exchangeDto([]), actor);

      expect(result.status).toBe(InvoiceStatus.DEBT);
      expect(result.totalPaid).toBe(0);
      // AR resolved server-side; debt row created for the full 30k.
      expect(accountResolver.resolveDefaultAccount).toHaveBeenCalledWith(
        AccountingDefaultAccountRole.RECEIVABLE,
        actor,
      );
      expect(invoiceDebtService.createFromInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'exc-1' }),
        30000,
        mockManager,
        expect.objectContaining({ creditDays: 30 }),
      );
      expect(journalReturnPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          debtAmount: 30000,
          receivableAccountId: RECEIVABLE_ACCOUNT,
        }),
        actor,
      );
      expect(cashRefundPublisher.publish).not.toHaveBeenCalled();
    });

    it('books only the unpaid remainder as debt on a partial cash top-up', async () => {
      const result = await service.checkout(
        'exc-1',
        exchangeDto([{ paymentMethod: InvoicePaymentMethod.CASH, amount: 20000 }]),
        actor,
      );

      expect(result.status).toBe(InvoiceStatus.PARTIAL_DEBT);
      expect(result.totalPaid).toBe(20000);
      expect(invoiceDebtService.createFromInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'exc-1' }),
        10000,
        mockManager,
        expect.objectContaining({ creditDays: 30 }),
      );
      expect(journalReturnPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ debtAmount: 10000 }),
        actor,
      );
    });

    it('creates no debt when the difference is paid in full', async () => {
      const result = await service.checkout(
        'exc-1',
        exchangeDto([{ paymentMethod: InvoicePaymentMethod.CASH, amount: 30000 }]),
        actor,
      );

      expect(result.status).toBe(InvoiceStatus.PAID);
      expect(invoiceDebtService.createFromInvoice).not.toHaveBeenCalled();
      expect(accountResolver.resolveDefaultAccount).not.toHaveBeenCalled();
      expect(journalReturnPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ debtAmount: 0 }),
        actor,
      );
    });

    it('rejects an overpayment above netAmount', async () => {
      await expect(
        service.checkout(
          'exc-1',
          exchangeDto([{ paymentMethod: InvoicePaymentMethod.CASH, amount: 40000 }]),
          actor,
        ),
      ).rejects.toThrow(/vượt netAmount/);
      expect(invoiceDebtService.createFromInvoice).not.toHaveBeenCalled();
    });

    it('rejects a debt exchange with no customer on the invoice', async () => {
      invoiceRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(
          where.id === 'exc-1'
            ? exchangeDraftStub({ customerId: undefined })
            : null,
        ),
      );

      await expect(
        service.checkout('exc-1', exchangeDto([]), actor),
      ).rejects.toThrow(/customerId/);
      expect(invoiceDebtService.createFromInvoice).not.toHaveBeenCalled();
    });
  });

  describe('EXCHANGE net === 0 → đổi hàng ngang giá', () => {
    // Return a 780k line, buy a 780k line → net = 0, refundedAmount = 0.
    const equalExchangeItems = (): InvoiceItemEntity[] => [
      {
        ...exchangeItems()[0],
        unitPrice: 780000,
        lineTotal: 780000,
      } as InvoiceItemEntity,
      exchangeItems()[1],
    ];

    beforeEach(() => {
      invoiceRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'exc-1' ? exchangeDraftStub() : null),
      );
      itemRepo.find.mockResolvedValue(equalExchangeItems());
    });

    it('checks out an equal-value swap (FE sends OFFSET) with no money movement', async () => {
      const result = await service.checkout('exc-1', offsetDto(), actor);

      expect(result.status).toBe(InvoiceStatus.PAID);
      expect(result.netAmount).toBe(0);
      expect(result.refundedAmount).toBe(0);
      expect(result.totalPaid).toBe(0);
      // No refund, no debt, no store credit — refundMethod is a no-op here.
      expect(cashRefundPublisher.publish).not.toHaveBeenCalled();
      expect(invoiceDebtService.createFromInvoice).not.toHaveBeenCalled();
      expect(journalReturnPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ refundedAmount: 0, netAmount: 0, debtAmount: 0 }),
        actor,
      );
    });

    it('rejects payments when netAmount === 0', async () => {
      await expect(
        service.checkout(
          'exc-1',
          {
            ...offsetDto(),
            payments: [
              { paymentMethod: InvoicePaymentMethod.CASH, amount: 10000 },
            ],
          },
          actor,
        ),
      ).rejects.toThrow(/payments không được cung cấp khi netAmount = 0/);
    });
  });

  describe('loyalty reverse on RETURN — symmetric with amountDue earn base', () => {
    it('reverses proportional to the original invoice amountDue, not gross subtotal', async () => {
      invoiceRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(
          where.id === 'ret-1'
            ? returnDraftStub()
            : ({
                ...originalStub(InvoiceStatus.PAID),
                subtotal: 200,
                amountDue: 190,
              } as InvoiceEntity),
        ),
      );

      await service.checkout('ret-1', cashDto(), actor);

      // Full return of a 200 line; the original earned on its amountDue (190,
      // after a 10 point-discount), so the reverse base is 190 — proportional,
      // not the gross 200. Keeps reverse ≤ points actually earned.
      expect(loyaltyReversePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ returnInvoiceId: 'ret-1', subtotalDelta: 190 }),
        actor,
      );
    });
  });
});
