import { ObjectLiteral, Repository } from 'typeorm';
import { PosDailySummaryDetailCategory } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import {
  InvoiceEntity,
  InvoicePaymentMethod,
  InvoiceType,
  RefundMethod,
} from '../../../pos/entities/invoice.entity';
import { InvoiceItemEntity } from '../../../pos/entities/invoice-item.entity';
import { InvoicePaymentEntity } from '../../../pos/entities/invoice-payment.entity';
import { InvoiceDebtEntity } from '../../../pos/entities/invoice-debt.entity';
import {
  DebtPaymentEntity,
  DebtPaymentMethod,
} from '../../../pos/entities/debt-payment.entity';
import { InvoicePromotionEntity } from '../../../promotion/invoice-promotion.entity';
import { CashReceiptEntity } from '../../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { DepositAccountEntity } from '../../../accounting/deposit/deposit-account.entity';
import { AccountEntity } from '../../../accounting/coa/account.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { CashPaymentEntity } from '../../../accounting/cash-vouchers/cash-payments/cash-payment.entity';
import { BankPaymentEntity } from '../../../accounting/deposit-vouchers/bank-payments/bank-payment.entity';
import { BankReceiptEntity } from '../../../accounting/deposit-vouchers/bank-receipts/bank-receipt.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { GetPosDailySummaryDetailHandler } from './get-pos-daily-summary-detail.handler';
import { GetPosDailySummaryDetailQuery } from './get-pos-daily-summary-detail.query';
import { GetPosDailySummaryHandler } from './get-pos-daily-summary.handler';
import { GetPosDailySummaryQuery } from './get-pos-daily-summary.query';
import { PosDailySummaryDetailDto } from '../dto/pos-daily-summary-detail.dto';

/** Ignores filter calls and returns preset rows — matches the sibling aggregate-handler spec's stub. */
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

function qbStub(rows: unknown[]) {
  const preds: Record<string, unknown> = {};
  const qb: Record<string, unknown> = {};
  qb.where = () => qb;
  qb.andWhere = (_c: unknown, params?: Record<string, unknown>) => {
    Object.assign(preds, params ?? {});
    return qb;
  };
  qb.innerJoin = () => qb;
  qb.getMany = () => Promise.resolve(applyStubFilters(rows, preds));
  return qb;
}

function repoStub<T extends ObjectLiteral>(
  rows: unknown[],
  findRows: unknown[] = rows,
): Repository<T> {
  return {
    createQueryBuilder: () => qbStub(rows),
    find: () => Promise.resolve(findRows),
  } as unknown as Repository<T>;
}

const actor: ActorContext = {
  userId: 'u1',
  organizationId: 'org1',
  branchId: 'b1',
  roles: [],
  permissions: [],
} as unknown as ActorContext;

interface Fixtures {
  invoices?: unknown[];
  payments?: unknown[];
  invoiceDebts?: unknown[];
  debtPayments?: unknown[];
  cashReceipts?: unknown[];
  cashPayments?: unknown[];
  bankPayments?: unknown[];
  bankReceipts?: unknown[];
  depositAccounts?: unknown[];
  glAccounts?: unknown[];
  customers?: unknown[];
  hasConsolidated?: boolean;
}

/** Builds a handler with all-empty stubs except the overrides given. */
function buildHandler(overrides: Fixtures): GetPosDailySummaryDetailHandler {
  return new GetPosDailySummaryDetailHandler(
    repoStub<InvoiceEntity>(overrides.invoices ?? []),
    repoStub<InvoicePaymentEntity>(overrides.payments ?? []),
    repoStub<InvoiceDebtEntity>(overrides.invoiceDebts ?? []),
    repoStub<DebtPaymentEntity>(overrides.debtPayments ?? []),
    repoStub<CashReceiptEntity>(overrides.cashReceipts ?? []),
    repoStub<CashPaymentEntity>(overrides.cashPayments ?? []),
    repoStub<BankPaymentEntity>(overrides.bankPayments ?? []),
    repoStub<BankReceiptEntity>(overrides.bankReceipts ?? []),
    repoStub<DepositAccountEntity>(overrides.depositAccounts ?? []),
    repoStub<AccountEntity>(overrides.glAccounts ?? []),
    repoStub<CustomerEntity>(overrides.customers ?? []),
    {
      hasPermission: () => Promise.resolve(overrides.hasConsolidated ?? false),
    } as unknown as RbacService,
  );
}

