import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CheckoutReturnService } from './checkout-return.service';
import {
  InvoiceEntity,
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
} from '../entities/invoice-debt.entity';
import { PosSessionEntity } from '../entities/pos-session.entity';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { CustomerCreditService } from '../../customer/services/customer-credit.service';
import { MembershipCardService } from '../../customer/services/membership-card.service';
import { AccountResolverService } from '../../accounting/payment-accounts/account-resolver.service';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';
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
  let debtRepo: { findOne: jest.Mock };
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
    // Up-front debt lookup (only queried when the operator opts into OFFSET).
    debtRepo = { findOne: jest.fn().mockResolvedValue(debtRow) };

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
        { provide: ReturnPostedPublisher, useValue: noop },
        { provide: StockReturnInPublisher, useValue: noop },
        { provide: StockDeductionPublisher, useValue: noop },
        { provide: CashRefundPublisher, useValue: cashRefundPublisher },
        { provide: CashFromPaymentPublisher, useValue: noop },
        { provide: JournalReturnPublisher, useValue: journalReturnPublisher },
        { provide: LoyaltyPointsPublisher, useValue: noop },
        { provide: LoyaltyPointsReversePublisher, useValue: noop },
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

    // Offset opt-in, but nothing to offset → cash refund, no debt settlement.
    expect(mockManager.findOne).not.toHaveBeenCalled();
    expect(accountResolver.resolveDefaultAccount).not.toHaveBeenCalled();
    expect(cashRefundPublisher.publish).toHaveBeenCalled();
    expect(journalReturnPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ refundMethod: RefundMethod.CASH }),
      actor,
    );
  });
});
