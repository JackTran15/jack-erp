import { ObjectLiteral, Repository } from 'typeorm';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import {
  InvoiceEntity,
  InvoicePaymentMethod,
  InvoiceType,
  RefundMethod,
} from '../../../pos/entities/invoice.entity';
import { InvoiceItemEntity, ItemDirection } from '../../../pos/entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../../../pos/entities/invoice-payment.entity';
import { InvoiceDebtEntity } from '../../../pos/entities/invoice-debt.entity';
import {
  DebtPaymentEntity,
  DebtPaymentMethod,
} from '../../../pos/entities/debt-payment.entity';
import { InvoicePromotionEntity } from '../../../promotion/invoice-promotion.entity';
import { CashPaymentEntity } from '../../../accounting/cash-vouchers/cash-payments/cash-payment.entity';
import { CashReceiptEntity } from '../../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import {
  CashPaymentPurpose,
  CashReceiptReferenceType,
} from '../../../accounting/cash-vouchers/enums';
import { BankPaymentEntity } from '../../../accounting/deposit-vouchers/bank-payments/bank-payment.entity';
import { BankReceiptEntity } from '../../../accounting/deposit-vouchers/bank-receipts/bank-receipt.entity';
import { BankPaymentPurpose } from '../../../accounting/deposit-vouchers/enums';
import { RbacService } from '../../../rbac/rbac.service';
import { GetPosDailySummaryHandler } from './get-pos-daily-summary.handler';
import { GetPosDailySummaryQuery } from './get-pos-daily-summary.query';
import { PosDailySummaryDto } from '../dto/pos-daily-summary.dto';

/**
 * A query-builder stub that ignores all filter calls and returns preset rows.
 * `joinCalls`/`whereCalls`, when passed, record each `innerJoin(...)` /
 * `andWhere(...)` call's arguments so tests can assert which filters a
 * combination of DTO fields triggers.
 */
/**
 * Applies the handful of value predicates this report actually relies on, so a
 * repo stub shared by two different queries (e.g. `cash_receipts` is read once
 * for a fund-swap leg and once to resolve a debt payment's document number)
 * does not hand the same row to both. Everything else is ignored.
 */
function applyStubFilters(rows: unknown[], preds: Record<string, unknown>): unknown[] {
  return rows.filter((row) => {
    const r = row as Record<string, unknown>;
    if (preds.swap !== undefined && r.referenceType !== preds.swap) return false;
    if (preds.bswap !== undefined && r.referenceType !== preds.bswap) return false;
    if (preds.refund !== undefined && r.purpose === preds.refund) return false;
    if (preds.brefund !== undefined && r.purpose === preds.brefund) return false;
    return true;
  });
}

function qbStub(rows: unknown[], joinCalls?: unknown[][], whereCalls?: unknown[][]) {
  const preds: Record<string, unknown> = {};
  const qb: Record<string, unknown> = {};
  qb.where = () => qb;
  qb.andWhere = (...args: unknown[]) => {
    whereCalls?.push(args);
    Object.assign(preds, (args[1] as Record<string, unknown>) ?? {});
    return qb;
  };
  qb.innerJoin = (...args: unknown[]) => {
    joinCalls?.push(args);
    return qb;
  };
  qb.getMany = () => Promise.resolve(applyStubFilters(rows, preds));
  return qb;
}

function repoStub<T extends ObjectLiteral>(
  rows: unknown[],
  joinCalls?: unknown[][],
  whereCalls?: unknown[][],
): Repository<T> {
  return {
    createQueryBuilder: () => qbStub(rows, joinCalls, whereCalls),
    find: () => Promise.resolve(rows),
  } as unknown as Repository<T>;
}

const actor: ActorContext = {
  userId: 'u1',
  organizationId: 'org1',
  branchId: 'b1',
  roles: [],
  permissions: [],
} as unknown as ActorContext;

const noConsolidated = {
  hasPermission: () => Promise.resolve(false),
} as unknown as RbacService;

