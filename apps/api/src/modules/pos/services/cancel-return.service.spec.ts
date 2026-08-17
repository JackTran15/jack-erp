import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CustomerCreditStatus, WsEventType } from '@erp/shared-interfaces';
import { CancelReturnService } from './cancel-return.service';
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
  DebtDocumentType,
  DebtStatus,
} from '../entities/invoice-debt.entity';
import { CustomerCreditEntity } from '../../customer/customer-credit.entity';
import { WebSocketEmitterService } from '../../websocket/websocket-emitter.service';
import { AccountResolverService } from '../../accounting/payment-accounts/account-resolver.service';
import { CashFundResolverService } from '../../accounting/cash/cash-fund-resolver.service';
import { MembershipCardService } from '../../customer/services/membership-card.service';
import { InvoiceCancelledPublisher } from '../publishers/invoice-cancelled.publisher';
import { InvoiceRefundLegsService } from './invoice-refund-legs.service';

const actor = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
  permissions: [],
};

/**
 * The exchange from the bug report: customer returned DO-39 (520k) and took
 * DO-35 (520k). Net 0, so nothing moved but stock.
 */
const returnStub = (overrides: Partial<InvoiceEntity> = {}): InvoiceEntity =>
  ({
    id: 'rtn-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    code: 'RTN-202608-00005',
    status: InvoiceStatus.PAID,
    type: InvoiceType.EXCHANGE,
    isDraft: false,
    originalInvoiceId: 'inv-1',
    subtotal: 520_000,
    amountDue: 0,
    totalPaid: 0,
    refundedAmount: 0,
    netAmount: 0,
    pointsEarned: 52,
    pointsReversed: 52,
    ...overrides,
  }) as InvoiceEntity;

const inLineStub = (overrides: Partial<InvoiceItemEntity> = {}): InvoiceItemEntity =>
  ({
    id: 'rtn-line-in',
    invoiceId: 'rtn-1',
    organizationId: 'org-1',
    itemId: 'item-DO-39',
    locationId: 'loc-showroom',
    direction: ItemDirection.IN,
    originalInvoiceItemId: 'inv-line-1',
    quantity: 1,
    unitPrice: 520_000,
    lineTotal: 520_000,
    ...overrides,
  }) as InvoiceItemEntity;

const outLineStub = (overrides: Partial<InvoiceItemEntity> = {}): InvoiceItemEntity =>
  ({
    id: 'rtn-line-out',
    invoiceId: 'rtn-1',
    organizationId: 'org-1',
    itemId: 'item-DO-35',
    locationId: 'loc-showroom',
    direction: ItemDirection.OUT,
    quantity: 1,
    unitPrice: 520_000,
    lineTotal: 520_000,
    ...overrides,
  }) as InvoiceItemEntity;

const publishedPayload = (publisher: { publish: jest.Mock }) =>
  publisher.publish.mock.calls[0][0];

/**
 * `manager.findOne` serves four different lookups inside the transaction, so a
 * blanket mock would hand the credit row to the debt guard. Dispatch by entity
 * and documentType the way the real manager does.
 */
const managerFindOne = (rows: {
  credit?: unknown;
  exchangeDebt?: unknown;
  adjustment?: unknown;
  originalDebt?: unknown;
}) =>
  jest.fn((entity: unknown, opts: any) => {
    if (entity === CustomerCreditEntity) {
      return Promise.resolve(rows.credit ?? null);
    }
    if (opts.where.documentType === DebtDocumentType.CREDIT_INVOICE) {
      return Promise.resolve(rows.exchangeDebt ?? null);
    }
    if (opts.where.documentType === DebtDocumentType.ADJUSTMENT) {
      return Promise.resolve(rows.adjustment ?? null);
    }
    return Promise.resolve(rows.originalDebt ?? null);
  });

