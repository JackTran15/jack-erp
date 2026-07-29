import { ObjectLiteral, Repository } from 'typeorm';
import { PosDailySummaryDetailCategory } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InvoiceEntity, InvoicePaymentMethod, InvoiceType } from '../../../pos/entities/invoice.entity';
import { InvoicePaymentEntity } from '../../../pos/entities/invoice-payment.entity';
import { InvoiceDebtEntity } from '../../../pos/entities/invoice-debt.entity';
import { DebtPaymentEntity } from '../../../pos/entities/debt-payment.entity';
import { CashPaymentEntity } from '../../../accounting/cash-vouchers/cash-payments/cash-payment.entity';
import { CashReceiptEntity } from '../../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import { CashReceiptPurpose } from '../../../accounting/cash-vouchers/enums';
import { PaymentAccountEntity } from '../../../accounting/payment-accounts/payment-account.entity';
import { PaymentAccountMethod } from '../../../accounting/payment-accounts/enums';
import { CashAccountEntity } from '../../../accounting/cash/cash-account.entity';
import { DepositAccountEntity } from '../../../accounting/deposit/deposit-account.entity';
import { AccountEntity } from '../../../accounting/coa/account.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { GetPosDailySummaryDetailHandler } from './get-pos-daily-summary-detail.handler';
import { GetPosDailySummaryDetailQuery } from './get-pos-daily-summary-detail.query';
import { PosDailySummaryDetailDto } from '../dto/pos-daily-summary-detail.dto';

/** Ignores filter calls and returns preset rows — matches the sibling aggregate-handler spec's stub. */
function qbStub(rows: unknown[]) {
  const qb: Record<string, unknown> = {};
  qb.where = () => qb;
  qb.andWhere = () => qb;
  qb.innerJoin = () => qb;
  qb.getMany = () => Promise.resolve(rows);
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

/** Builds a handler with all-empty stubs except the overrides given. */
function buildHandler(overrides: {
  invoices?: unknown[];
  payments?: unknown[];
  invoiceDebts?: unknown[];
  debtPayments?: unknown[];
  cashPayments?: unknown[];
  cashReceipts?: unknown[];
  paymentAccounts?: unknown[];
  cashAccounts?: unknown[];
  depositAccounts?: unknown[];
  glAccounts?: unknown[];
  customers?: unknown[];
  hasConsolidated?: boolean;
}): GetPosDailySummaryDetailHandler {
  return new GetPosDailySummaryDetailHandler(
    repoStub<InvoiceEntity>(overrides.invoices ?? []),
    repoStub<InvoicePaymentEntity>(overrides.payments ?? []),
    repoStub<InvoiceDebtEntity>(overrides.invoiceDebts ?? []),
    repoStub<DebtPaymentEntity>(overrides.debtPayments ?? []),
    repoStub<CashPaymentEntity>(overrides.cashPayments ?? []),
    repoStub<CashReceiptEntity>(overrides.cashReceipts ?? []),
    repoStub<PaymentAccountEntity>(overrides.paymentAccounts ?? []),
    repoStub<CashAccountEntity>(overrides.cashAccounts ?? []),
    repoStub<DepositAccountEntity>(overrides.depositAccounts ?? []),
    repoStub<AccountEntity>(overrides.glAccounts ?? []),
    repoStub<CustomerEntity>(overrides.customers ?? []),
    {
      hasPermission: () => Promise.resolve(overrides.hasConsolidated ?? false),
    } as unknown as RbacService,
  );
}

const BASE_DTO = { issuedAt: { from: '2026-07-01', to: '2026-07-31' } };

describe('GetPosDailySummaryDetailHandler', () => {
  it('revenue-cash: combines invoice cash payments, cash-refund netting, and non-invoice cash receipts', async () => {
    const invoices = [
      { id: 'i1', code: 'HD001', type: InvoiceType.SALE, customerId: 'c1', issuedAt: new Date('2026-07-10') },
    ];
    const payments = [
      { invoiceId: 'i1', paymentMethod: InvoicePaymentMethod.CASH, amount: 100000, accountId: 'gl1' },
    ];
    const cashReceipts = [
      {
        id: 'r1',
        documentNumber: 'PT000001',
        cashAccountId: 'cashAcc',
        totalAmount: 50000,
        purpose: CashReceiptPurpose.DEBT_COLLECTION,
        payerName: 'Nguyễn Văn A',
        voucherDate: '2026-07-11',
      },
    ];
    const paymentAccounts = [{ accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH }];
    const customers = [{ id: 'c1', name: 'Khách A' }];

    const handler = buildHandler({ invoices, payments, cashReceipts, paymentAccounts, customers });
    const dto: PosDailySummaryDetailDto = {
      ...BASE_DTO,
      category: PosDailySummaryDetailCategory.RevenueCash,
    };
    const res = await handler.execute(new GetPosDailySummaryDetailQuery(dto, actor));

    expect(res.total).toBe(2);
    const invoiceRow = res.rows.find((r) => r.documentNumber === 'HD001');
    expect(invoiceRow).toMatchObject({
      documentType: 'Bán hàng',
      customerName: 'Khách A',
      amount: 100000,
    });
    const receiptRow = res.rows.find((r) => r.documentNumber === 'PT000001');
    expect(receiptRow).toMatchObject({
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

  it('expense-bank-transfer: only includes cash_payments mapped to the bank-transfer account, resolves cash account name', async () => {
    const cashPayments = [
      { id: 'p1', documentNumber: 'PC001', cashAccountId: 'bankAcc', totalAmount: 30000, payeeName: 'NCC B', voucherDate: '2026-07-05' },
      { id: 'p2', documentNumber: 'PC002', cashAccountId: 'cashAcc', totalAmount: 15000, payeeName: 'NCC C', voucherDate: '2026-07-06' },
    ];
    const paymentAccounts = [
      { accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH },
      { accountId: 'bankAcc', paymentMethod: PaymentAccountMethod.BANK_TRANSFER },
    ];
    const cashAccounts = [{ id: 'bankAcc', name: 'Vietcombank chi nhánh' }];

    const handler = buildHandler({ cashPayments, paymentAccounts, cashAccounts });
    const dto: PosDailySummaryDetailDto = {
      ...BASE_DTO,
      category: PosDailySummaryDetailCategory.ExpenseBankTransfer,
    };
    const res = await handler.execute(new GetPosDailySummaryDetailQuery(dto, actor));

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      documentNumber: 'PC001',
      customerName: 'NCC B',
      bankAccountName: 'Vietcombank chi nhánh',
      amount: 30000,
    });
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
      { id: 'dp1', debtId: 'd1', amount: 75000, paidAt: new Date('2026-07-20'), cashReceiptId: 'r1' },
      { id: 'dp2', debtId: 'd1', amount: 25000, paidAt: new Date('2026-07-21'), cashReceiptId: null },
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