/** Named-argument wrapper so a test only spells out the repos it cares about. */
function buildHandler(opts: {
  invoices?: unknown[];
  items?: unknown[];
  payments?: unknown[];
  promotions?: unknown[];
  debts?: unknown[];
  debtPayments?: unknown[];
  cashPayments?: unknown[];
  bankPayments?: unknown[];
  cashReceipts?: unknown[];
  bankReceipts?: unknown[];
  cashPaymentWhereCalls?: unknown[][];
  invoiceWhereCalls?: unknown[][];
  debtJoins?: unknown[][];
  debtPaymentJoins?: unknown[][];
  rbac?: RbacService;
}) {
  return new GetPosDailySummaryHandler(
    repoStub<InvoiceEntity>(opts.invoices ?? [], undefined, opts.invoiceWhereCalls),
    repoStub<InvoiceItemEntity>(opts.items ?? []),
    repoStub<InvoicePaymentEntity>(opts.payments ?? []),
    repoStub<InvoicePromotionEntity>(opts.promotions ?? []),
    repoStub<InvoiceDebtEntity>(opts.debts ?? [], opts.debtJoins),
    repoStub<DebtPaymentEntity>(opts.debtPayments ?? [], opts.debtPaymentJoins),
    repoStub<CashPaymentEntity>(opts.cashPayments ?? [], undefined, opts.cashPaymentWhereCalls),
    repoStub<BankPaymentEntity>(opts.bankPayments ?? []),
    repoStub<CashReceiptEntity>(opts.cashReceipts ?? []),
    repoStub<BankReceiptEntity>(opts.bankReceipts ?? []),
    opts.rbac ?? noConsolidated,
  );
}

const window: PosDailySummaryDto = {
  issuedAt: { from: '2026-07-01', to: '2026-07-31' },
};

