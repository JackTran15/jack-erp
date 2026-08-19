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
import { TempWarehouseFulfillPublisher } from '../../inventory/publishers/temp-warehouse-fulfill.publisher';
import { CashRefundPublisher } from '../../accounting/publishers/cash-refund.publisher';
import { DepositRefundPublisher } from '../../accounting/publishers/deposit-refund.publisher';
import { CashFromPaymentPublisher } from '../../accounting/publishers/cash-from-payment.publisher';
import { JournalReturnPublisher } from '../../accounting/publishers/journal-return.publisher';
import { LoyaltyPointsPublisher } from '../../customer/publishers/loyalty-points.publisher';
import { LoyaltyPointsReversePublisher } from '../../customer/publishers/loyalty-points-reverse.publisher';
import { POINT_EARN_VND_PER_POINT } from '../../customer/loyalty.constants';

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

/**
 * The original sale a return is taken against.
 *
 * `pointsEarned` is derived from the effective `amountDue` rather than defaulted,
 * because the return path now caps its reversal at this column (ADR-02) — a fixture
 * that leaves it unset describes an invoice that earned nothing, and every cap
 * would bind to 0. That is not hypothetical: it is exactly the shape of the 27 real
 * rows `BackfillInvoicePointsEarnedFromLedger1789000000000` had to repair.
 *
 * Pass overrides here rather than spreading afterwards, so the derivation sees the
 * final `amountDue`. Set `pointsEarned` explicitly to model a sale whose accrual a
 * promotion blocked.
 */
const originalStub = (
  status: InvoiceStatus,
  overrides: Partial<InvoiceEntity> = {},
): InvoiceEntity => {
  const base = {
    id: 'orig-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    code: 'INV-ORIG',
    customerId: 'cust-1',
    status,
    type: InvoiceType.SALE,
    subtotal: 500,
    pointsRedeemed: 0,
    ...overrides,
  };
  return {
    ...base,
    pointsEarned:
      overrides.pointsEarned ??
      Math.floor(Number(base.amountDue ?? 0) / POINT_EARN_VND_PER_POINT),
  } as InvoiceEntity;
};

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