describe('CancelReturnService', () => {
  let service: CancelReturnService;
  let invoiceRepo: { findOne: jest.Mock };
  let itemRepo: { find: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let publisher: { publish: jest.Mock };
  let wsEmitter: { emitToBranch: jest.Mock };
  let refundLegs: { build: jest.Mock };
  let accountResolver: { resolveDefaultAccount: jest.Mock };
  let cashFundResolver: { resolveBranchCashFund: jest.Mock };
  let membershipCardService: {
    netPointsForInvoice: jest.Mock;
    adjustPointsForVoid: jest.Mock;
  };
  let mockManager: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockManager = {
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      remove: jest.fn().mockResolvedValue(undefined),
      softRemove: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(null),
      // [rows, rowCount] — the shape node-postgres returns for an UPDATE.
      query: jest.fn().mockResolvedValue([[], 1]),
    };

    invoiceRepo = {
      findOne: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === 'rtn-1' ? returnStub() : null),
      ),
    };
    itemRepo = {
      find: jest.fn().mockResolvedValue([inLineStub(), outLineStub()]),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
    };
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    wsEmitter = { emitToBranch: jest.fn() };
    refundLegs = { build: jest.fn().mockResolvedValue([]) };
    accountResolver = {
      resolveDefaultAccount: jest.fn().mockResolvedValue('coa-revenue'),
    };
    cashFundResolver = {
      resolveBranchCashFund: jest.fn().mockResolvedValue('cash-fund-1'),
    };
    membershipCardService = {
      netPointsForInvoice: jest.fn().mockResolvedValue(0),
      adjustPointsForVoid: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CancelReturnService,
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: getRepositoryToken(InvoiceItemEntity), useValue: itemRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: InvoiceCancelledPublisher, useValue: publisher },
        { provide: WebSocketEmitterService, useValue: wsEmitter },
        { provide: InvoiceRefundLegsService, useValue: refundLegs },
        { provide: AccountResolverService, useValue: accountResolver },
        { provide: CashFundResolverService, useValue: cashFundResolver },
        { provide: MembershipCardService, useValue: membershipCardService },
      ],
    }).compile();

    service = module.get(CancelReturnService);
  });

  describe('validation', () => {
    it('throws NotFoundException when the document does not exist', async () => {
      await expect(
        service.cancel('rtn-x', { reason: 'nhầm' }, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a SALE invoice — that is the other flow', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        returnStub({ type: InvoiceType.SALE }),
      );
      await expect(
        service.cancel('rtn-1', { reason: 'nhầm' }, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a draft', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        returnStub({ status: InvoiceStatus.DRAFT, isDraft: true }),
      );
      await expect(
        service.cancel('rtn-1', { reason: 'nhầm' }, actor),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses one that is already cancelled', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        returnStub({ status: InvoiceStatus.CANCELLED }),
      );
      await expect(
        service.cancel('rtn-1', { reason: 'nhầm' }, actor),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('an equal-value exchange (netAmount = 0)', () => {
    it('cancels and publishes both lines with their direction', async () => {
      const result = await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(result.status).toBe(InvoiceStatus.CANCELLED);
      expect(result.cancelReason).toBe('nhầm hàng');
      expect(publishedPayload(publisher).items).toEqual([
        {
          itemId: 'item-DO-39',
          locationId: 'loc-showroom',
          quantity: 1,
          direction: ItemDirection.IN,
        },
        {
          itemId: 'item-DO-35',
          locationId: 'loc-showroom',
          quantity: 1,
          direction: ItemDirection.OUT,
        },
      ]);
    });

    it('gives the returned quantity back to the original sale line', async () => {
      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(mockManager.query).toHaveBeenCalledTimes(1);
      const [sql, params] = mockManager.query.mock.calls[0];
      expect(sql).toContain('returned_quantity = returned_quantity - $1');
      expect(sql).toContain('returned_quantity >= $1');
      expect(sql).toContain('organization_id = $3');
      expect(params).toEqual([1, 'inv-line-1', 'org-1']);
    });

    it('moves no money when nothing was refunded or collected', async () => {
      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(publishedPayload(publisher).collections).toEqual([]);
      expect(publishedPayload(publisher).refunds).toEqual([]);
      expect(cashFundResolver.resolveBranchCashFund).not.toHaveBeenCalled();
    });

    it('leaves the document\'s own point snapshots intact', async () => {
      const result = await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(result.pointsEarned).toBe(52);
      expect(result.pointsReversed).toBe(52);
    });

    it('emits the branch websocket event', async () => {
      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(wsEmitter.emitToBranch).toHaveBeenCalledWith(
        'branch-1',
        expect.objectContaining({ eventType: WsEventType.POS_INVOICE_CANCELLED }),
      );
    });

    it('refuses when the original line no longer carries that returned quantity', async () => {
      mockManager.query.mockResolvedValue([[], 0]);

      await expect(
        service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor),
      ).rejects.toThrow(ConflictException);
    });

    it('skips a QUICK return line that has no original to credit back', async () => {
      itemRepo.find.mockResolvedValue([
        inLineStub({ originalInvoiceItemId: undefined }),
      ]);

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(mockManager.query).not.toHaveBeenCalled();
    });
  });

  describe('money mirror', () => {
    it('collects back a cash refund', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        returnStub({
          type: InvoiceType.RETURN,
          refundMethod: RefundMethod.CASH,
          refundedAmount: 520_000,
          netAmount: -520_000,
        }),
      );

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(publishedPayload(publisher).collections).toEqual([
        {
          fundKind: 'CASH',
          cashAccountId: 'cash-fund-1',
          amount: 520_000,
          contraAccountId: 'coa-revenue',
        },
      ]);
    });

    it('collects back a bank refund without naming the fund', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        returnStub({
          type: InvoiceType.RETURN,
          refundMethod: RefundMethod.BANK,
          refundedAmount: 520_000,
        }),
      );

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(publishedPayload(publisher).collections).toEqual([
        { fundKind: 'DEPOSIT', amount: 520_000, contraAccountId: 'coa-revenue' },
      ]);
      expect(cashFundResolver.resolveBranchCashFund).not.toHaveBeenCalled();
    });

    it('produces no collection leg for STORE_CREDIT or OFFSET — no money moved', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        returnStub({
          type: InvoiceType.RETURN,
          refundMethod: RefundMethod.OFFSET,
          refundedAmount: 520_000,
        }),
      );

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(publishedPayload(publisher).collections).toEqual([]);
    });

    it('pays back what an exchange collected as a top-up', async () => {
      refundLegs.build.mockResolvedValue([
        {
          invoicePaymentIds: ['pay-1'],
          fundKind: 'CASH',
          cashAccountId: 'cash-fund-1',
          amount: 200_000,
          contraAccountId: 'coa-revenue',
        },
      ]);

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(publishedPayload(publisher).refunds).toHaveLength(1);
    });

    it('does not touch the document when the branch has no cash fund', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        returnStub({ refundMethod: RefundMethod.CASH, refundedAmount: 520_000 }),
      );
      cashFundResolver.resolveBranchCashFund.mockRejectedValue(
        new BadRequestException('No cash fund configured'),
      );

      await expect(
        service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor),
      ).rejects.toThrow(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(publisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('store credit', () => {
    const openCredit = {
      id: 'cr-1',
      referenceCode: 'RTN-202608-00005-CR',
      usedAmount: 0,
      status: CustomerCreditStatus.OPEN,
    } as CustomerCreditEntity;

    beforeEach(() => {
      invoiceRepo.findOne.mockResolvedValue(
        returnStub({
          type: InvoiceType.RETURN,
          refundMethod: RefundMethod.STORE_CREDIT,
          refundedAmount: 520_000,
        }),
      );
    });

    it('revokes an untouched credit', async () => {
      mockManager.findOne = managerFindOne({ credit: openCredit });

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(mockManager.softRemove).toHaveBeenCalledWith(openCredit);
    });

    it('refuses when the customer has already spent part of it', async () => {
      mockManager.findOne = managerFindOne({
        credit: { ...openCredit, usedAmount: 100_000 },
      });

      await expect(
        service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor),
      ).rejects.toThrow(BadRequestException);
      // The guard runs inside the transaction, so it rolls back rather than
      // never opening one — what matters is that nothing was written or emitted.
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('refuses a credit that is no longer OPEN', async () => {
      mockManager.findOne = managerFindOne({
        credit: { ...openCredit, status: CustomerCreditStatus.CONSUMED },
      });

      await expect(
        service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('exchange debt', () => {
    const debtStub = (overrides: Partial<InvoiceDebtEntity> = {}) =>
      ({
        id: 'debt-1',
        invoiceId: 'rtn-1',
        documentType: DebtDocumentType.CREDIT_INVOICE,
        originalAmount: 200_000,
        paidAmount: 0,
        remainingAmount: 200_000,
        status: DebtStatus.OPEN,
        ...overrides,
      }) as InvoiceDebtEntity;

    it('settles an uncollected exchange debt to zero', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        returnStub({ status: InvoiceStatus.DEBT }),
      );
      const debt = debtStub();
      mockManager.findOne = managerFindOne({ exchangeDebt: debt });

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(debt.remainingAmount).toBe(0);
      expect(debt.status).toBe(DebtStatus.PAID);
      expect(mockManager.save).toHaveBeenCalledWith(debt);
    });

    it('refuses once the customer has started paying it off', async () => {
      invoiceRepo.findOne.mockResolvedValue(
        returnStub({ status: InvoiceStatus.PARTIAL_DEBT }),
      );
      mockManager.findOne = managerFindOne({
        exchangeDebt: debtStub({ paidAmount: 50_000 }),
      });

      await expect(
        service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor),
      ).rejects.toThrow(BadRequestException);
      expect(mockManager.save).not.toHaveBeenCalled();
      expect(publisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('OFFSET against the original sale', () => {
    beforeEach(() => {
      invoiceRepo.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === 'rtn-1'
            ? returnStub({
                type: InvoiceType.RETURN,
                refundMethod: RefundMethod.OFFSET,
                refundedAmount: 520_000,
              })
            : ({ id: 'inv-1', organizationId: 'org-1' } as InvoiceEntity),
        ),
      );
    });

    it('reopens the original debt by the amount the offset actually applied', async () => {
      const originalDebt = {
        id: 'debt-orig',
        invoiceId: 'inv-1',
        originalAmount: 1_000_000,
        paidAmount: 1_000_000,
        remainingAmount: 0,
        status: DebtStatus.PAID,
        settledAt: new Date(),
      } as InvoiceDebtEntity;
      const adjustment = {
        id: 'debt-adj',
        invoiceId: 'rtn-1',
        documentType: DebtDocumentType.ADJUSTMENT,
        // Capped at what was still owed, so it can be less than refundedAmount.
        originalAmount: -400_000,
      } as InvoiceDebtEntity;

      mockManager.findOne = managerFindOne({ adjustment, originalDebt });

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(originalDebt.paidAmount).toBe(600_000);
      expect(originalDebt.remainingAmount).toBe(400_000);
      expect(originalDebt.status).toBe(DebtStatus.OPEN);
      expect(originalDebt.settledAt).toBeNull();
      expect(mockManager.remove).toHaveBeenCalledWith(adjustment);
    });

    it('does nothing when the offset never settled anything', async () => {
      mockManager.findOne.mockResolvedValue(null);

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(mockManager.remove).not.toHaveBeenCalled();
    });
  });

  describe('loyalty', () => {
    it('takes back exactly what the document applied to the card', async () => {
      invoiceRepo.findOne.mockResolvedValue(returnStub({ customerId: 'cust-1' }));
      membershipCardService.netPointsForInvoice.mockResolvedValue(-30);

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(membershipCardService.adjustPointsForVoid).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'cust-1',
          delta: 30,
          invoiceId: 'rtn-1',
        }),
        mockManager,
        actor,
      );
    });

    it('does nothing when the document never moved a point', async () => {
      invoiceRepo.findOne.mockResolvedValue(returnStub({ customerId: 'cust-1' }));
      membershipCardService.netPointsForInvoice.mockResolvedValue(0);

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(membershipCardService.adjustPointsForVoid).not.toHaveBeenCalled();
    });

    it('skips the card entirely for a walk-in customer', async () => {
      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(membershipCardService.netPointsForInvoice).not.toHaveBeenCalled();
    });
  });
  describe('cancelling a split return (AC-17, AC-18)', () => {
    /**
     * The QA invoice, mirrored: a 765.000 return that settled 465.000 of debt and
     * paid 300.000 out of the drawer. `refundMethod` says CASH — which is exactly
     * why neither leg may be driven off it any more.
     */
    const splitReturn = () =>
      returnStub({
        type: InvoiceType.RETURN,
        refundMethod: RefundMethod.CASH,
        refundedAmount: 765_000,
        offsetAmount: 465_000,
        netAmount: -765_000,
      });

    const originalSale = () =>
      ({ id: 'inv-1', organizationId: 'org-1' }) as InvoiceEntity;

    const wireSplitReturn = () =>
      invoiceRepo.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === 'rtn-1' ? splitReturn() : originalSale()),
      );

    it('AC-17 — reopens the debt and collects back only the cash that moved', async () => {
      const originalDebt = {
        id: 'debt-orig',
        invoiceId: 'inv-1',
        originalAmount: 465_000,
        paidAmount: 465_000,
        remainingAmount: 0,
        status: DebtStatus.PAID,
        settledAt: new Date(),
      } as InvoiceDebtEntity;
      const adjustment = {
        id: 'debt-adj',
        invoiceId: 'rtn-1',
        documentType: DebtDocumentType.ADJUSTMENT,
        originalAmount: -465_000,
      } as InvoiceDebtEntity;

      wireSplitReturn();
      mockManager.findOne = managerFindOne({ adjustment, originalDebt });

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(originalDebt.remainingAmount).toBe(465_000);
      expect(originalDebt.status).toBe(DebtStatus.OPEN);
      expect(originalDebt.settledAt).toBeNull();
      // 300.000, not 765.000 — billing the customer for the offset would invent a
      // receivable out of money they never got.
      expect(publishedPayload(publisher).collections).toEqual([
        {
          fundKind: 'CASH',
          cashAccountId: 'cash-fund-1',
          amount: 300_000,
          contraAccountId: 'coa-revenue',
        },
      ]);
    });

    it('AC-18 — a fully offset return reopens the debt and collects nothing', async () => {
      const originalDebt = {
        id: 'debt-orig',
        invoiceId: 'inv-1',
        originalAmount: 765_000,
        paidAmount: 765_000,
        remainingAmount: 0,
        status: DebtStatus.PAID,
        settledAt: new Date(),
      } as InvoiceDebtEntity;
      const adjustment = {
        id: 'debt-adj',
        invoiceId: 'rtn-1',
        documentType: DebtDocumentType.ADJUSTMENT,
        originalAmount: -765_000,
      } as InvoiceDebtEntity;

      invoiceRepo.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === 'rtn-1'
            ? returnStub({
                type: InvoiceType.RETURN,
                refundMethod: RefundMethod.CASH,
                refundedAmount: 765_000,
                offsetAmount: 765_000,
                netAmount: -765_000,
              })
            : originalSale(),
        ),
      );
      mockManager.findOne = managerFindOne({ adjustment, originalDebt });

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(originalDebt.remainingAmount).toBe(765_000);
      expect(publishedPayload(publisher).collections).toEqual([]);
      expect(cashFundResolver.resolveBranchCashFund).not.toHaveBeenCalled();
    });

    it('collects back the cash-out part of a BANK split refund', async () => {
      invoiceRepo.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === 'rtn-1'
            ? returnStub({
                type: InvoiceType.RETURN,
                refundMethod: RefundMethod.BANK,
                refundedAmount: 765_000,
                offsetAmount: 465_000,
                netAmount: -765_000,
              })
            : originalSale(),
        ),
      );
      mockManager.findOne = managerFindOne({});

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(publishedPayload(publisher).collections).toEqual([
        { fundKind: 'DEPOSIT', amount: 300_000, contraAccountId: 'coa-revenue' },
      ]);
    });

    it('still restores a legacy OFFSET return, whose offsetAmount is 0', async () => {
      // Documents posted before the split carry refundMethod=OFFSET and no
      // offset_amount. The ADJUSTMENT row remains the source of truth.
      const originalDebt = {
        id: 'debt-orig',
        invoiceId: 'inv-1',
        originalAmount: 1_000_000,
        paidAmount: 1_000_000,
        remainingAmount: 0,
        status: DebtStatus.PAID,
        settledAt: new Date(),
      } as InvoiceDebtEntity;
      const adjustment = {
        id: 'debt-adj',
        invoiceId: 'rtn-1',
        documentType: DebtDocumentType.ADJUSTMENT,
        originalAmount: -400_000,
      } as InvoiceDebtEntity;

      invoiceRepo.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === 'rtn-1'
            ? returnStub({
                type: InvoiceType.RETURN,
                refundMethod: RefundMethod.OFFSET,
                refundedAmount: 520_000,
                netAmount: -520_000,
              })
            : originalSale(),
        ),
      );
      mockManager.findOne = managerFindOne({ adjustment, originalDebt });

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      expect(originalDebt.remainingAmount).toBe(400_000);
      expect(originalDebt.status).toBe(DebtStatus.OPEN);
      // Legacy OFFSET is not CASH or BANK, so no collection leg — unchanged.
      expect(publishedPayload(publisher).collections).toEqual([]);
    });

    it('subtracts the offset relative to what the debt owes now, not absolutely', async () => {
      // The customer paid 100.000 more against the debt after the return posted.
      const originalDebt = {
        id: 'debt-orig',
        invoiceId: 'inv-1',
        originalAmount: 465_000,
        paidAmount: 465_000,
        remainingAmount: 0,
        status: DebtStatus.PAID,
        settledAt: new Date(),
      } as InvoiceDebtEntity;
      const adjustment = {
        id: 'debt-adj',
        invoiceId: 'rtn-1',
        documentType: DebtDocumentType.ADJUSTMENT,
        originalAmount: -365_000,
      } as InvoiceDebtEntity;

      wireSplitReturn();
      mockManager.findOne = managerFindOne({ adjustment, originalDebt });

      await service.cancel('rtn-1', { reason: 'nhầm hàng' }, actor);

      // 465.000 paid − 365.000 put back = 100.000 genuinely collected stays paid.
      expect(originalDebt.paidAmount).toBe(100_000);
      expect(originalDebt.remainingAmount).toBe(365_000);
    });
  });
});
