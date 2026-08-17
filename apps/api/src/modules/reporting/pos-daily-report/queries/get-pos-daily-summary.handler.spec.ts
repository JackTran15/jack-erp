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
import { DebtPaymentEntity } from '../../../pos/entities/debt-payment.entity';
import { InvoicePromotionEntity } from '../../../promotion/invoice-promotion.entity';
import { CashPaymentEntity } from '../../../accounting/cash-vouchers/cash-payments/cash-payment.entity';
import { CashReceiptEntity } from '../../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { CashReceiptPurpose } from '../../../accounting/cash-vouchers/enums';
import { PaymentAccountEntity } from '../../../accounting/payment-accounts/payment-account.entity';
import { PaymentAccountMethod } from '../../../accounting/payment-accounts/enums';
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
function qbStub(rows: unknown[], joinCalls?: unknown[][], whereCalls?: unknown[][]) {
  const qb: Record<string, unknown> = {};
  qb.where = () => qb;
  qb.andWhere = (...args: unknown[]) => {
    whereCalls?.push(args);
    return qb;
  };
  qb.innerJoin = (...args: unknown[]) => {
    joinCalls?.push(args);
    return qb;
  };
  qb.getMany = () => Promise.resolve(rows);
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

describe('GetPosDailySummaryHandler', () => {
  it('aggregates Thu / Chi / Công nợ / Hàng / KHÁC over the window', async () => {
    const invoices = [
      { id: 'i1', type: InvoiceType.SALE, pointsDiscountAmount: 5000 },
      { id: 'i2', type: InvoiceType.RETURN, pointsDiscountAmount: 0 },
      { id: 'i3', type: InvoiceType.EXCHANGE, pointsDiscountAmount: 0 },
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
    const cashPayments = [
      { cashAccountId: 'cashAcc', totalAmount: 15000 },
      { cashAccountId: 'bankAcc', totalAmount: 25000 },
    ];
    const paymentAccounts = [
      { accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH },
      { accountId: 'bankAcc', paymentMethod: PaymentAccountMethod.BANK_TRANSFER },
    ];
    const debts = [{ originalAmount: 50000 }];
    const debtPayments = [{ amount: 12000 }];

    const handler = new GetPosDailySummaryHandler(
      repoStub<InvoiceEntity>(invoices),
      repoStub<InvoiceItemEntity>(items),
      repoStub<InvoicePaymentEntity>(payments),
      repoStub<InvoicePromotionEntity>(promotions),
      repoStub<InvoiceDebtEntity>(debts),
      repoStub<DebtPaymentEntity>(debtPayments),
      repoStub<CashPaymentEntity>(cashPayments),
      repoStub<CashReceiptEntity>([]),
      repoStub<PaymentAccountEntity>(paymentAccounts),
      { hasPermission: () => Promise.resolve(false) } as unknown as RbacService,
    );

    const dto: PosDailySummaryDto = {
      issuedAt: { from: '2026-07-01', to: '2026-07-31' },
    };
    const res = await handler.execute(new GetPosDailySummaryQuery(dto, actor));

    // Revenue: cash 100000, card 20000, transfer 30000, voucher 10000
    expect(res.revenue.cash).toBe(100000);
    expect(res.revenue.card).toBe(20000);
    expect(res.revenue.bankTransfer).toBe(30000);
    expect(res.revenue.voucher).toBe(10000);
    // Reported, but NOT in the total: point redemption is a discount, no money
    // reaches a fund. Counting it inflated netCashFlow by exactly this amount.
    expect(res.revenue.points).toBe(5000);
    expect(res.revenue.total).toBe(160000);

    // Expense: cashAcc → cash 15000, bankAcc → transfer 25000
    expect(res.expense.cash).toBe(15000);
    expect(res.expense.bankTransfer).toBe(25000);
    expect(res.expense.total).toBe(40000);
    expect(res.netCashFlow).toBe(120000);

    // Debt
    expect(res.debt.newDebt).toBe(50000);
    expect(res.debt.debtCollected).toBe(12000);

    // Goods
    expect(res.goodsSold).toEqual({ quantity: 2, value: 120000 });
    expect(res.goodsReturned).toEqual({ quantity: 1, value: 40000 });

    // Other
    expect(res.other.totalInvoices).toBe(3);
    expect(res.other.saleInvoices).toBe(1);
    expect(res.other.returnInvoices).toBe(1);
    expect(res.other.exchangeInvoices).toBe(1);
    expect(res.other.voucherCount).toBe(1);
    expect(res.other.cardReceiptCount).toBe(1);
    expect(res.other.promoCodeCount).toBe(0);
  });

  it('joins invoice_debts/debt_payments back to invoices when cashierId/salespersonId are set', async () => {
    const invoiceDebtJoins: unknown[][] = [];
    const debtPaymentJoins: unknown[][] = [];

    const handler = new GetPosDailySummaryHandler(
      repoStub<InvoiceEntity>([]),
      repoStub<InvoiceItemEntity>([]),
      repoStub<InvoicePaymentEntity>([]),
      repoStub<InvoicePromotionEntity>([]),
      repoStub<InvoiceDebtEntity>([{ originalAmount: 50000 }], invoiceDebtJoins),
      repoStub<DebtPaymentEntity>([{ amount: 12000 }], debtPaymentJoins),
      repoStub<CashPaymentEntity>([]),
      repoStub<CashReceiptEntity>([]),
      repoStub<PaymentAccountEntity>([]),
      { hasPermission: () => Promise.resolve(false) } as unknown as RbacService,
    );

    const dto: PosDailySummaryDto = {
      issuedAt: { from: '2026-07-01', to: '2026-07-31' },
      cashierId: 'cashier-1',
      salespersonId: 'sp-1',
    };
    const res = await handler.execute(new GetPosDailySummaryQuery(dto, actor));

    expect(res.debt.newDebt).toBe(50000);
    expect(res.debt.debtCollected).toBe(12000);

    // invoice_debts joins straight to invoices (1:1 FK).
    expect(invoiceDebtJoins).toEqual([
      [InvoiceEntity, 'debtInvoice', 'debtInvoice.id = d.invoiceId'],
    ]);
    // debt_payments needs a two-hop join: debt_payments -> invoice_debts -> invoices.
    expect(debtPaymentJoins).toEqual([
      [InvoiceDebtEntity, 'paidDebt', 'paidDebt.id = dp.debtId'],
      [InvoiceEntity, 'paidDebtInvoice', 'paidDebtInvoice.id = paidDebt.invoiceId'],
    ]);
  });

  it('does not join invoice_debts/debt_payments to invoices when no staff filter is set', async () => {
    const invoiceDebtJoins: unknown[][] = [];
    const debtPaymentJoins: unknown[][] = [];

    const handler = new GetPosDailySummaryHandler(
      repoStub<InvoiceEntity>([]),
      repoStub<InvoiceItemEntity>([]),
      repoStub<InvoicePaymentEntity>([]),
      repoStub<InvoicePromotionEntity>([]),
      repoStub<InvoiceDebtEntity>([], invoiceDebtJoins),
      repoStub<DebtPaymentEntity>([], debtPaymentJoins),
      repoStub<CashPaymentEntity>([]),
      repoStub<CashReceiptEntity>([]),
      repoStub<PaymentAccountEntity>([]),
      { hasPermission: () => Promise.resolve(false) } as unknown as RbacService,
    );

    const dto: PosDailySummaryDto = { issuedAt: { from: '2026-07-01', to: '2026-07-31' } };
    await handler.execute(new GetPosDailySummaryQuery(dto, actor));

    expect(invoiceDebtJoins).toEqual([]);
    expect(debtPaymentJoins).toEqual([]);
  });

  it('Chi: matches cash_payments.staffId against either cashierId or salespersonId (single staff field on the voucher)', async () => {
    const cashWhereCalls: unknown[][] = [];

    const handler = new GetPosDailySummaryHandler(
      repoStub<InvoiceEntity>([]),
      repoStub<InvoiceItemEntity>([]),
      repoStub<InvoicePaymentEntity>([]),
      repoStub<InvoicePromotionEntity>([]),
      repoStub<InvoiceDebtEntity>([]),
      repoStub<DebtPaymentEntity>([]),
      repoStub<CashPaymentEntity>([{ cashAccountId: 'cashAcc', totalAmount: 15000 }], undefined, cashWhereCalls),
      repoStub<CashReceiptEntity>([]),
      repoStub<PaymentAccountEntity>([]),
      { hasPermission: () => Promise.resolve(false) } as unknown as RbacService,
    );

    const dto: PosDailySummaryDto = {
      issuedAt: { from: '2026-07-01', to: '2026-07-31' },
      cashierId: 'cashier-1',
      salespersonId: 'sp-1',
    };
    const res = await handler.execute(new GetPosDailySummaryQuery(dto, actor));

    expect(res.expense.cash).toBe(15000);
    expect(cashWhereCalls).toContainEqual([
      'p.staffId IN (:...voucherStaffIds)',
      { voucherStaffIds: ['cashier-1', 'sp-1'] },
    ]);
  });

  it('Chi: leaves cash_payments unfiltered when neither cashierId nor salespersonId is set', async () => {
    const cashWhereCalls: unknown[][] = [];

    const handler = new GetPosDailySummaryHandler(
      repoStub<InvoiceEntity>([]),
      repoStub<InvoiceItemEntity>([]),
      repoStub<InvoicePaymentEntity>([]),
      repoStub<InvoicePromotionEntity>([]),
      repoStub<InvoiceDebtEntity>([]),
      repoStub<DebtPaymentEntity>([]),
      repoStub<CashPaymentEntity>([], undefined, cashWhereCalls),
      repoStub<CashReceiptEntity>([]),
      repoStub<PaymentAccountEntity>([]),
      { hasPermission: () => Promise.resolve(false) } as unknown as RbacService,
    );

    const dto: PosDailySummaryDto = { issuedAt: { from: '2026-07-01', to: '2026-07-31' } };
    await handler.execute(new GetPosDailySummaryQuery(dto, actor));

    expect(cashWhereCalls.some((c) => c[0] === 'p.staffId IN (:...voucherStaffIds)')).toBe(false);
  });

  it('scopes to the actor\'s active branch by default, even with consolidated permission (pos-web has no "Cửa hàng" filter to request "all")', async () => {
    const invoiceWhereCalls: unknown[][] = [];

    const handler = new GetPosDailySummaryHandler(
      repoStub<InvoiceEntity>([], undefined, invoiceWhereCalls),
      repoStub<InvoiceItemEntity>([]),
      repoStub<InvoicePaymentEntity>([]),
      repoStub<InvoicePromotionEntity>([]),
      repoStub<InvoiceDebtEntity>([]),
      repoStub<DebtPaymentEntity>([]),
      repoStub<CashPaymentEntity>([]),
      repoStub<CashReceiptEntity>([]),
      repoStub<PaymentAccountEntity>([]),
      // Consolidated permission granted, but dto.branchId still not sent (pos-web
      // never sends it) — must NOT fall back to resolveBranchIds' "null = all
      // branches" default.
      { hasPermission: () => Promise.resolve(true) } as unknown as RbacService,
    );

    const dto: PosDailySummaryDto = { issuedAt: { from: '2026-07-01', to: '2026-07-31' } };
    await handler.execute(new GetPosDailySummaryQuery(dto, actor));

    expect(invoiceWhereCalls).toContainEqual([
      'invoice.branchId IN (:...reportBranchIds)',
      { reportBranchIds: [actor.branchId] },
    ]);
  });

  /**
   * QA #10. This used to assert that a CASH refund is netted out of
   * `revenue.cash`, on the stated premise that it "never hits invoice_payments
   * or cash_payments". The premise is false: refund-cash.consumer records a
   * `cash_movements` WITHDRAWAL *and* issues a POSTED phiếu chi, which the
   * expense query counts. The old fixture simply omitted that voucher, so the
   * double-count it caused in production was invisible here.
   *
   * The fixture now includes the phiếu chi a real refund produces, and the
   * reconciled figure (25,200,000 − 11,250,000) is asserted where it belongs —
   * on `netCashFlow`, not on `revenue.cash`.
   */
  it('counts a CASH refund exactly once — on the expense side, where its phiếu chi lands', async () => {
    const invoices = [
      { id: 'i1', type: InvoiceType.SALE, pointsDiscountAmount: 0 },
      {
        id: 'i2',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        refundMethod: RefundMethod.CASH,
        refundedAmount: 11250000,
      },
      {
        id: 'i3',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        refundMethod: RefundMethod.BANK,
        refundedAmount: 500000,
      },
    ];
    const payments = [
      { invoiceId: 'i1', paymentMethod: InvoicePaymentMethod.CASH, amount: 25200000 },
    ];
    // The phiếu chi the CASH refund actually creates (purpose = REFUND).
    const cashPayments = [{ cashAccountId: 'cashAcc', totalAmount: 11250000 }];
    const paymentAccounts = [
      { accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH },
    ];

    const handler = new GetPosDailySummaryHandler(
      repoStub<InvoiceEntity>(invoices),
      repoStub<InvoiceItemEntity>([]),
      repoStub<InvoicePaymentEntity>(payments),
      repoStub<InvoicePromotionEntity>([]),
      repoStub<InvoiceDebtEntity>([]),
      repoStub<DebtPaymentEntity>([]),
      repoStub<CashPaymentEntity>(cashPayments),
      repoStub<CashReceiptEntity>([]),
      repoStub<PaymentAccountEntity>(paymentAccounts),
      { hasPermission: () => Promise.resolve(false) } as unknown as RbacService,
    );

    const dto: PosDailySummaryDto = { issuedAt: { from: '2026-01-01', to: '2026-07-29' } };
    const res = await handler.execute(new GetPosDailySummaryQuery(dto, actor));

    // Thu stays gross — the refund is not subtracted here any more.
    expect(res.revenue.cash).toBe(25200000);
    // Chi owns it, once.
    expect(res.expense.cash).toBe(11250000);
    // The reconciled figure the fund actually moved.
    expect(res.netCashFlow).toBe(13950000);
  });

  /**
   * The exact 13/08/2026 dataset QA reported, reconciled against Sổ quỹ tiền mặt.
   * Before the fix this reported −943,000 while the fund had actually moved
   * +2,527,000 — the refunds were charged twice and the points customers spent
   * were counted as income.
   */
  it('reconciles the QA day against the cash book: +2,527,000, not −943,000', async () => {
    const invoices = [
      { id: 's1', type: InvoiceType.SALE, pointsDiscountAmount: 0, discountAmount: 0 },
      { id: 's2', type: InvoiceType.SALE, pointsDiscountAmount: 0, discountAmount: 0 },
      { id: 's3', type: InvoiceType.SALE, pointsDiscountAmount: 500000, discountAmount: 0 },
      { id: 's4', type: InvoiceType.SALE, pointsDiscountAmount: 0, discountAmount: 719000 },
      { id: 's5', type: InvoiceType.SALE, pointsDiscountAmount: 0, discountAmount: 0 },
      {
        id: 'r1',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        discountAmount: 0,
        refundMethod: RefundMethod.CASH,
        refundedAmount: 1430000,
      },
      {
        id: 'r2',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        discountAmount: 0,
        refundMethod: RefundMethod.CASH,
        refundedAmount: 580000,
      },
      {
        id: 'r3',
        type: InvoiceType.RETURN,
        pointsDiscountAmount: 0,
        discountAmount: 0,
        refundMethod: RefundMethod.CASH,
        refundedAmount: 580000,
      },
    ];
    // Thu tiền mặt per the cash book: 1,229 + 1,430 + 1,229 + 1,229 + 1,380 = 6,497,000
    const payments = [
      { invoiceId: 's1', paymentMethod: InvoicePaymentMethod.CASH, amount: 1229000 },
      { invoiceId: 's2', paymentMethod: InvoicePaymentMethod.CASH, amount: 1430000 },
      { invoiceId: 's3', paymentMethod: InvoicePaymentMethod.CASH, amount: 1229000 },
      { invoiceId: 's4', paymentMethod: InvoicePaymentMethod.CASH, amount: 1229000 },
      { invoiceId: 's5', paymentMethod: InvoicePaymentMethod.CASH, amount: 1380000 },
    ];
    // Chi tiền mặt: PC000001..04 = 1,430 + 580 + 580 + 1,380 = 3,970,000
    const cashPayments = [
      { cashAccountId: 'cashAcc', totalAmount: 1430000 },
      { cashAccountId: 'cashAcc', totalAmount: 580000 },
      { cashAccountId: 'cashAcc', totalAmount: 580000 },
      { cashAccountId: 'cashAcc', totalAmount: 1380000 },
    ];
    const paymentAccounts = [
      { accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH },
    ];

    const handler = new GetPosDailySummaryHandler(
      repoStub<InvoiceEntity>(invoices),
      repoStub<InvoiceItemEntity>([]),
      repoStub<InvoicePaymentEntity>(payments),
      repoStub<InvoicePromotionEntity>([]),
      repoStub<InvoiceDebtEntity>([]),
      repoStub<DebtPaymentEntity>([]),
      repoStub<CashPaymentEntity>(cashPayments),
      repoStub<CashReceiptEntity>([]),
      repoStub<PaymentAccountEntity>(paymentAccounts),
      { hasPermission: () => Promise.resolve(false) } as unknown as RbacService,
    );

    const dto: PosDailySummaryDto = { issuedAt: { from: '2026-08-13', to: '2026-08-13' } };
    const res = await handler.execute(new GetPosDailySummaryQuery(dto, actor));

    expect(res.revenue.cash).toBe(6497000);
    expect(res.expense.cash).toBe(3970000);
    expect(res.netCashFlow).toBe(2527000);
    // Both reported, neither in the total.
    expect(res.revenue.points).toBe(500000);
    expect(res.revenue.promotion).toBe(719000);
  });

  it('reports promotion money given away, which no field used to carry (QA #10)', async () => {
    // 719,000đ of promotion on the day QA tested reported as 0 because nothing
    // read invoices.discount_amount — the one column the v2 saga writes it to.
    const invoices = [
      { id: 'i1', type: InvoiceType.SALE, pointsDiscountAmount: 0, discountAmount: 500000 },
      { id: 'i2', type: InvoiceType.SALE, pointsDiscountAmount: 0, discountAmount: 219000 },
      // A return gives promotion back, so it signs negative like every other figure.
      { id: 'i3', type: InvoiceType.RETURN, pointsDiscountAmount: 0, discountAmount: 19000 },
    ];

    const handler = new GetPosDailySummaryHandler(
      repoStub<InvoiceEntity>(invoices),
      repoStub<InvoiceItemEntity>([]),
      repoStub<InvoicePaymentEntity>([]),
      repoStub<InvoicePromotionEntity>([]),
      repoStub<InvoiceDebtEntity>([]),
      repoStub<DebtPaymentEntity>([]),
      repoStub<CashPaymentEntity>([]),
      repoStub<CashReceiptEntity>([]),
      repoStub<PaymentAccountEntity>([]),
      { hasPermission: () => Promise.resolve(false) } as unknown as RbacService,
    );

    const dto: PosDailySummaryDto = { issuedAt: { from: '2026-01-01', to: '2026-07-29' } };
    const res = await handler.execute(new GetPosDailySummaryQuery(dto, actor));

    expect(res.revenue.promotion).toBe(700000); // 500000 + 219000 − 19000
    // Informational only — a discount moves no money into a fund.
    expect(res.revenue.total).toBe(0);
    expect(res.netCashFlow).toBe(0);
  });

  it('folds non-invoice cash receipts (Thu nợ / Thu khác) into revenue.cash/bankTransfer, excluding POS_SALE-purpose receipts', async () => {
    const paymentAccounts = [
      { accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH },
      { accountId: 'bankAcc', paymentMethod: PaymentAccountMethod.BANK_TRANSFER },
    ];
    const cashReceipts = [
      // Thu nợ (debt collected in cash) — counted.
      { cashAccountId: 'cashAcc', totalAmount: 500000, purpose: CashReceiptPurpose.DEBT_COLLECTION },
      // Thu khác (misc, bank transfer) — counted.
      { cashAccountId: 'bankAcc', totalAmount: 200000, purpose: CashReceiptPurpose.OTHER },
      // An unmapped fund account defaults to cash, like cash_payments does.
      { cashAccountId: 'unmapped', totalAmount: 30000, purpose: CashReceiptPurpose.OTHER_INCOME },
    ];

    const handler = new GetPosDailySummaryHandler(
      repoStub<InvoiceEntity>([]),
      repoStub<InvoiceItemEntity>([]),
      repoStub<InvoicePaymentEntity>([]),
      repoStub<InvoicePromotionEntity>([]),
      repoStub<InvoiceDebtEntity>([]),
      repoStub<DebtPaymentEntity>([]),
      repoStub<CashPaymentEntity>([]),
      repoStub<CashReceiptEntity>(cashReceipts),
      repoStub<PaymentAccountEntity>(paymentAccounts),
      { hasPermission: () => Promise.resolve(false) } as unknown as RbacService,
    );

    const dto: PosDailySummaryDto = { issuedAt: { from: '2026-07-01', to: '2026-07-31' } };
    const res = await handler.execute(new GetPosDailySummaryQuery(dto, actor));

    expect(res.revenue.cash).toBe(530000); // 500000 (Thu nợ) + 30000 (unmapped → cash)
    expect(res.revenue.bankTransfer).toBe(200000); // Thu khác, bank transfer
  });

  it('queries cash_receipts with purpose != POS_SALE so a POS cash sale is never double-counted', async () => {
    const receiptWhereCalls: unknown[][] = [];

    const handler = new GetPosDailySummaryHandler(
      repoStub<InvoiceEntity>([]),
      repoStub<InvoiceItemEntity>([]),
      repoStub<InvoicePaymentEntity>([]),
      repoStub<InvoicePromotionEntity>([]),
      repoStub<InvoiceDebtEntity>([]),
      repoStub<DebtPaymentEntity>([]),
      repoStub<CashPaymentEntity>([]),
      repoStub<CashReceiptEntity>([], undefined, receiptWhereCalls),
      repoStub<PaymentAccountEntity>([]),
      { hasPermission: () => Promise.resolve(false) } as unknown as RbacService,
    );

    const dto: PosDailySummaryDto = { issuedAt: { from: '2026-07-01', to: '2026-07-31' } };
    await handler.execute(new GetPosDailySummaryQuery(dto, actor));

    expect(receiptWhereCalls).toContainEqual([
      'r.purpose != :posSale',
      { posSale: CashReceiptPurpose.POS_SALE },
    ]);
  });
});