/** Operator chose a bank/card fund for the refund → FE sends BANK + payment_accounts.id. */
const bankDto = () => ({
  refundMethod: RefundMethod.BANK,
  revenueAccountId: REVENUE_ACCOUNT,
  refundAccountId: 'pay-acct-bank',
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
    resolvePaymentAccountById: jest.Mock;
  };
  let cashFundResolver: { resolveBranchCashFund: jest.Mock };
  let journalReturnPublisher: { publish: jest.Mock };
  let cashRefundPublisher: { publish: jest.Mock };
  let depositRefundPublisher: { publish: jest.Mock };
  let loyaltyReversePublisher: { publish: jest.Mock };
  let loyaltyAwardPublisher: { publish: jest.Mock };
  let membershipCardService: {
    refundRedeemedPoints: jest.Mock;
    getPointBalanceForUpdate: jest.Mock;
  };
  let debtRepo: { findOne: jest.Mock };
  let invoiceDebtService: { createFromInvoice: jest.Mock };
  let debtRow: Partial<InvoiceDebtEntity>;
  // Own mocks (not the shared `noop`) so a test can tell the two stock legs
  // apart — an EXCHANGE must fire both, a plain RETURN only the return-in one.
  let stockReturnInPublisher: { publish: jest.Mock };
  let stockDeductionPublisher: { publish: jest.Mock };
  let tempWarehouseFulfillPublisher: { publish: jest.Mock };

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
      // lockOriginalDebt reads the original invoice's debt row FOR UPDATE. Default
      // fixture is a sale with nothing outstanding — tests that exercise the split
      // opt in by resolving `debtRow` from BOTH this and `debtRepo.findOne`.
      findOne: jest.fn().mockResolvedValue(null),
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
      // Revenue is resolved server-side in fanOutEvents (every checkout); AR only
      // when an OFFSET / exchange-debt leg needs it.
      resolveDefaultAccount: jest.fn().mockImplementation((role) =>
        Promise.resolve(
          role === AccountingDefaultAccountRole.REVENUE
            ? REVENUE_ACCOUNT
            : RECEIVABLE_ACCOUNT,
        ),
      ),
      resolvePaymentAccount: jest.fn(),
      resolvePaymentAccountById: jest.fn().mockResolvedValue({
        accountId: 'coa-112',
        depositAccountId: 'deposit-1',
        paymentMethod: 'bank_transfer',
      }),
    };
    cashFundResolver = {
      resolveBranchCashFund: jest.fn().mockResolvedValue(CASH_FUND),
    };
    journalReturnPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    cashRefundPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    depositRefundPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    loyaltyReversePublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    loyaltyAwardPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    membershipCardService = {
      refundRedeemedPoints: jest.fn().mockResolvedValue(undefined),
      getPointBalanceForUpdate: jest.fn().mockResolvedValue(null),
    };
    // Up-front (unlocked) debt pre-read, used to decide which accounts to resolve
    // before the transaction. Null = the original sale carries no open debt.
    debtRepo = { findOne: jest.fn().mockResolvedValue(null) };
    invoiceDebtService = {
      createFromInvoice: jest.fn().mockResolvedValue({ id: 'debt-new' }),
    };

    stockReturnInPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    stockDeductionPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    tempWarehouseFulfillPublisher = { publish: jest.fn().mockResolvedValue(undefined) };

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
        { provide: StockReturnInPublisher, useValue: stockReturnInPublisher },
        { provide: StockDeductionPublisher, useValue: stockDeductionPublisher },
        { provide: TempWarehouseFulfillPublisher, useValue: tempWarehouseFulfillPublisher },
        { provide: CashRefundPublisher, useValue: cashRefundPublisher },
        { provide: DepositRefundPublisher, useValue: depositRefundPublisher },
        { provide: CashFromPaymentPublisher, useValue: noop },
        { provide: JournalReturnPublisher, useValue: journalReturnPublisher },
        { provide: LoyaltyPointsPublisher, useValue: loyaltyAwardPublisher },
        { provide: LoyaltyPointsReversePublisher, useValue: loyaltyReversePublisher },
        { provide: MembershipCardService, useValue: membershipCardService },
      ],
    }).compile();

    service = module.get(CheckoutReturnService);
  });

  /**
   * Wires a return against a real original invoice: `itemRepo.find` answers
   * per invoiceId so the returned lines and the original's lines are distinct
   * (the shared default mock returns the same array for both).
   *
   * Hoisted to the outer scope in T-01-01 — the money block and the loyalty
   * basis block both need it. Pure move, no behaviour change.
   */
  function setupReturn(opts: {
    original: Partial<InvoiceEntity>;
    originalLines: Array<Partial<InvoiceItemEntity>>;
    returnedLines: Array<Partial<InvoiceItemEntity>>;
  }) {
    const originalLines = opts.originalLines.map(
      (l, i) =>
        ({
          id: `orig-line-${i}`,
          organizationId: 'org-1',
          invoiceId: 'orig-1',
          itemId: `item-${i}`,
          locationId: 'loc-1',
          itemCode: `C${i}`,
          itemName: `N${i}`,
          unit: 'pcs',
          direction: ItemDirection.OUT,
          promotionDiscount: 0,
          sortOrder: i,
          ...l,
        }) as InvoiceItemEntity,
    );
    const returnedLines = opts.returnedLines.map(
      (l, i) =>
        ({
          id: `ret-line-${i}`,
          organizationId: 'org-1',
          invoiceId: 'ret-1',
          itemId: `item-${i}`,
          locationId: 'loc-1',
          itemCode: `C${i}`,
          itemName: `N${i}`,
          unit: 'pcs',
          direction: ItemDirection.IN,
          sortOrder: i,
          ...l,
        }) as InvoiceItemEntity,
    );

    itemRepo.find.mockImplementation(({ where }: any) =>
      Promise.resolve(where.invoiceId === 'orig-1' ? originalLines : returnedLines),
    );
    invoiceRepo.findOne.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.id === 'ret-1'
          ? returnDraftStub()
          : (originalStub(InvoiceStatus.PAID, {
              pointsDiscountAmount: 0,
              depositAmount: 0,
              discountAmount: 0,
              ...opts.original,
              }) as InvoiceEntity),
      ),
    );
  }

  const refundedAmount = () =>
    cashRefundPublisher.publish.mock.calls[0][0].amount as number;

  /**
   * The invoice handed to `manager.save` — `save` also takes payment and debt
   * rows, so pick the call carrying the loyalty snapshot rather than call [0].
   */
  const savedInvoice = () =>
    mockManager.save.mock.calls
      .map((c) => c[0])
      .find(
        (e) => e && typeof e === 'object' && 'pointsReversed' in e,
      ) as InvoiceEntity;

  /** Both reads (unlocked pre-read + locked read) see the same outstanding debt. */
  const withOpenDebt = (row: Partial<InvoiceDebtEntity> = debtRow) => {
    debtRepo.findOne.mockResolvedValue(row);
    mockManager.findOne.mockResolvedValue(row);
  };

  it('offsets an open debt even when the operator chose CASH (QA #8)', async () => {
    invoiceRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'ret-1'
          ? returnDraftStub()
          : originalStub(InvoiceStatus.DEBT),
      ),
    );
    withOpenDebt();

    await service.checkout('ret-1', cashDto(), actor);

    // The debt is the first charge on the refund — the operator no longer has to
    // ask for it, and cannot decline it. Refund 200 against 500 outstanding.
    expect(mockManager.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'debt-1', paidAmount: 200, remainingAmount: 300 }),
    );
    expect(savedInvoice().offsetAmount).toBe(200);
    // Nothing left over, so no cash leaves the till.
    expect(cashRefundPublisher.publish).not.toHaveBeenCalled();
  });

  it('splits the refund: debt first, the rest in cash (AC-01)', async () => {
    invoiceRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'ret-1'
          ? returnDraftStub()
          : originalStub(InvoiceStatus.PARTIAL_DEBT),
      ),
    );
    // Customer owes 120 of the 200 being refunded — 80 was money they handed over.
    withOpenDebt({ ...debtRow, originalAmount: 120, remainingAmount: 120 });

    await service.checkout('ret-1', cashDto(), actor);

    expect(mockManager.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'debt-1', paidAmount: 120, remainingAmount: 0 }),
    );
    const inv = savedInvoice();
    expect(inv.offsetAmount).toBe(120);
    expect(Number(inv.refundedAmount)).toBe(200);
  });

  it('resolves the receivable account when part of the refund settles debt', async () => {
    invoiceRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'ret-1'
          ? returnDraftStub()
          : originalStub(InvoiceStatus.DEBT),
      ),
    );
    withOpenDebt();

    await service.checkout('ret-1', cashDto(), actor);

    // Receivable account resolved server-side (FE never supplies it).
    expect(accountResolver.resolveDefaultAccount).toHaveBeenCalledWith(
      AccountingDefaultAccountRole.RECEIVABLE,
      actor,
    );
    expect(journalReturnPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        receivableAccountId: RECEIVABLE_ACCOUNT,
      }),
      actor,
    );
  });

  it('treats a legacy OFFSET refundMethod as CASH and still splits (backward compat)', async () => {
    invoiceRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'ret-1'
          ? returnDraftStub()
          : originalStub(InvoiceStatus.DEBT),
      ),
    );
    withOpenDebt();

    await service.checkout('ret-1', offsetDto(), actor);

    expect(savedInvoice().refundMethod).toBe(RefundMethod.CASH);
    expect(savedInvoice().offsetAmount).toBe(200);
    expect(journalReturnPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ refundMethod: RefundMethod.CASH }),
      actor,
    );
  });

  it('records the return as its own adjustment debt row when offsetting', async () => {
    invoiceRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'ret-1'
          ? returnDraftStub()
          : originalStub(InvoiceStatus.DEBT),
      ),
    );
    withOpenDebt();

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

  it('pays the whole refund in cash when there is no debt to settle', async () => {
    invoiceRepo.findOne.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'ret-1'
          ? returnDraftStub()
          : originalStub(InvoiceStatus.PAID),
      ),
    );
    debtRepo.findOne.mockResolvedValue(null); // no outstanding debt

    await service.checkout('ret-1', offsetDto(), actor);

    // Nothing to offset → full cash refund, no debt settlement, and no adjustment
    // row. This is the case a `total_paid`-based cap would have paid 0 for.
    expect(savedInvoice().offsetAmount).toBe(0);
    expect(mockManager.create).not.toHaveBeenCalled();
    expect(accountResolver.resolveDefaultAccount).not.toHaveBeenCalledWith(
      AccountingDefaultAccountRole.RECEIVABLE,
      actor,
    );
    expect(cashRefundPublisher.publish).toHaveBeenCalled();
    expect(journalReturnPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ refundMethod: RefundMethod.CASH }),
      actor,
    );
  });

  describe('BANK refund → quỹ tiền gửi', () => {
    it('publishes a deposit refund (not cash) on the fund resolved from the chosen payment account', async () => {
      await service.checkout('ret-1', bankDto(), actor);

      expect(accountResolver.resolvePaymentAccountById).toHaveBeenCalledWith(
        'pay-acct-bank',
        actor,
      );
      expect(depositRefundPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          depositAccountId: 'deposit-1',
          contraAccountId: REVENUE_ACCOUNT,
          amount: 200,
        }),
        actor,
      );
      expect(cashRefundPublisher.publish).not.toHaveBeenCalled();
      expect(journalReturnPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ refundMethod: RefundMethod.BANK }),
        actor,
      );
    });

    it('rejects a BANK refund without refundAccountId', async () => {
      await expect(
        service.checkout(
          'ret-1',
          { refundMethod: RefundMethod.BANK, revenueAccountId: REVENUE_ACCOUNT },
          actor,
        ),
      ).rejects.toThrow(/refundAccountId/);
      expect(depositRefundPublisher.publish).not.toHaveBeenCalled();
    });

    it('rejects a BANK refund whose payment account has no linked deposit fund', async () => {
      accountResolver.resolvePaymentAccountById.mockResolvedValue({
        accountId: 'coa-x',
        depositAccountId: undefined,
        paymentMethod: 'bank_transfer',
      });

      await expect(
        service.checkout('ret-1', bankDto(), actor),
      ).rejects.toThrow(/quỹ tiền gửi/);
      expect(depositRefundPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('EXCHANGE net > 0 → "tính vào công nợ"', () => {
    beforeEach(() => {
      invoiceRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'exc-1' ? exchangeDraftStub() : null),
      );
      itemRepo.find.mockResolvedValue(exchangeItems());
      accountResolver.resolvePaymentAccount.mockResolvedValue({
        accountId: 'pay-acct-1',
        depositAccountId: undefined,
      });
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
      expect(accountResolver.resolveDefaultAccount).not.toHaveBeenCalledWith(
      AccountingDefaultAccountRole.RECEIVABLE,
      actor,
    );
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

  /**
   * "Đổi trả nhanh": an EXCHANGE with no `originalInvoiceId` and no
   * `originalInvoiceItemId` on any IN line. `CheckoutReturnService` is not
   * modified for this — these tests lock in that it was already correct, so a
   * later refactor of the 900-line service cannot break the quick flow silently.
   */
  describe('EXCHANGE without an original invoice (đổi trả nhanh)', () => {
    /** Return a 500k line, buy a 300k line → net = −200k, refunded = 200k. */
    const quickRefundItems = (): InvoiceItemEntity[] => [
      { ...exchangeItems()[0], unitPrice: 500000, lineTotal: 500000 } as InvoiceItemEntity,
      { ...exchangeItems()[1], unitPrice: 300000, lineTotal: 300000 } as InvoiceItemEntity,
    ];

    const quickDraft = (overrides: Partial<InvoiceEntity> = {}) =>
      exchangeDraftStub({ originalInvoiceId: undefined, ...overrides });

    beforeEach(() => {
      invoiceRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'exc-1' ? quickDraft() : null),
      );
      itemRepo.find.mockResolvedValue(quickRefundItems());
      accountResolver.resolvePaymentAccount.mockResolvedValue({
        accountId: 'pay-acct-1',
        depositAccountId: undefined,
      });
    });

    it('never looks up the original invoice — there is none', async () => {
      await service.checkout('exc-1', cashDto(), actor);

      expect(invoiceRepo.findOne).toHaveBeenCalledTimes(1);
      expect(invoiceRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'exc-1' }) }),
      );
    });

    it('never touches returned_quantity — no original sale line to charge it against', async () => {
      await service.checkout('exc-1', cashDto(), actor);

      const updatedReturnedQty = mockManager.query.mock.calls.some(
        ([sql]: [string]) => /returned_quantity/.test(sql),
      );
      expect(updatedReturnedQty).toBe(false);
    });

    it('net < 0 refunds the difference in cash and fires both stock legs', async () => {
      const result = await service.checkout('exc-1', cashDto(), actor);

      expect(result.netAmount).toBe(-200000);
      expect(result.refundedAmount).toBe(200000);
      expect(result.status).toBe(InvoiceStatus.PAID);
      expect(cashRefundPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 200000, cashAccountId: CASH_FUND }),
        actor,
      );
      // The returned goods come back in AND the newly bought goods go out.
      expect(stockReturnInPublisher.publish).toHaveBeenCalled();
      expect(stockDeductionPublisher.publish).toHaveBeenCalled();
    });

    it('net > 0 records the top-up as payment, not as the full new-goods value', async () => {
      itemRepo.find.mockResolvedValue(exchangeItems()); // 750k in / 780k out → +30k

      const result = await service.checkout(
        'exc-1',
        exchangeDto([{ paymentMethod: InvoicePaymentMethod.CASH, amount: 30000 }]),
        actor,
      );

      expect(result.netAmount).toBe(30000);
      expect(result.status).toBe(InvoiceStatus.PAID);
      // The cashier collected 30k, not the 780k the new item is worth — that
      // gross-in/gross-out behaviour is exactly what merging the two documents
      // removed.
      expect(result.totalPaid).toBe(30000);
      expect(invoiceDebtService.createFromInvoice).not.toHaveBeenCalled();
    });

    it('net = 0 moves no money at all', async () => {
      itemRepo.find.mockResolvedValue([
        { ...exchangeItems()[0], unitPrice: 780000, lineTotal: 780000 } as InvoiceItemEntity,
        exchangeItems()[1],
      ]);

      const result = await service.checkout('exc-1', offsetDto(), actor);

      expect(result.netAmount).toBe(0);
      expect(result.refundedAmount).toBe(0);
      expect(cashRefundPublisher.publish).not.toHaveBeenCalled();
      expect(invoiceDebtService.createFromInvoice).not.toHaveBeenCalled();
      expect(stockReturnInPublisher.publish).toHaveBeenCalled();
      expect(stockDeductionPublisher.publish).toHaveBeenCalled();
    });

    it('books the journal entry as an EXCHANGE, same as an invoice-backed one', async () => {
      await service.checkout('exc-1', cashDto(), actor);

      expect(journalReturnPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'EXCHANGE' }),
        actor,
      );
    });

    it('degrades an OFFSET refund to CASH — there is no original debt to settle', async () => {
      const result = await service.checkout('exc-1', offsetDto(), actor);

      expect(result.refundMethod).toBe(RefundMethod.CASH);
      expect(cashRefundPublisher.publish).toHaveBeenCalled();
    });
  });

  /**
   * The temp-warehouse leg (UOW-01). A sale is two beats: deduct from the
   * showroom, then pull the staged unit warehouse -> showroom to cover it. The
   * exchange path fired only the first, so a "Mua thêm" line on an item sitting
   * in the temp warehouse drove the showroom balance negative (production, MT 211
   * Lê Duẩn, YMT25017-D-38, 2026-08-19). These tests are what stops a later
   * refactor of fanOutEvents from dropping the second beat again.
   */
  describe('temp-warehouse fulfillment on EXCHANGE (UOW-01)', () => {
    const draft = () => exchangeDraftStub({ originalInvoiceId: undefined });

    /** Return 3.000k, buy 500k → net < 0, so the plain cash-refund path runs. */
    const refundingExchangeItems = (): InvoiceItemEntity[] => [
      { ...exchangeItems()[0], unitPrice: 3000000, lineTotal: 3000000 } as InvoiceItemEntity,
      { ...exchangeItems()[1], unitPrice: 500000, lineTotal: 500000 } as InvoiceItemEntity,
    ];

    beforeEach(() => {
      invoiceRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'exc-1' ? draft() : null),
      );
      itemRepo.find.mockResolvedValue(refundingExchangeItems());
      accountResolver.resolvePaymentAccount.mockResolvedValue({
        accountId: 'pay-acct-1',
        depositAccountId: undefined,
      });
    });

    it('publishes the fulfill event for the OUT leg, keyed on the exchange invoice', async () => {
      await service.checkout('exc-1', cashDto(), actor);

      expect(tempWarehouseFulfillPublisher.publish).toHaveBeenCalledTimes(1);
      expect(tempWarehouseFulfillPublisher.publish).toHaveBeenCalledWith({
        organizationId: 'org-1',
        branchId: 'branch-1',
        invoiceId: 'exc-1',
        // Its OWN document number, not the original sale's — dedupe in
        // processed_events is keyed on this invoice id.
        invoiceNumber: 'RET-0001',
        actor: {
          userId: 'user-1',
          organizationId: 'org-1',
          branchId: 'branch-1',
          roles: [],
        },
        lines: [{ itemId: 'item-new', quantity: 1 }],
      });
    });

    it('sends a positive quantity — direction, not sign, separates the legs', async () => {
      await service.checkout('exc-1', cashDto(), actor);

      const [payload] = tempWarehouseFulfillPublisher.publish.mock.calls[0];
      for (const line of payload.lines) {
        expect(line.quantity).toBeGreaterThan(0);
      }
    });

    it('aggregates OUT lines per item and never lets an IN line into the payload', async () => {
      itemRepo.find.mockResolvedValue([
        // Returned: same item id as the two bought lines below.
        {
          ...exchangeItems()[0],
          id: 'exc-in-same',
          itemId: 'item-x',
          quantity: 1,
          unitPrice: 3000000,
          lineTotal: 3000000,
        } as InvoiceItemEntity,
        {
          ...exchangeItems()[1],
          id: 'exc-out-a',
          itemId: 'item-x',
          quantity: 1,
          unitPrice: 500000,
          lineTotal: 500000,
        } as InvoiceItemEntity,
        {
          ...exchangeItems()[1],
          id: 'exc-out-b',
          itemId: 'item-x',
          quantity: 2,
          unitPrice: 500000,
          lineTotal: 1000000,
          sortOrder: 2,
        } as InvoiceItemEntity,
      ]);

      await service.checkout('exc-1', cashDto(), actor);

      const [payload] = tempWarehouseFulfillPublisher.publish.mock.calls[0];
      // 1 + 2 from the OUT lines. The IN line's own 1 is NOT netted off:
      // gross, per ADR-01, exactly like every other sale path.
      expect(payload.lines).toEqual([{ itemId: 'item-x', quantity: 3 }]);
    });

    it('publishes nothing for a plain RETURN — no OUT leg to cover', async () => {
      invoiceRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'ret-1' ? returnDraftStub() : null),
      );
      itemRepo.find.mockResolvedValue([inLineStub()]);

      await service.checkout('ret-1', cashDto(), actor);

      expect(tempWarehouseFulfillPublisher.publish).not.toHaveBeenCalled();
      // The returned goods still go back into the showroom, untouched by this change.
      expect(stockReturnInPublisher.publish).toHaveBeenCalled();
    });

    it('leaves the return-in leg alone on an exchange', async () => {
      await service.checkout('exc-1', cashDto(), actor);

      expect(stockReturnInPublisher.publish).toHaveBeenCalled();
      expect(stockDeductionPublisher.publish).toHaveBeenCalled();
    });
  });

  /**
   * The counterpart of the block above: when the IN line DOES point at an
   * original sale line, the atomic quantity guard must still run. This is the
   * regression the quick flow must not have loosened.
   */
  describe('returned_quantity guard on invoice-backed returns', () => {
    const backedInLine = (): InvoiceItemEntity =>
      ({ ...inLineStub(), originalInvoiceItemId: 'orig-item-1' }) as InvoiceItemEntity;

    beforeEach(() => {
      itemRepo.find.mockResolvedValue([backedInLine()]);
      invoiceRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(
          where.id === 'ret-1' ? returnDraftStub() : originalStub(InvoiceStatus.PAID),
        ),
      );
    });

    it('increments returned_quantity on the original sale line by the returned qty', async () => {
      await service.checkout('ret-1', cashDto(), actor);

      const call = mockManager.query.mock.calls.find(([sql]: [string]) =>
        /returned_quantity/.test(sql),
      );
      expect(call).toBeDefined();
      expect(call![1]).toEqual([2, 'orig-item-1']);
    });

    it('rejects the checkout when the guarded UPDATE matches no row (over-return)', async () => {
      // `returned_quantity + qty <= quantity` failed → 0 rows affected.
      mockManager.query.mockResolvedValue([undefined, 0]);

      await expect(service.checkout('ret-1', cashDto(), actor)).rejects.toThrow(
        /Vượt số lượng có thể trả/,
      );
    });
  });

  describe('loyalty reverse on RETURN — symmetric with amountDue earn base', () => {
    it('reverses proportional to the original invoice amountDue, not gross subtotal', async () => {
      invoiceRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(
          where.id === 'ret-1'
            ? returnDraftStub()
            : (originalStub(InvoiceStatus.PAID, {
                subtotal: 200,
                // The 10 gap between subtotal and amountDue has to be attributable
                // to a discount field, or the invoice is not one the checkout paths
                // could ever have written: amountDue is computed as
                // subtotal − discountAmount − pointsDiscountAmount − depositAmount.
                // Verified against dev data — 39/39 posted sales satisfy it.
                discountAmount: 10,
                amountDue: 190,
                }) as InvoiceEntity),
        ),
      );

      await service.checkout('ret-1', cashDto(), actor);

      // Full return of a 200 line; the original earned on its amountDue (190,
      // after a 10 discount), so the reverse base is 190 — proportional,
      // not the gross 200. Keeps reverse ≤ points actually earned.
      expect(loyaltyReversePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ returnInvoiceId: 'ret-1', subtotalDelta: 190 }),
        actor,
      );
    });

    it('equal-value exchange (return A, re-buy A) awards on the new item AND reverses the returned one — balance unchanged', async () => {
      // One IN line (return A, 500) + one OUT line (re-buy A, 500) → netAmount = 0.
      itemRepo.find.mockResolvedValue([
        { ...inLineStub(), quantity: 1, unitPrice: 500, lineTotal: 500 } as InvoiceItemEntity,
        {
          id: 'exc-out',
          organizationId: 'org-1',
          invoiceId: 'exc-eq',
          itemId: 'item-new',
          locationId: 'loc-1',
          itemCode: 'A',
          itemName: 'A Name',
          unit: 'pcs',
          quantity: 1,
          unitPrice: 500,
          lineTotal: 500,
          direction: ItemDirection.OUT,
          sortOrder: 1,
        } as InvoiceItemEntity,
      ]);
      invoiceRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(
          where.id === 'exc-eq'
            ? exchangeDraftStub({
                id: 'exc-eq',
                originalInvoiceId: 'orig-1',
                subtotal: 500,
                amountDue: 0,
              })
            : (originalStub(InvoiceStatus.PAID, {
                subtotal: 500,
                amountDue: 500,
                }) as InvoiceEntity),
        ),
      );

      await service.checkout('exc-eq', cashDto(), actor);

      // AWARD on the newly purchased OUT line (500) — this is the earn that the
      // old net-based logic swallowed when netAmount was 0.
      expect(loyaltyAwardPublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId: 'exc-eq', subtotal: 500 }),
        actor,
      );
      // REVERSE the returned line's original earn (amountDue 500 × 500/500 = 500).
      expect(loyaltyReversePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ returnInvoiceId: 'exc-eq', subtotalDelta: 500 }),
        actor,
      );
    });

    it('snapshots pointsReversed on the invoice = floor(reverseBase / 10000)', async () => {
      // Full return of a 1.490.000đ line whose original earned floor(1490000/10000)=149.
      itemRepo.find.mockResolvedValue([
        {
          ...inLineStub(),
          quantity: 1,
          unitPrice: 1_490_000,
          lineTotal: 1_490_000,
        } as InvoiceItemEntity,
      ]);
      invoiceRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(
          where.id === 'ret-1'
            ? returnDraftStub({ subtotal: 1_490_000, amountDue: 1_490_000 })
            : (originalStub(InvoiceStatus.PAID, {
                subtotal: 1_490_000,
                amountDue: 1_490_000,
                }) as InvoiceEntity),
        ),
      );

      await service.checkout('ret-1', cashDto(), actor);

      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ pointsReversed: 149 }),
      );
    });

    /** Same 1.490.000đ full return as above → pointsReversed 149, pointsEarned 0. */
    const setupFullReturnOf149 = (originalOverrides: Partial<InvoiceEntity> = {}) => {
      itemRepo.find.mockResolvedValue([
        {
          ...inLineStub(),
          quantity: 1,
          unitPrice: 1_490_000,
          lineTotal: 1_490_000,
        } as InvoiceItemEntity,
      ]);
      invoiceRepo.findOne.mockImplementation(({ where }) =>
        Promise.resolve(
          where.id === 'ret-1'
            ? returnDraftStub({ subtotal: 1_490_000, amountDue: 1_490_000 })
            : (originalStub(InvoiceStatus.PAID, {
                subtotal: 1_490_000,
                amountDue: 1_490_000,
                ...originalOverrides,
                }) as InvoiceEntity),
        ),
      );
    };

    /**
     * QA #16's sibling on the return path, found during discovery rather than by QA.
     * A promotion with "Tích điểm cho khách hàng" unchecked leaves the original at
     * pointsEarned = 0, so returning it must claw back nothing — the money basis
     * alone would take floor(1.490.000 / 10.000) = 149 points that were never granted.
     */
    it('reverses nothing when the original sale earned nothing (blocked accrual)', async () => {
      setupFullReturnOf149({ pointsEarned: 0 });

      await service.checkout('ret-1', cashDto(), actor);

      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ pointsReversed: 0 }),
      );
      expect(loyaltyReversePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ points: 0 }),
        actor,
      );
    });

    it('caps a PARTIAL return of a blocked original at nothing too', async () => {
      // Guards the direction of the cap: written as Math.max instead of Math.min this
      // still returns 149 on a full return and would only be caught here.
      setupFullReturnOf149({ pointsEarned: 0, amountDue: 2_980_000, subtotal: 2_980_000 });

      await service.checkout('ret-1', cashDto(), actor);

      expect(loyaltyReversePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ points: 0 }),
        actor,
      );
    });

    it('still reverses the whole earn when an accruing original comes fully back', async () => {
      setupFullReturnOf149();

      await service.checkout('ret-1', cashDto(), actor);

      // The cap binds exactly and changes nothing: floor(1.490.000/10.000) = 149 = pointsEarned.
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ pointsReversed: 149 }),
      );
      expect(loyaltyReversePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ points: 149 }),
        actor,
      );
    });

    it('snapshots pointsBalanceAfter = balance + creditBack + earned − reversed', async () => {
      // Bản gốc đã đổi 10 điểm → trả toàn bộ hoàn lại đúng 10 điểm.
      setupFullReturnOf149({ pointsRedeemed: 10 });
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(300);

      await service.checkout('ret-1', cashDto(), actor);

      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ pointsBalanceAfter: 161 }), // 300 + 10 + 0 − 149
      );
    });

    it('clamps pointsBalanceAfter at 0 like the reverse consumer caps its decrement', async () => {
      setupFullReturnOf149();
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(10);

      await service.checkout('ret-1', cashDto(), actor);

      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ pointsBalanceAfter: 0 }),
      );
    });

    it('snapshots pointsBalanceAfter = null when the customer has no active card', async () => {
      setupFullReturnOf149();
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(null);

      await service.checkout('ret-1', cashDto(), actor);

      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ pointsBalanceAfter: null }),
      );
    });

    it('re-credits the points redeemed on the original sale, proportional to the return', async () => {
      setupFullReturnOf149({ pointsRedeemed: 10 });

      await service.checkout('ret-1', cashDto(), actor);

      expect(membershipCardService.refundRedeemedPoints).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-1', points: 10 }),
        expect.anything(),
        actor,
      );
    });
  });

  describe('refund is net of promotion and points (T-01-04, QA #1)', () => {
    it('refunds the line price minus its promotion — 500 with a 100 discount pays back 400 (AC-01)', async () => {
      setupReturn({
        original: { subtotal: 500, discountAmount: 100, amountDue: 400, totalPaid: 400 },
        originalLines: [{ quantity: 1, unitPrice: 500, lineTotal: 500, promotionDiscount: 100 }],
        returnedLines: [
          { quantity: 1, unitPrice: 500, lineTotal: 500, originalInvoiceItemId: 'orig-line-0' },
        ],
      });

      await service.checkout('ret-1', cashDto(), actor);

      expect(refundedAmount()).toBe(400);
    });

    it('refunds what the customer paid, not the gross — 1,430,000 with 201,000 off pays back 1,229,000 (AC-02)', async () => {
      setupReturn({
        original: {
          subtotal: 1_430_000,
          discountAmount: 201_000,
          amountDue: 1_229_000,
          totalPaid: 1_229_000,
        },
        originalLines: [
          { quantity: 1, unitPrice: 850_000, lineTotal: 850_000, promotionDiscount: 119_500 },
          { quantity: 1, unitPrice: 580_000, lineTotal: 580_000, promotionDiscount: 81_500 },
        ],
        returnedLines: [
          {
            quantity: 1,
            unitPrice: 850_000,
            lineTotal: 850_000,
            originalInvoiceItemId: 'orig-line-0',
          },
          {
            quantity: 1,
            unitPrice: 580_000,
            lineTotal: 580_000,
            originalInvoiceItemId: 'orig-line-1',
          },
        ],
      });

      await service.checkout('ret-1', cashDto(), actor);

      expect(refundedAmount()).toBe(1_229_000);
    });

    it('pays out no cash for the part settled with points — the 580,000 / 1000-point invoice (AC-03)', async () => {
      // Paid entirely with points: 580,000 − 500,000 points − 80,000 promo = 0 due.
      setupReturn({
        original: {
          subtotal: 580_000,
          discountAmount: 80_000,
          pointsDiscountAmount: 500_000,
          amountDue: 0,
          totalPaid: 0,
          pointsRedeemed: 1000,
        },
        originalLines: [
          { quantity: 1, unitPrice: 580_000, lineTotal: 580_000, promotionDiscount: 80_000 },
        ],
        returnedLines: [
          {
            quantity: 1,
            unitPrice: 580_000,
            lineTotal: 580_000,
            originalInvoiceItemId: 'orig-line-0',
          },
        ],
      });

      await service.checkout('ret-1', cashDto(), actor);

      // The whole invoice was settled with points, so no cash may leave the
      // till at all — before the fix this published a 580,000 withdrawal.
      expect(cashRefundPublisher.publish).not.toHaveBeenCalled();
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ refundedAmount: 0 }),
      );
      // The points themselves come back through the loyalty path, not the till.
      expect(membershipCardService.refundRedeemedPoints).toHaveBeenCalledWith(
        expect.objectContaining({ points: 1000 }),
        expect.anything(),
        actor,
      );
    });

    it.each([
      ['promotion only', { subtotal: 1000, discountAmount: 300, amountDue: 700 }, 300, 0],
      ['points only', { subtotal: 1000, pointsDiscountAmount: 250, amountDue: 750 }, 0, 0],
      ['deposit only', { subtotal: 1000, depositAmount: 400, amountDue: 600 }, 0, 400],
      [
        'promotion + points + deposit',
        { subtotal: 1000, discountAmount: 200, pointsDiscountAmount: 100, depositAmount: 50, amountDue: 650 },
        200,
        50,
      ],
      [
        'manual invoice discount not allocated to any line',
        { subtotal: 1000, discountAmount: 150, amountDue: 850 },
        0,
        0,
      ],
    ])(
      'a full return lands exactly on the original amountDue — %s',
      async (_label, original: any, linePromo: number, _deposit: number) => {
        setupReturn({
          original: { ...original, totalPaid: original.amountDue },
          originalLines: [
            { quantity: 1, unitPrice: 1000, lineTotal: 1000, promotionDiscount: linePromo },
          ],
          returnedLines: [
            {
              quantity: 1,
              unitPrice: 1000,
              lineTotal: 1000,
              originalInvoiceItemId: 'orig-line-0',
            },
          ],
        });

        await service.checkout('ret-1', cashDto(), actor);

        expect(refundedAmount()).toBe(original.amountDue);
      },
    );

    it('returning the undiscounted line of a mixed cart pays its full price, not a blended average', async () => {
      // This is the case a header-level proration gets wrong: it would refund
      // 800 × 500/1000 = 400 for a line the customer paid 500 for.
      setupReturn({
        original: { subtotal: 1000, discountAmount: 200, amountDue: 800, totalPaid: 800 },
        originalLines: [
          { quantity: 1, unitPrice: 500, lineTotal: 500, promotionDiscount: 0 },
          { quantity: 1, unitPrice: 500, lineTotal: 500, promotionDiscount: 200 },
        ],
        returnedLines: [
          { quantity: 1, unitPrice: 500, lineTotal: 500, originalInvoiceItemId: 'orig-line-0' },
        ],
      });

      await service.checkout('ret-1', cashDto(), actor);

      expect(refundedAmount()).toBe(500);
    });

    it('prorates a partial return of a multi-quantity line', async () => {
      setupReturn({
        original: { subtotal: 1000, discountAmount: 200, amountDue: 800, totalPaid: 800 },
        originalLines: [
          { quantity: 4, unitPrice: 250, lineTotal: 1000, promotionDiscount: 200 },
        ],
        returnedLines: [
          { quantity: 1, unitPrice: 250, lineTotal: 250, originalInvoiceItemId: 'orig-line-0' },
        ],
      });

      await service.checkout('ret-1', cashDto(), actor);

      expect(refundedAmount()).toBe(200); // (1000 − 200) × 1/4
    });

    it('falls back to the gross amount for a QUICK return with no original invoice (AC-05)', async () => {
      itemRepo.find.mockResolvedValue([inLineStub()]);
      invoiceRepo.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === 'ret-1'
            ? returnDraftStub({ originalInvoiceId: undefined })
            : null,
        ),
      );

      await service.checkout('ret-1', cashDto(), actor);

      expect(refundedAmount()).toBe(200); // the IN line's gross lineTotal
    });

    it('degrades to a plain amountDue proration for a v1 invoice with no per-line allocation (AC-05)', async () => {
      setupReturn({
        original: { subtotal: 1000, discountAmount: 200, amountDue: 800, totalPaid: 800 },
        // v1: promotionDiscount is 0 on every line, the discount lives only on the header.
        originalLines: [
          { quantity: 1, unitPrice: 600, lineTotal: 600, promotionDiscount: 0 },
          { quantity: 1, unitPrice: 400, lineTotal: 400, promotionDiscount: 0 },
        ],
        returnedLines: [
          { quantity: 1, unitPrice: 600, lineTotal: 600, originalInvoiceItemId: 'orig-line-0' },
        ],
      });

      await service.checkout('ret-1', cashDto(), actor);

      expect(refundedAmount()).toBe(480); // 600 − 200 × (600/1000)
    });

    it('gross and net bases agree on a full return — the case that hid the defect', async () => {
      setupReturn({
        original: { subtotal: 1000, discountAmount: 200, amountDue: 800, totalPaid: 800 },
        originalLines: [
          { quantity: 1, unitPrice: 1000, lineTotal: 1000, promotionDiscount: 200 },
        ],
        returnedLines: [
          {
            quantity: 1,
            unitPrice: 1000,
            lineTotal: 1000,
            originalInvoiceItemId: 'orig-line-0',
          },
        ],
      });

      await service.checkout('ret-1', cashDto(), actor);

      // The whole invoice comes back, so the returned ratio is 1 and both bases
      // land on 800: gross gives 800 × 1000/1000, net gives returnedNet =
      // 1000 − 200. Expectation deliberately unchanged by the net switch — this
      // is precisely the shape that kept the defect invisible, kept here as the
      // record of it.
      expect(loyaltyReversePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ subtotalDelta: 800 }),
        actor,
      );
    });
  });

  /**
   * Loyalty reverse base must be the NET the customer paid (UOW-01, QA #3).
   *
   * This defect does not show itself on most invoices, which is the trap worth
   * spelling out. A promotion spread EVENLY across every line makes the gross
   * ratio equal the net ratio; returning the WHOLE invoice makes the ratio 1.
   * Both are green before and after the fix, and every promoted invoice sitting
   * in the dev database (INV-202608-00006..11) is of the even kind — measuring
   * with one of those concludes "no bug" (A-R1).
   *
   * So the fixture below is deliberately UNEVEN: one promoted line next to one
   * plain line, and only the promoted line comes back.
   */
  /**
   * R1 — uneven promotion, only the promoted line comes back.
   *   line A: gross   490.000, promo 26.000 → net   464.000
   *   line B: gross 9.510.000, promo      0 → net 9.510.000
   *
   * subtotal 10.000.000 · discountAmount 26.000 · amountDue 9.974.000
   * pointsEarned = floor(9.974.000 / 10.000) = 997
   *
   * Shared by the reverse-base block and the credit-back block.
   */
  const setupR1ReturningThePromotedLineOnly = () =>
    setupReturn({
      original: {
        subtotal: 10_000_000,
        discountAmount: 26_000,
        amountDue: 9_974_000,
        totalPaid: 9_974_000,
      },
      originalLines: [
        { quantity: 1, unitPrice: 490_000, lineTotal: 490_000, promotionDiscount: 26_000 },
        { quantity: 1, unitPrice: 9_510_000, lineTotal: 9_510_000, promotionDiscount: 0 },
      ],
      returnedLines: [
        {
          quantity: 1,
          unitPrice: 490_000,
          lineTotal: 490_000,
          originalInvoiceItemId: 'orig-line-0',
        },
      ],
    });

  describe('loyalty reverse base is net of promotion (UOW-01, QA #3)', () => {
    it('claws back only the points the returned line itself earned (AC-01)', async () => {
      setupR1ReturningThePromotedLineOnly();

      await service.checkout('ret-1', cashDto(), actor);

      // The money side has been right since promotion-qa-defects/UOW-01. Pinned
      // here so that if this number ever moves, the failure points at
      // computeReturnedNet rather than at the loyalty path.
      expect(refundedAmount()).toBe(464_000);

      // Line A cost the customer 464.000 net, which earned floor(464.000/10.000)
      // = 46 points. The gross basis in force today instead yields 48:
      //   amountDue × returnSubtotal / subtotal
      //   = 9.974.000 × 490.000 / 10.000.000 = 488.726 → floor(48,87) = 48
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ pointsReversed: 46 }),
      );
    });

    it('reverses the whole earn when the whole invoice comes back (AC-03)', async () => {
      setupReturn({
        original: {
          subtotal: 10_000_000,
          discountAmount: 26_000,
          amountDue: 9_974_000,
          totalPaid: 9_974_000,
        },
        originalLines: [
          { quantity: 1, unitPrice: 490_000, lineTotal: 490_000, promotionDiscount: 26_000 },
          { quantity: 1, unitPrice: 9_510_000, lineTotal: 9_510_000, promotionDiscount: 0 },
        ],
        returnedLines: [
          {
            quantity: 1,
            unitPrice: 490_000,
            lineTotal: 490_000,
            originalInvoiceItemId: 'orig-line-0',
          },
          {
            quantity: 1,
            unitPrice: 9_510_000,
            lineTotal: 9_510_000,
            originalInvoiceItemId: 'orig-line-1',
          },
        ],
      });

      await service.checkout('ret-1', cashDto(), actor);

      // returnedNet lands exactly on amountDue, so the reverse lands exactly on
      // the earn: floor(9.974.000 / 10.000) = 997. This is the end-stop that
      // catches a wrong denominator — any basis that is not amountDue drifts here.
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ pointsReversed: 997 }),
      );
    });

    it('leaves the customer holding exactly the points the kept goods earned (AC-02)', async () => {
      setupR1ReturningThePromotedLineOnly();

      await service.checkout('ret-1', cashDto(), actor);

      const reversed = savedInvoice().pointsReversed as number;

      // The invariant worth protecting is NOT "the partial reverses sum to
      // points_earned" — every return floors independently, so Σfloor ≤ floor(Σ)
      // and a few points can go missing to rounding on either basis (ADR-03).
      //
      // What must hold is about the goods the customer KEPT: after handing line A
      // back, the points still standing against this invoice have to equal what
      // line B would have earned on its own. Written as an equation between the
      // two sides rather than a hard-coded 951, so it keeps meaning if the
      // fixture's numbers ever move.
      const R1_POINTS_EARNED = 997; // floor(9.974.000 / 10.000)
      const KEPT_LINE_NET = 9_510_000; // line B: gross 9.510.000, no promotion
      expect(R1_POINTS_EARNED - reversed).toBe(
        Math.floor(KEPT_LINE_NET / POINT_EARN_VND_PER_POINT),
      );

      // The gross basis left 997 − 48 = 949 here: two points short on goods the
      // customer never returned.
      expect(R1_POINTS_EARNED - reversed).toBe(951);
    });

    it('leaves a v1 invoice with no per-line allocation exactly where it was (AC-04)', async () => {
      // Every promotionDiscount is 0, so returnedNet degrades to the gross
      // proration and the net basis must reproduce the old number precisely.
      setupReturn({
        original: {
          subtotal: 10_000_000,
          discountAmount: 2_000_000,
          amountDue: 8_000_000,
          totalPaid: 8_000_000,
        },
        originalLines: [
          { quantity: 1, unitPrice: 6_000_000, lineTotal: 6_000_000, promotionDiscount: 0 },
          { quantity: 1, unitPrice: 4_000_000, lineTotal: 4_000_000, promotionDiscount: 0 },
        ],
        returnedLines: [
          {
            quantity: 1,
            unitPrice: 6_000_000,
            lineTotal: 6_000_000,
            originalInvoiceItemId: 'orig-line-0',
          },
        ],
      });

      await service.checkout('ret-1', cashDto(), actor);

      // Expectation computed by hand from the OLD gross formula, deliberately not
      // by calling the production helper — otherwise this compares the code to
      // itself and proves nothing:
      //   amountDue × returnSubtotal / subtotal = 8.000.000 × 6.000.000/10.000.000
      //                                         = 4.800.000 → floor(480) = 480
      expect(mockManager.save).toHaveBeenCalledWith(
        expect.objectContaining({ pointsReversed: 480 }),
      );
    });

    it('keeps the no-original fallback alive for QUICK returns — do not inline this branch (AC-05)', async () => {
      // A QUICK return has no original invoice, so there is nothing to prorate
      // against and computeReturnedNet degrades to the gross value. After the net
      // switch the with-original branch is a single assignment, which makes the
      // whole function look collapsible — it is not, and this test is the guard
      // (ADR-02, A-R2).
      itemRepo.find.mockResolvedValue([
        {
          ...inLineStub(),
          quantity: 1,
          unitPrice: 1_490_000,
          lineTotal: 1_490_000,
        } as InvoiceItemEntity,
      ]);
      invoiceRepo.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === 'ret-1'
            ? returnDraftStub({
                originalInvoiceId: undefined,
                subtotal: 1_490_000,
                amountDue: 1_490_000,
              })
            : null,
        ),
      );

      await service.checkout('ret-1', cashDto(), actor);

      const saved = savedInvoice();
      expect(Number.isFinite(saved.pointsReversed)).toBe(true);
      expect(Number.isNaN(saved.pointsReversed)).toBe(false);
      // Math.abs(refundedAmount || returnSubtotal) = 1.490.000 → floor(149).
      expect(saved.pointsReversed).toBe(149);
      // AC-09: a QUICK return has no original to read pointsEarned from, so the cap
      // has nothing to bind against and the money derivation stands uncapped.
      expect(loyaltyReversePublisher.publish).toHaveBeenCalledWith(
        expect.objectContaining({ points: 149 }),
        actor,
      );
    });

    it('snapshots and publishes the same reverse base, never two (AC-10)', async () => {
      setupR1ReturningThePromotedLineOnly();

      await service.checkout('ret-1', cashDto(), actor);

      const saved = savedInvoice();
      const published = loyaltyReversePublisher.publish.mock.calls[0][0] as {
        subtotalDelta: number;
      };

      // The receipt shows the snapshot while the card is decremented from the
      // event. If these ever drift, a customer complaint cannot be reconciled
      // without reading point_history by hand — so pin them to one base.
      expect(saved.pointsReversed).toBe(
        Math.floor(published.subtotalDelta / POINT_EARN_VND_PER_POINT),
      );
      expect(published.subtotalDelta).toBe(464_000);
      // AC-08 partial: below the original's pointsEarned, so the cap does not bind and
      // the number is byte-identical to what this file pinned before ADR-02.
      expect(
        (loyaltyReversePublisher.publish.mock.calls[0][0] as { points: number }).points,
      ).toBe(46);
      expect(saved.pointsReversed).toBe(46);
    });
  });

  /**
   * Points REDEEMED on the original sale, given back on the return (UOW-02, QA #3).
   *
   * Same gross-vs-net split as the reverse base, in the other direction: this one
   * gives the customer back LESS than it used to, because the gross ratio was
   * over-crediting. That drop is intended, not a regression.
   */
  describe('redeemed-points credit-back is net of promotion (UOW-02, QA #3)', () => {
    /**
     * R2 — R1 plus 1.000 points spent on the original sale.
     *
     * subtotal 10.000.000 · discountAmount 26.000 · pointsRedeemed 1.000
     * pointsDiscountAmount 500.000 · amountDue 9.474.000 · pointsEarned 947
     */
    const setupR2ReturningThePromotedLineOnly = () =>
      setupReturn({
        original: {
          subtotal: 10_000_000,
          discountAmount: 26_000,
          pointsRedeemed: 1_000,
          pointsDiscountAmount: 500_000,
          amountDue: 9_474_000,
          totalPaid: 9_474_000,
        },
        originalLines: [
          { quantity: 1, unitPrice: 490_000, lineTotal: 490_000, promotionDiscount: 26_000 },
          { quantity: 1, unitPrice: 9_510_000, lineTotal: 9_510_000, promotionDiscount: 0 },
        ],
        returnedLines: [
          {
            quantity: 1,
            unitPrice: 490_000,
            lineTotal: 490_000,
            originalInvoiceItemId: 'orig-line-0',
          },
        ],
      });

    const creditedBack = () =>
      membershipCardService.refundRedeemedPoints.mock.calls[0][0].points as number;

    it('gives back points in proportion to the money returned, not the gross (AC-06)', async () => {
      setupR2ReturningThePromotedLineOnly();

      await service.checkout('ret-1', cashDto(), actor);

      // returnedNet here is NOT 464.000: with 500.000 of points sitting on the
      // header, line A carries its share of that residual too —
      //   464.000 − 500.000 × 464.000/9.974.000 = 440.739,52
      // Read it off the run rather than re-deriving it, since how returnedNet is
      // built belongs to promotion-qa-defects/UOW-01, not to this test.
      const returnedNet = refundedAmount();
      expect(returnedNet).toBeCloseTo(440_739.52, 2);

      // floor(1.000 × 440.739,52 / 9.474.000) = floor(46,52) = 46.
      // The gross basis in force today instead yields 49:
      //   floor(1.000 × 490.000 / 10.000.000) = 49
      expect(creditedBack()).toBe(46);
    });

    it('gives back every redeemed point when the whole invoice comes back (AC-07)', async () => {
      setupReturn({
        original: {
          subtotal: 10_000_000,
          discountAmount: 26_000,
          pointsRedeemed: 1_000,
          pointsDiscountAmount: 500_000,
          amountDue: 9_474_000,
          totalPaid: 9_474_000,
        },
        originalLines: [
          { quantity: 1, unitPrice: 490_000, lineTotal: 490_000, promotionDiscount: 26_000 },
          { quantity: 1, unitPrice: 9_510_000, lineTotal: 9_510_000, promotionDiscount: 0 },
        ],
        returnedLines: [
          {
            quantity: 1,
            unitPrice: 490_000,
            lineTotal: 490_000,
            originalInvoiceItemId: 'orig-line-0',
          },
          {
            quantity: 1,
            unitPrice: 9_510_000,
            lineTotal: 9_510_000,
            originalInvoiceItemId: 'orig-line-1',
          },
        ],
      });

      await service.checkout('ret-1', cashDto(), actor);

      // returnedNet lands on amountDue, so the ratio is exactly 1. This is the
      // end-stop that rejects a wrong denominator: prorating on Σ netLine
      // (9.974.000) instead would hand back only 949 of the 1.000 spent.
      expect(creditedBack()).toBe(1_000);
    });

    it('does not divide by zero on an invoice settled entirely with points (AC-08)', async () => {
      // Shaped after INV-202608-00010, which is sitting in the dev database:
      // subtotal 750.000, promotion 150.000, points 600.000, amount_due 0.
      setupReturn({
        original: {
          subtotal: 750_000,
          discountAmount: 150_000,
          pointsRedeemed: 1_200,
          pointsDiscountAmount: 600_000,
          amountDue: 0,
          totalPaid: 0,
        },
        originalLines: [
          { quantity: 1, unitPrice: 250_000, lineTotal: 250_000, promotionDiscount: 50_000 },
          { quantity: 1, unitPrice: 500_000, lineTotal: 500_000, promotionDiscount: 100_000 },
        ],
        returnedLines: [
          {
            quantity: 1,
            unitPrice: 250_000,
            lineTotal: 250_000,
            originalInvoiceItemId: 'orig-line-0',
          },
        ],
      });

      await service.checkout('ret-1', cashDto(), actor);

      const credited = creditedBack();
      expect(Number.isFinite(credited)).toBe(true);
      expect(Number.isNaN(credited)).toBe(false);
      // No money basis survives, so the gross share is the only ratio left:
      // floor(1.200 × 250.000 / 750.000) = 400.
      expect(credited).toBe(400);

      const saved = savedInvoice();
      expect(Number.isNaN(saved.pointsReversed)).toBe(false);
    });

    it('never hands back more than was redeemed, however the return is split (AC-09)', async () => {
      const R2 = {
        original: {
          subtotal: 10_000_000,
          discountAmount: 26_000,
          pointsRedeemed: 1_000,
          pointsDiscountAmount: 500_000,
          amountDue: 9_474_000,
          totalPaid: 9_474_000,
        },
        originalLines: [
          { quantity: 1, unitPrice: 490_000, lineTotal: 490_000, promotionDiscount: 26_000 },
          { quantity: 1, unitPrice: 9_510_000, lineTotal: 9_510_000, promotionDiscount: 0 },
        ],
      };

      // Line A on one return document, line B on another.
      setupReturn({
        ...R2,
        returnedLines: [
          { quantity: 1, unitPrice: 490_000, lineTotal: 490_000, originalInvoiceItemId: 'orig-line-0' },
        ],
      });
      await service.checkout('ret-1', cashDto(), actor);

      setupReturn({
        ...R2,
        returnedLines: [
          { quantity: 1, unitPrice: 9_510_000, lineTotal: 9_510_000, originalInvoiceItemId: 'orig-line-1' },
        ],
      });
      await service.checkout('ret-1', cashDto(), actor);

      const total = membershipCardService.refundRedeemedPoints.mock.calls.reduce(
        (sum, call) => sum + (call[0].points as number),
        0,
      );

      // An inequality on purpose. Each document floors independently, so the two
      // halves come to 46 + 953 = 999 rather than a clean 1.000 — one point lost
      // to rounding, which ADR-03 accepts rather than carrying a remainder ledger
      // between return documents. Pinning 999 exactly would freeze an accepted
      // rounding artefact into a brittle expectation.
      expect(total).toBeLessThanOrEqual(1_000);
      expect(total).toBeGreaterThan(995);
    });

    it('snapshots the balance the reverse consumer will actually leave (AC-11)', async () => {
      setupR2ReturningThePromotedLineOnly();
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(5_000);

      await service.checkout('ret-1', cashDto(), actor);

      const saved = savedInvoice();
      // returnedNet 440.739,52 → reversed floor(44,07) = 44; creditBack 46;
      // nothing earned (no OUT lines). 5.000 + 46 + 0 − 44 = 5.002.
      //
      // Unit scope: the consumer runs out of process, so what is pinned here is
      // that the snapshot equals the arithmetic the consumer applies, not the
      // post-consumer row itself. AC-11's end-to-end half belongs to the live demo.
      expect(saved.pointsReversed).toBe(44);
      expect(saved.pointsBalanceAfter).toBe(5_002);
    });

    it('clamps the snapshot at 0 exactly as the consumer caps its decrement (AC-11)', async () => {
      // R1 has no redeemed points, so nothing is credited back to soften the
      // reverse — with a nearly empty card the raw arithmetic goes negative and
      // the clamp has to catch it. Without this case the clamp is never entered.
      setupR1ReturningThePromotedLineOnly();
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(10);

      await service.checkout('ret-1', cashDto(), actor);

      const saved = savedInvoice();
      expect(saved.pointsReversed).toBe(46); // 10 + 0 + 0 − 46 = −36
      expect(saved.pointsBalanceAfter).toBe(0);
    });
  });
  /**
   * Trả hàng trên hoá đơn còn nợ — tách khoản hoàn (QA #8).
   *
   * The fixture is the reported invoice: 765.000 receivable, 300.000 collected at
   * the till, 465.000 still owed. Before this feature the whole 765.000 left the
   * drawer while the 465.000 debt stayed open — 930.000 lost on a 765.000 sale.
   */
  describe('debt-first refund split (QA #8)', () => {
    const DUE = 765_000;

    /** Full-value return of a single-line 765.000 sale. */
    function setupFullReturn(returnedTotal = DUE) {
      setupReturn({
        original: { amountDue: DUE, subtotal: DUE },
        originalLines: [{ quantity: 1, lineTotal: DUE }],
        returnedLines: [
          {
            quantity: 1,
            lineTotal: returnedTotal,
            originalInvoiceItemId: 'orig-line-0',
          },
        ],
      });
    }

    /** Partial return: `part` of the original single line comes back. */
    function setupPartialReturn(part: number) {
      setupReturn({
        original: { amountDue: DUE, subtotal: DUE },
        originalLines: [{ quantity: DUE, lineTotal: DUE }],
        returnedLines: [
          {
            quantity: part,
            lineTotal: part,
            originalInvoiceItemId: 'orig-line-0',
          },
        ],
      });
    }

    const openDebt = (remaining: number, originalAmount = remaining) => {
      const row = {
        ...debtRow,
        originalAmount,
        paidAmount: originalAmount - remaining,
        remainingAmount: remaining,
        status: DebtStatus.OPEN,
      };
      debtRepo.findOne.mockResolvedValue(row);
      mockManager.findOne.mockResolvedValue(row);
      return row;
    };

    const settledDebtRow = () =>
      mockManager.save.mock.calls
        .map((c) => c[0])
        .find((e) => e && typeof e === 'object' && e.id === 'debt-1');

    const cashOut = () =>
      cashRefundPublisher.publish.mock.calls.length === 0
        ? 0
        : (cashRefundPublisher.publish.mock.calls[0][0].amount as number);

    const bankOut = () =>
      depositRefundPublisher.publish.mock.calls.length === 0
        ? 0
        : (depositRefundPublisher.publish.mock.calls[0][0].amount as number);

    it('AC-01 — settles the 465.000 debt and pays out only the 300.000 collected', async () => {
      setupFullReturn();
      openDebt(465_000, 465_000);

      await service.checkout('ret-1', cashDto(), actor);

      expect(savedInvoice().offsetAmount).toBe(465_000);
      expect(Number(savedInvoice().refundedAmount)).toBe(DUE);
      expect(settledDebtRow()).toMatchObject({
        remainingAmount: 0,
        status: DebtStatus.PAID,
      });
      expect(cashOut()).toBe(300_000);
    });

    it('AC-02 — a partial return smaller than the debt pays out nothing', async () => {
      setupPartialReturn(300_000);
      openDebt(465_000, 465_000);

      await service.checkout('ret-1', cashDto(), actor);

      expect(savedInvoice().offsetAmount).toBe(300_000);
      expect(settledDebtRow()).toMatchObject({ remainingAmount: 165_000 });
      expect(cashRefundPublisher.publish).not.toHaveBeenCalled();
    });

    it('AC-03 — a credit sale already paid off refunds in full (total_paid still reads 0)', async () => {
      setupFullReturn();
      const paidOff = {
        ...debtRow,
        originalAmount: 465_000,
        paidAmount: 465_000,
        remainingAmount: 0,
        status: DebtStatus.PAID,
      };
      debtRepo.findOne.mockResolvedValue(paidOff);
      mockManager.findOne.mockResolvedValue(paidOff);

      await service.checkout('ret-1', cashDto(), actor);

      // The trap a `total_paid` cap would have fallen into: this customer settled
      // their debt through `debt_payments`, so `invoices.total_paid` is still 0.
      expect(savedInvoice().offsetAmount).toBe(0);
      expect(cashOut()).toBe(DUE);
    });

    it('AC-04 — a cash sale with no debt row is untouched', async () => {
      setupFullReturn();
      debtRepo.findOne.mockResolvedValue(null);
      mockManager.findOne.mockResolvedValue(null);

      await service.checkout('ret-1', cashDto(), actor);

      expect(savedInvoice().offsetAmount).toBe(0);
      expect(cashOut()).toBe(DUE);
      expect(mockManager.create).not.toHaveBeenCalled();
    });

    it('AC-05 — a fully unpaid credit sale refunds 100% into the debt, 0 in cash', async () => {
      setupFullReturn();
      openDebt(DUE, DUE);

      await service.checkout('ret-1', cashDto(), actor);

      expect(savedInvoice().offsetAmount).toBe(DUE);
      expect(settledDebtRow()).toMatchObject({
        remainingAmount: 0,
        status: DebtStatus.PAID,
      });
      expect(cashRefundPublisher.publish).not.toHaveBeenCalled();
    });

    it('AC-06 — a QUICK return with no original invoice never looks up debt', async () => {
      invoiceRepo.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === 'ret-1'
            ? returnDraftStub({ originalInvoiceId: undefined })
            : null,
        ),
      );

      await service.checkout('ret-1', cashDto(), actor);

      expect(debtRepo.findOne).not.toHaveBeenCalled();
      expect(mockManager.findOne).not.toHaveBeenCalled();
      expect(savedInvoice().offsetAmount).toBe(0);
      expect(cashOut()).toBe(200); // the default 200 line stub
    });

    it('AC-07 — offset + cash out = refunded, and cash out never exceeds what was collected', async () => {
      // Deterministic LCG rather than Math.random: a property test that cannot be
      // replayed is a property test you cannot debug.
      let seed = 20260816;
      const next = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      // Guards against a vacuous pass: if every sample happened to be fully
      // offset, `paidOut <= collected` would hold trivially at 0 <= x.
      let sawCashOut = 0;
      let sawFullOffset = 0;

      for (let i = 0; i < 200; i++) {
        jest.clearAllMocks();
        cashFundResolver.resolveBranchCashFund.mockResolvedValue(CASH_FUND);
        accountResolver.resolveDefaultAccount.mockImplementation((role: any) =>
          Promise.resolve(
            role === AccountingDefaultAccountRole.REVENUE
              ? REVENUE_ACCOUNT
              : RECEIVABLE_ACCOUNT,
          ),
        );
        mockManager.save.mockImplementation((e: any) => Promise.resolve(e));
        mockManager.create.mockImplementation((_e: any, data: any) => ({
          id: 'gen-1',
          ...data,
        }));
        mockManager.query.mockResolvedValue([undefined, 1]);
        membershipCardService.getPointBalanceForUpdate.mockResolvedValue(null);

        const due = Math.round(next() * 5_000_000) + 1_000;
        const remaining = Math.round(next() * due);
        const returned = Math.max(1, Math.round(next() * due));

        setupReturn({
          original: { amountDue: due, subtotal: due },
          originalLines: [{ quantity: due, lineTotal: due }],
          returnedLines: [
            {
              quantity: returned,
              lineTotal: returned,
              originalInvoiceItemId: 'orig-line-0',
            },
          ],
        });
        if (remaining > 0) openDebt(remaining, remaining);
        else {
          debtRepo.findOne.mockResolvedValue(null);
          mockManager.findOne.mockResolvedValue(null);
        }

        await service.checkout('ret-1', cashDto(), actor);

        const saved = savedInvoice();
        const offset = Number(saved.offsetAmount);
        const refunded = Number(saved.refundedAmount);
        const paidOut = cashOut();
        const collected = due - remaining;

        expect(offset).toBeGreaterThanOrEqual(0);
        expect(paidOut).toBeGreaterThanOrEqual(0);
        expect(offset + paidOut).toBeCloseTo(refunded, 2);
        expect(paidOut).toBeLessThanOrEqual(collected + 0.005);
        if (paidOut > 0) sawCashOut++;
        if (offset > 0 && paidOut === 0) sawFullOffset++;
      }

      expect(sawCashOut).toBeGreaterThan(20);
      expect(sawFullOffset).toBeGreaterThan(20);
    });

    it('AC-08 — an EXCHANGE with a negative net splits the same way', async () => {
      // Return 765.000, buy 200.000 more → refund 565.000 against a 465.000 debt.
      setupReturn({
        original: { amountDue: DUE, subtotal: DUE },
        originalLines: [{ quantity: 1, lineTotal: DUE }],
        returnedLines: [
          {
            quantity: 1,
            lineTotal: DUE,
            originalInvoiceItemId: 'orig-line-0',
          },
          {
            id: 'ret-line-out',
            quantity: 1,
            lineTotal: 200_000,
            direction: ItemDirection.OUT,
          },
        ],
      });
      openDebt(465_000, 465_000);

      await service.checkout('ret-1', cashDto(), actor);

      expect(Number(savedInvoice().refundedAmount)).toBe(565_000);
      expect(savedInvoice().offsetAmount).toBe(465_000);
      expect(cashOut()).toBe(100_000);
    });

    it('AC-09 — two partial returns pay out the collected 300.000 in total, never more', async () => {
      // Round 1: 400.000 back against a 465.000 debt → all of it offsets.
      setupPartialReturn(400_000);
      const row = openDebt(465_000, 465_000);
      await service.checkout('ret-1', cashDto(), actor);

      const afterFirst = settledDebtRow();
      expect(savedInvoice().offsetAmount).toBe(400_000);
      expect(afterFirst).toMatchObject({ remainingAmount: 65_000 });
      const firstCash = cashOut();

      // Round 2: the remaining 365.000 meets a debt already down to 65.000.
      jest.clearAllMocks();
      cashFundResolver.resolveBranchCashFund.mockResolvedValue(CASH_FUND);
      accountResolver.resolveDefaultAccount.mockImplementation((role: any) =>
        Promise.resolve(
          role === AccountingDefaultAccountRole.REVENUE
            ? REVENUE_ACCOUNT
            : RECEIVABLE_ACCOUNT,
        ),
      );
      mockManager.save.mockImplementation((e: any) => Promise.resolve(e));
      mockManager.create.mockImplementation((_e: any, data: any) => ({
        id: 'gen-1',
        ...data,
      }));
      mockManager.query.mockResolvedValue([undefined, 1]);
      membershipCardService.getPointBalanceForUpdate.mockResolvedValue(null);

      setupPartialReturn(365_000);
      debtRepo.findOne.mockResolvedValue(row);
      mockManager.findOne.mockResolvedValue(row);
      await service.checkout('ret-1', cashDto(), actor);

      expect(savedInvoice().offsetAmount).toBe(65_000);
      expect(settledDebtRow()).toMatchObject({
        remainingAmount: 0,
        status: DebtStatus.PAID,
      });
      expect(firstCash + cashOut()).toBe(300_000);
    });

    it('AC-10 — a BANK refund withdraws only the cash-out part from the deposit fund', async () => {
      setupFullReturn();
      openDebt(465_000, 465_000);

      await service.checkout('ret-1', bankDto(), actor);

      expect(savedInvoice().offsetAmount).toBe(465_000);
      expect(bankOut()).toBe(300_000);
      expect(cashRefundPublisher.publish).not.toHaveBeenCalled();
    });

    it('AC-12 — a fully offset refund creates no treasury voucher at all', async () => {
      setupFullReturn();
      openDebt(DUE, DUE);

      await service.checkout('ret-1', bankDto(), actor);

      expect(cashRefundPublisher.publish).not.toHaveBeenCalled();
      expect(depositRefundPublisher.publish).not.toHaveBeenCalled();
    });
  });
});