describe('GetPosDailySummaryHandler', () => {
  it('aggregates Thu / Chi / Công nợ / Hàng / KHÁC over the window', async () => {
    const invoices = [
      { id: 'i1', type: InvoiceType.SALE, pointsDiscountAmount: 5000 },
      {
        id: 'i2',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        refundMethod: RefundMethod.CASH,
        refundedAmount: 15000,
        offsetAmount: 0,
      },
      { id: 'i3', type: InvoiceType.EXCHANGE, pointsDiscountAmount: 0 },
      {
        id: 'i4',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        refundMethod: RefundMethod.BANK,
        refundedAmount: 25000,
        offsetAmount: 0,
      },
    ];
    const payments = [
      { invoiceId: 'i1', paymentMethod: InvoicePaymentMethod.CASH, amount: 100000 },
      { invoiceId: 'i1', paymentMethod: InvoicePaymentMethod.CARD, amount: 20000 },
      { invoiceId: 'i3', paymentMethod: InvoicePaymentMethod.BANK_TRANSFER, amount: 30000 },
    ];
    const promotions = [
      { invoiceId: 'i1', promotionType: 'voucher', discountAmount: 10000 },
    ];
    const items = [
      { invoiceId: 'i1', direction: ItemDirection.OUT, quantity: 2, lineTotal: 120000 },
      { invoiceId: 'i2', direction: ItemDirection.IN, quantity: 1, lineTotal: 40000 },
    ];
    const debts = [{ originalAmount: 50000 }];
    const debtPayments = [{ amount: 12000, paymentMethod: DebtPaymentMethod.CASH }];

    const handler = buildHandler({
      invoices,
      items,
      payments,
      promotions,
      debts,
      debtPayments,
    });
    const res = await handler.execute(new GetPosDailySummaryQuery(window, actor));

    // Thu: 100000 invoice cash + 12000 debt repayment in cash
    expect(res.revenue.cash).toBe(112000);
    expect(res.revenue.card).toBe(20000);
    expect(res.revenue.bankTransfer).toBe(30000);
    expect(res.revenue.voucher).toBe(10000);
    expect(res.revenue.points).toBe(5000);
    // Every bucket counts, points included: all five are settlement instruments.
    expect(res.revenue.total).toBe(177000);

    // Chi: the two refunds, bucketed by refundMethod.
    expect(res.expense.cash).toBe(15000);
    expect(res.expense.bankTransfer).toBe(25000);
    expect(res.expense.total).toBe(40000);
    expect(res.netCashFlow).toBe(137000);

    // Debt
    expect(res.debt.newDebt).toBe(50000);
    expect(res.debt.debtCollected).toBe(12000);

    // Goods
    expect(res.goodsSold).toEqual({ quantity: 2, value: 120000 });
    expect(res.goodsReturned).toEqual({ quantity: 1, value: 40000 });

    // Other
    expect(res.other.totalInvoices).toBe(4);
    expect(res.other.saleInvoices).toBe(1);
    expect(res.other.returnInvoices).toBe(2);
    expect(res.other.exchangeInvoices).toBe(1);
    expect(res.other.voucherCount).toBe(1);
    expect(res.other.cardReceiptCount).toBe(1);
    expect(res.other.promoCodeCount).toBe(0);
  });

  /**
   * The reference report the client supplied, which fixes the arithmetic this
   * handler has to reproduce: the five Thu lines sum to Tổng thu (so `points`
   * belongs in the total), there is no "Khuyến mại" line, and Chi chuyển khoản
   * is non-zero (so a BANK refund has to be counted — it used to land in
   * `bank_payments`, which this report never read).
   */
  it('reproduces the reference report: 419,669,000 − 4,005,222 = 415,663,778', async () => {
    const invoices = [
      { id: 's1', type: InvoiceType.SALE, pointsDiscountAmount: 14550000 },
      {
        id: 'r1',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        refundMethod: RefundMethod.CASH,
        refundedAmount: 3333000,
        offsetAmount: 0,
      },
      {
        id: 'r2',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        refundMethod: RefundMethod.BANK,
        refundedAmount: 672222,
        offsetAmount: 0,
      },
    ];
    const payments = [
      { invoiceId: 's1', paymentMethod: InvoicePaymentMethod.CASH, amount: 404519000 },
      { invoiceId: 's1', paymentMethod: InvoicePaymentMethod.BANK_TRANSFER, amount: 500000 },
    ];
    const promotions = [
      { invoiceId: 's1', promotionType: 'voucher', discountAmount: 100000 },
    ];

    const handler = buildHandler({ invoices, payments, promotions });
    const res = await handler.execute(new GetPosDailySummaryQuery(window, actor));

    expect(res.revenue.cash).toBe(404519000);
    expect(res.revenue.card).toBe(0);
    expect(res.revenue.bankTransfer).toBe(500000);
    expect(res.revenue.voucher).toBe(100000);
    expect(res.revenue.points).toBe(14550000);
    expect(res.revenue.total).toBe(419669000);
    // The five Thu lines add up to the total — nothing is reported inside Thu
    // that the total excludes.
    expect(
      res.revenue.cash +
        res.revenue.card +
        res.revenue.bankTransfer +
        res.revenue.voucher +
        res.revenue.points,
    ).toBe(res.revenue.total);

    expect(res.expense.cash).toBe(3333000);
    expect(res.expense.bankTransfer).toBe(672222);
    expect(res.expense.total).toBe(4005222);
    expect(res.netCashFlow).toBe(415663778);
  });

  /**
   * The reported bug. A cash-refunded return used to be charged twice: once as a
   * negative inside Thu, once as the auto-generated phiếu chi in Chi. Both sides
   * now read the invoice, so the refund can only be counted where it belongs.
   */
  it('counts a refund exactly once, on the Chi side, and never touches Thu', async () => {
    const invoices = [
      { id: 'i1', type: InvoiceType.SALE, pointsDiscountAmount: 0 },
      {
        id: 'i2',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        refundMethod: RefundMethod.CASH,
        refundedAmount: 11250000,
        offsetAmount: 0,
      },
    ];
    const payments = [
      { invoiceId: 'i1', paymentMethod: InvoicePaymentMethod.CASH, amount: 25200000 },
    ];

    const handler = buildHandler({ invoices, payments });
    const res = await handler.execute(new GetPosDailySummaryQuery(window, actor));

    expect(res.revenue.cash).toBe(25200000);
    expect(res.revenue.total).toBe(25200000);
    expect(res.expense.cash).toBe(11250000);
    expect(res.netCashFlow).toBe(13950000);
  });

  it('routes a BANK-method refund to Chi chuyển khoản', async () => {
    const invoices = [
      {
        id: 'r1',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        refundMethod: RefundMethod.BANK,
        refundedAmount: 500000,
        offsetAmount: 0,
      },
    ];

    const res = await buildHandler({ invoices }).execute(
      new GetPosDailySummaryQuery(window, actor),
    );

    expect(res.expense.bankTransfer).toBe(500000);
    expect(res.expense.cash).toBe(0);
    expect(res.expense.total).toBe(500000);
  });

  it('ignores refunds that move no money: STORE_CREDIT and the legacy OFFSET method', async () => {
    const invoices = [
      {
        id: 'r1',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        refundMethod: RefundMethod.STORE_CREDIT,
        refundedAmount: 300000,
        offsetAmount: 0,
      },
      {
        id: 'r2',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        refundMethod: RefundMethod.OFFSET,
        refundedAmount: 400000,
        offsetAmount: 0,
      },
    ];

    const res = await buildHandler({ invoices }).execute(
      new GetPosDailySummaryQuery(window, actor),
    );

    expect(res.expense.total).toBe(0);
    expect(res.revenue.total).toBe(0);
  });

  it('charges only the part of a refund that left the till, not the share offset against debt', async () => {
    const invoices = [
      {
        id: 'r1',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        refundMethod: RefundMethod.CASH,
        refundedAmount: 1000000,
        offsetAmount: 400000,
      },
    ];

    const res = await buildHandler({ invoices }).execute(
      new GetPosDailySummaryQuery(window, actor),
    );

    expect(res.expense.cash).toBe(600000);
  });

  it('an EXCHANGE that collected extra adds to Thu only', async () => {
    const invoices = [
      {
        id: 'x1',
        type: InvoiceType.EXCHANGE,
        pointsDiscountAmount: 0,
        refundedAmount: 0,
        offsetAmount: 0,
      },
    ];
    const payments = [
      { invoiceId: 'x1', paymentMethod: InvoicePaymentMethod.CASH, amount: 200000 },
    ];

    const res = await buildHandler({ invoices, payments }).execute(
      new GetPosDailySummaryQuery(window, actor),
    );

    expect(res.revenue.cash).toBe(200000);
    expect(res.expense.total).toBe(0);
  });

  it('counts non-refund payout vouchers, in cash and by transfer, alongside invoice refunds', async () => {
    const invoices = [
      { id: 'i1', type: InvoiceType.SALE, pointsDiscountAmount: 0 },
      {
        id: 'i2',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        refundMethod: RefundMethod.CASH,
        refundedAmount: 300000,
        offsetAmount: 0,
      },
    ];
    const payments = [
      { invoiceId: 'i1', paymentMethod: InvoicePaymentMethod.CASH, amount: 1229000 },
    ];
    // Money out with no sales invoice behind it — the whole reason Chi reads
    // vouchers at all. Both must land, split by which table they came from.
    const cashPayments = [
      { purpose: CashPaymentPurpose.SUPPLIER_PAYMENT, totalAmount: 500000 },
      { purpose: CashPaymentPurpose.SALARY, totalAmount: 200000 },
    ];
    const bankPayments = [
      { purpose: BankPaymentPurpose.EXPENSE, totalAmount: 120000 },
    ];

    const res = await buildHandler({
      invoices,
      payments,
      cashPayments,
      bankPayments,
    }).execute(new GetPosDailySummaryQuery(window, actor));

    expect(res.expense.cash).toBe(1000000); // 300.000 hoàn + 500.000 + 200.000
    expect(res.expense.bankTransfer).toBe(120000);
    expect(res.expense.total).toBe(1120000);
    expect(res.netCashFlow).toBe(109000); // 1.229.000 − 1.120.000
  });

  it('excludes REFUND-purpose vouchers, which the invoice side already owns', async () => {
    const invoices = [
      {
        id: 'i1',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        refundMethod: RefundMethod.CASH,
        refundedAmount: 300000,
        offsetAmount: 0,
      },
    ];
    // The phiếu chi refund-cash.consumer issues for exactly that return. Counting
    // it as well is the original double-charge.
    const cashPayments = [
      { purpose: CashPaymentPurpose.REFUND, totalAmount: 300000 },
      { purpose: CashPaymentPurpose.EXPENSE, totalAmount: 50000 },
    ];

    const res = await buildHandler({ invoices, cashPayments }).execute(
      new GetPosDailySummaryQuery(window, actor),
    );

    expect(res.expense.cash).toBe(350000); // 300.000 một lần, + 50.000 chi phí
  });

  it('pairs both legs of a fund swap, so moving money between funds nets to zero', async () => {
    // "Chuyển tiền gửi thành tiền mặt": bank pays out, till receives. Counting
    // only the payout leg booked an outflow for money that never left the branch.
    const bankPayments = [
      { purpose: BankPaymentPurpose.CASH_TRANSFER, totalAmount: 123000 },
    ];
    const cashReceipts = [
      { referenceType: CashReceiptReferenceType.FUND_SWAP, totalAmount: 123000 },
    ];

    const res = await buildHandler({ bankPayments, cashReceipts }).execute(
      new GetPosDailySummaryQuery(window, actor),
    );

    expect(res.expense.bankTransfer).toBe(123000);
    expect(res.revenue.cash).toBe(123000);
    expect(res.netCashFlow).toBe(0);
  });

  it('does not pair an inter-branch transfer: it really does leave the sending branch', async () => {
    const cashPayments = [
      { purpose: CashPaymentPurpose.INTER_BRANCH_OUT, totalAmount: 400000 },
    ];
    // The destination branch's INTER_BRANCH_IN receipt is not a FUND_SWAP leg and
    // belongs to that branch's own report.
    const cashReceipts = [
      { referenceType: CashReceiptReferenceType.TRANSFER, totalAmount: 400000 },
    ];

    const res = await buildHandler({ cashPayments, cashReceipts }).execute(
      new GetPosDailySummaryQuery(window, actor),
    );

    expect(res.expense.cash).toBe(400000);
    expect(res.revenue.cash).toBe(0);
    expect(res.netCashFlow).toBe(-400000);
  });

  it('folds debt repayments into Thu by their own method, while still reporting them as Giảm nợ', async () => {
    const debtPayments = [
      { amount: 500000, paymentMethod: DebtPaymentMethod.CASH },
      { amount: 200000, paymentMethod: DebtPaymentMethod.BANK_TRANSFER },
    ];

    const res = await buildHandler({ debtPayments }).execute(
      new GetPosDailySummaryQuery(window, actor),
    );

    expect(res.revenue.cash).toBe(500000);
    expect(res.revenue.bankTransfer).toBe(200000);
    expect(res.revenue.total).toBe(700000);
    // Same event, second lens — a credit sale books Thu 0 + Ghi nợ, and only the
    // repayment books Thu, so this is not a double count.
    expect(res.debt.debtCollected).toBe(700000);
  });

  it('joins invoice_debts/debt_payments back to invoices when cashierId/salespersonId are set', async () => {
    const debtJoins: unknown[][] = [];
    const debtPaymentJoins: unknown[][] = [];

    const handler = buildHandler({
      debts: [{ originalAmount: 50000 }],
      debtPayments: [{ amount: 12000, paymentMethod: DebtPaymentMethod.CASH }],
      debtJoins,
      debtPaymentJoins,
    });

    const dto: PosDailySummaryDto = {
      issuedAt: { from: '2026-07-01', to: '2026-07-31' },
      cashierId: 'cashier-1',
      salespersonId: 'sp-1',
    };
    const res = await handler.execute(new GetPosDailySummaryQuery(dto, actor));

    expect(res.debt.newDebt).toBe(50000);
    expect(res.debt.debtCollected).toBe(12000);

    // invoice_debts joins straight to invoices (1:1 FK).
    expect(debtJoins).toEqual([
      [InvoiceEntity, 'debtInvoice', 'debtInvoice.id = d.invoiceId'],
    ]);
    // debt_payments needs a two-hop join: debt_payments -> invoice_debts -> invoices.
    expect(debtPaymentJoins).toEqual([
      [InvoiceDebtEntity, 'paidDebt', 'paidDebt.id = dp.debtId'],
      [InvoiceEntity, 'paidDebtInvoice', 'paidDebtInvoice.id = paidDebt.invoiceId'],
    ]);
  });

  it('does not join invoice_debts/debt_payments to invoices when no staff filter is set', async () => {
    const debtJoins: unknown[][] = [];
    const debtPaymentJoins: unknown[][] = [];

    await buildHandler({ debtJoins, debtPaymentJoins }).execute(
      new GetPosDailySummaryQuery(window, actor),
    );

    expect(debtJoins).toEqual([]);
    expect(debtPaymentJoins).toEqual([]);
  });

  it('scopes to the actor\'s active branch by default, even with consolidated permission (pos-web has no "Cửa hàng" filter to request "all")', async () => {
    const invoiceWhereCalls: unknown[][] = [];

    // Consolidated permission granted, but dto.branchId still not sent (pos-web
    // never sends it) — must NOT fall back to resolveBranchIds' "null = all
    // branches" default.
    const handler = buildHandler({
      invoiceWhereCalls,
      rbac: { hasPermission: () => Promise.resolve(true) } as unknown as RbacService,
    });
    await handler.execute(new GetPosDailySummaryQuery(window, actor));

    expect(invoiceWhereCalls).toContainEqual([
      'invoice.branchId IN (:...reportBranchIds)',
      { reportBranchIds: [actor.branchId] },
    ]);
  });
});