/** The aggregate handler over the same fixtures — used by the sum-parity test. */
function buildAggregateHandler(overrides: Fixtures): GetPosDailySummaryHandler {
  return new GetPosDailySummaryHandler(
    repoStub<InvoiceEntity>(overrides.invoices ?? []),
    repoStub<InvoiceItemEntity>([]),
    repoStub<InvoicePaymentEntity>(overrides.payments ?? []),
    repoStub<InvoicePromotionEntity>([]),
    repoStub<InvoiceDebtEntity>(overrides.invoiceDebts ?? []),
    repoStub<DebtPaymentEntity>(overrides.debtPayments ?? []),
    repoStub<CashPaymentEntity>(overrides.cashPayments ?? []),
    repoStub<BankPaymentEntity>(overrides.bankPayments ?? []),
    repoStub<CashReceiptEntity>(overrides.cashReceipts ?? []),
    repoStub<BankReceiptEntity>(overrides.bankReceipts ?? []),
    {
      hasPermission: () => Promise.resolve(overrides.hasConsolidated ?? false),
    } as unknown as RbacService,
  );
}

const BASE_DTO = { issuedAt: { from: '2026-07-01', to: '2026-07-31' } };

describe('GetPosDailySummaryDetailHandler', () => {
  it('revenue-cash: combines invoice cash payments with debt repayments received in cash', async () => {
    const invoices = [
      { id: 'i1', code: 'HD001', type: InvoiceType.SALE, customerId: 'c1', issuedAt: new Date('2026-07-10') },
    ];
    const payments = [
      { invoiceId: 'i1', paymentMethod: InvoicePaymentMethod.CASH, amount: 100000, accountId: 'gl1' },
    ];
    const debtPayments = [
      {
        id: 'dp1',
        debtId: 'd1',
        amount: 50000,
        paymentMethod: DebtPaymentMethod.CASH,
        paidAt: new Date('2026-07-11'),
        cashReceiptId: 'r1',
      },
      // Received by transfer — belongs to the Chuyển khoản drill-down, not this one.
      {
        id: 'dp2',
        debtId: 'd1',
        amount: 70000,
        paymentMethod: DebtPaymentMethod.BANK_TRANSFER,
        paidAt: new Date('2026-07-12'),
        cashReceiptId: null,
      },
    ];
    const invoiceDebts = [{ id: 'd1', invoiceId: 'i9', customerId: 'c2' }];
    const cashReceipts = [{ id: 'r1', documentNumber: 'PT000001' }];
    const customers = [
      { id: 'c1', name: 'Khách A' },
      { id: 'c2', name: 'Nguyễn Văn A' },
    ];

    const handler = buildHandler({ invoices, payments, debtPayments, invoiceDebts, cashReceipts, customers });
    const dto: PosDailySummaryDetailDto = {
      ...BASE_DTO,
      category: PosDailySummaryDetailCategory.RevenueCash,
    };
    const res = await handler.execute(new GetPosDailySummaryDetailQuery(dto, actor));

    expect(res.total).toBe(2);
    expect(res.rows.find((r) => r.documentNumber === 'HD001')).toMatchObject({
      documentType: 'Bán hàng',
      customerName: 'Khách A',
      amount: 100000,
    });
    expect(res.rows.find((r) => r.documentNumber === 'PT000001')).toMatchObject({
      documentType: 'Thu nợ',
      customerName: 'Nguyễn Văn A',
      amount: 50000,
    });
    // Grand total sums every matching row (100000 + 50000), not just the page shown.
    expect(res.totals).toEqual({ amount: 150000, pointsUsed: 0, pointsValue: 0 });
  });

  it('revenue-points: sets pointsUsed/pointsValue, no amount field', async () => {
    const invoices = [
      {
        id: 'i1',
        code: 'HD001',
        type: InvoiceType.SALE,
        customerId: null,
        issuedAt: new Date('2026-07-10'),
        pointsDiscountAmount: 20000,
        pointsRedeemed: 40,
      },
    ];
    const handler = buildHandler({ invoices });
    const dto: PosDailySummaryDetailDto = {
      ...BASE_DTO,
      category: PosDailySummaryDetailCategory.RevenuePoints,
    };
    const res = await handler.execute(new GetPosDailySummaryDetailQuery(dto, actor));

    expect(res.rows).toEqual([
      expect.objectContaining({
        documentNumber: 'HD001',
        documentType: 'Bán hàng',
        customerName: 'Khách lẻ',
        pointsUsed: 40,
        pointsValue: 20000,
        amount: undefined,
      }),
    ]);
  });

  it('expense-bank-transfer: lists RTN invoices refunded by BANK, net of the debt offset', async () => {
    const invoices = [
      {
        id: 'r1',
        code: 'RTN-202607-00001',
        type: InvoiceType.RETURN,
        customerId: 'c1',
        issuedAt: new Date('2026-07-05'),
        refundMethod: RefundMethod.BANK,
        refundedAmount: 40000,
        offsetAmount: 10000,
      },
      // Refunded in cash — belongs to the Tiền mặt drill-down.
      {
        id: 'r2',
        code: 'RTN-202607-00002',
        type: InvoiceType.RETURN,
        customerId: 'c1',
        issuedAt: new Date('2026-07-06'),
        refundMethod: RefundMethod.CASH,
        refundedAmount: 15000,
        offsetAmount: 0,
      },
      // Store credit moves no money at all.
      {
        id: 'r3',
        code: 'RTN-202607-00003',
        type: InvoiceType.RETURN,
        customerId: 'c1',
        issuedAt: new Date('2026-07-07'),
        refundMethod: RefundMethod.STORE_CREDIT,
        refundedAmount: 90000,
        offsetAmount: 0,
      },
    ];
    const customers = [{ id: 'c1', name: 'Khách B' }];

    const handler = buildHandler({ invoices, customers });
    const dto: PosDailySummaryDetailDto = {
      ...BASE_DTO,
      category: PosDailySummaryDetailCategory.ExpenseBankTransfer,
    };
    const res = await handler.execute(new GetPosDailySummaryDetailQuery(dto, actor));

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      documentNumber: 'RTN-202607-00001',
      documentType: 'Đổi trả',
      customerName: 'Khách B',
      amount: 30000,
    });
  });

  /**
   * The category contract: each drill-down's grand total must equal the summary
   * line it was opened from. Both handlers run over one fixture set here so a
   * change to either side cannot silently break that.
   */
  it('drill-down totals equal the aggregate summary lines they back', async () => {
    const fixtures: Fixtures = {
      invoices: [
        { id: 'i1', code: 'HD001', type: InvoiceType.SALE, customerId: null, issuedAt: new Date('2026-07-10'), pointsDiscountAmount: 0 },
        {
          id: 'r1',
          code: 'RTN001',
          type: InvoiceType.RETURN,
          customerId: null,
          issuedAt: new Date('2026-07-12'),
          pointsDiscountAmount: 0,
          refundMethod: RefundMethod.CASH,
          refundedAmount: 300000,
          offsetAmount: 0,
        },
      ],
      payments: [
        { invoiceId: 'i1', paymentMethod: InvoicePaymentMethod.CASH, amount: 1000000 },
      ],
      debtPayments: [
        {
          id: 'dp1',
          debtId: 'd1',
          amount: 50000,
          paymentMethod: DebtPaymentMethod.CASH,
          paidAt: new Date('2026-07-11'),
          cashReceiptId: null,
        },
      ],
      invoiceDebts: [{ id: 'd1', invoiceId: 'i1', customerId: null }],
    };

    const aggregate = await buildAggregateHandler(fixtures).execute(
      new GetPosDailySummaryQuery(BASE_DTO, actor),
    );
    const revenueCash = await buildHandler(fixtures).execute(
      new GetPosDailySummaryDetailQuery(
        { ...BASE_DTO, category: PosDailySummaryDetailCategory.RevenueCash },
        actor,
      ),
    );
    const expenseCash = await buildHandler(fixtures).execute(
      new GetPosDailySummaryDetailQuery(
        { ...BASE_DTO, category: PosDailySummaryDetailCategory.ExpenseCash },
        actor,
      ),
    );

    expect(revenueCash.totals.amount).toBe(aggregate.revenue.cash);
    expect(revenueCash.totals.amount).toBe(1050000);
    expect(expenseCash.totals.amount).toBe(aggregate.expense.cash);
    expect(expenseCash.totals.amount).toBe(300000);
  });

  it('debt-increase: labels Loại chứng từ from the source invoice type, uses referenceCode as Số chứng từ', async () => {
    const invoiceDebts = [
      { id: 'd1', referenceCode: 'CN001', invoiceId: 'i1', customerId: 'c1', originalAmount: 200000, issuedAt: '2026-07-15' },
    ];
    const invoices = [{ id: 'i1', type: InvoiceType.EXCHANGE }];
    const customers = [{ id: 'c1', name: 'Khách D' }];

    const handler = buildHandler({ invoiceDebts, invoices, customers });
    const dto: PosDailySummaryDetailDto = {
      ...BASE_DTO,
      category: PosDailySummaryDetailCategory.DebtIncrease,
    };
    const res = await handler.execute(new GetPosDailySummaryDetailQuery(dto, actor));

    expect(res.rows).toEqual([
      expect.objectContaining({
        documentNumber: 'CN001',
        documentType: 'Đổi trả, mua thêm',
        customerName: 'Khách D',
        amount: 200000,
      }),
    ]);
  });

  it('debt-decrease: resolves Số chứng từ via the linked cash receipt, falls back to the payment id', async () => {
    const debtPayments = [
      { id: 'dp1', debtId: 'd1', amount: 75000, paymentMethod: DebtPaymentMethod.CASH, paidAt: new Date('2026-07-20'), cashReceiptId: 'r1' },
      { id: 'dp2', debtId: 'd1', amount: 25000, paymentMethod: DebtPaymentMethod.CASH, paidAt: new Date('2026-07-21'), cashReceiptId: null },
    ];
    const invoiceDebts = [{ id: 'd1', invoiceId: 'i1', customerId: 'c1' }];
    const invoices = [{ id: 'i1', type: InvoiceType.SALE }];
    const cashReceipts = [{ id: 'r1', documentNumber: 'PT000009' }];
    const customers = [{ id: 'c1', name: 'Khách E' }];

    const handler = buildHandler({ debtPayments, invoiceDebts, invoices, cashReceipts, customers });
    const dto: PosDailySummaryDetailDto = {
      ...BASE_DTO,
      category: PosDailySummaryDetailCategory.DebtDecrease,
    };
    const res = await handler.execute(new GetPosDailySummaryDetailQuery(dto, actor));

    expect(res.rows).toHaveLength(2);
    // Giảm nợ keeps the source-invoice label; only the Thu lens relabels to "Thu nợ".
    expect(res.rows.every((r) => r.documentType === 'Bán hàng')).toBe(true);
    expect(res.rows.find((r) => r.amount === 75000)?.documentNumber).toBe('PT000009');
    expect(res.rows.find((r) => r.amount === 25000)?.documentNumber).toBe('dp2');
  });

  it('applies columnFilters and pagination after merging sources', async () => {
    const invoices = [
      { id: 'i1', code: 'HD001', type: InvoiceType.SALE, customerId: null, issuedAt: new Date('2026-07-01') },
      { id: 'i2', code: 'HD002', type: InvoiceType.SALE, customerId: null, issuedAt: new Date('2026-07-02') },
    ];
    const payments = [
      { invoiceId: 'i1', paymentMethod: InvoicePaymentMethod.CASH, amount: 100000 },
      { invoiceId: 'i2', paymentMethod: InvoicePaymentMethod.CASH, amount: 200000 },
    ];

    const handler = buildHandler({ invoices, payments });
    const dto: PosDailySummaryDetailDto = {
      ...BASE_DTO,
      category: PosDailySummaryDetailCategory.RevenueCash,
      columnFilters: [{ col: 'amount', gte: 150000 }],
      page: 1,
      limit: 50,
    };
    const res = await handler.execute(new GetPosDailySummaryDetailQuery(dto, actor));

    expect(res.total).toBe(1);
    expect(res.rows).toEqual([expect.objectContaining({ documentNumber: 'HD002', amount: 200000 })]);
    // Totals reflect the filtered set (HD002 only, 200000) — not the unfiltered 300000.
    expect(res.totals.amount).toBe(200000);
  });
});
