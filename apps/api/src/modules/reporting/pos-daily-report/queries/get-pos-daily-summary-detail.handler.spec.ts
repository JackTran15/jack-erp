import { ObjectLiteral, Repository } from 'typeorm';
import { PosDailySummaryDetailCategory } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { InvoiceEntity, InvoicePaymentMethod, InvoiceType } from '../../../pos/entities/invoice.entity';
import { InvoicePaymentEntity } from '../../../pos/entities/invoice-payment.entity';
import { InvoiceDebtEntity } from '../../../pos/entities/invoice-debt.entity';
import { DebtPaymentEntity } from '../../../pos/entities/debt-payment.entity';
import { CashPaymentEntity } from '../../../accounting/cash-vouchers/cash-payments/cash-payment.entity';
import { CashReceiptEntity } from '../../../accounting/cash-vouchers/cash-receipts/cash-receipt.entity';
import {
  CashReceiptPurpose,
  CashReceiptReferenceType,
} from '../../../accounting/cash-vouchers/enums';
import { PaymentAccountEntity } from '../../../accounting/payment-accounts/payment-account.entity';
import { PaymentAccountMethod } from '../../../accounting/payment-accounts/enums';
import { CashAccountEntity } from '../../../accounting/cash/cash-account.entity';
import { DepositAccountEntity } from '../../../accounting/deposit/deposit-account.entity';
import { AccountEntity } from '../../../accounting/coa/account.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { UserEntity } from '../../../auth/user.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { GetPosDailySummaryDetailHandler } from './get-pos-daily-summary-detail.handler';
import { GetPosDailySummaryDetailQuery } from './get-pos-daily-summary-detail.query';
import { PosDailySummaryDetailDto } from '../dto/pos-daily-summary-detail.dto';

/**
 * Ignores filter calls and returns preset rows — matches the sibling aggregate-handler spec's stub.
 * `captured` collects the raw SQL of every where/andWhere, which is the only way to assert on a
 * clause the stub deliberately does not apply (e.g. the POS_SALE exclusion).
 */
function qbStub(rows: unknown[], captured?: string[]) {
  const qb: Record<string, unknown> = {};
  qb.where = (sql: string) => (captured?.push(sql), qb);
  qb.andWhere = (sql: string) => (captured?.push(sql), qb);
  qb.innerJoin = () => qb;
  qb.getMany = () => Promise.resolve(rows);
  return qb;
}

function repoStub<T extends ObjectLiteral>(
  rows: unknown[],
  findRows: unknown[] = rows,
  captured?: string[],
): Repository<T> {
  return {
    createQueryBuilder: () => qbStub(rows, captured),
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
  /** Rows the `find`-by-reference_id lookup returns, when it must differ from the windowed set. */
  invoicesByReferenceId?: unknown[];
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
  users?: unknown[];
  hasConsolidated?: boolean;
  /** Collects the SQL of every where/andWhere issued against `cash_receipts`. */
  receiptWhere?: string[];
}): GetPosDailySummaryDetailHandler {
  const receipts = overrides.cashReceipts ?? [];
  return new GetPosDailySummaryDetailHandler(
    // Two separate reads hit this repo: `fetchWindowInvoices` via createQueryBuilder
    // (date-windowed) and the label lookup via find (by reference_id). Feeding them
    // separately is what lets a test prove which one produced a label.
    repoStub<InvoiceEntity>(
      overrides.invoices ?? [],
      overrides.invoicesByReferenceId ?? overrides.invoices ?? [],
    ),
    repoStub<InvoicePaymentEntity>(overrides.payments ?? []),
    repoStub<InvoiceDebtEntity>(overrides.invoiceDebts ?? []),
    repoStub<DebtPaymentEntity>(overrides.debtPayments ?? []),
    repoStub<CashPaymentEntity>(overrides.cashPayments ?? []),
    repoStub<CashReceiptEntity>(receipts, receipts, overrides.receiptWhere),
    repoStub<PaymentAccountEntity>(overrides.paymentAccounts ?? []),
    repoStub<CashAccountEntity>(overrides.cashAccounts ?? []),
    repoStub<DepositAccountEntity>(overrides.depositAccounts ?? []),
    repoStub<AccountEntity>(overrides.glAccounts ?? []),
    repoStub<CustomerEntity>(overrides.customers ?? []),
    repoStub<UserEntity>(overrides.users ?? []),
    {
      hasPermission: () => Promise.resolve(overrides.hasConsolidated ?? false),
    } as unknown as RbacService,
  );
}

const BASE_DTO = { issuedAt: { from: '2026-07-01', to: '2026-07-31' } };

describe('GetPosDailySummaryDetailHandler', () => {
  it('revenue-cash: lists phiếu thu only — invoice cash payments are not rows here', async () => {
    // Present, and deliberately ignored: this category answers "which vouchers",
    // the same question ExpenseCash has always answered. See the handler's class doc.
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

    expect(res.total).toBe(1);
    expect(res.rows).toEqual([
      expect.objectContaining({
        documentNumber: 'PT000001',
        documentType: 'Thu nợ',
        customerName: 'Nguyễn Văn A',
        amount: 50000,
      }),
    ]);
    expect(res.rows.some((r) => r.documentNumber === 'HD001')).toBe(false);
    expect(res.totals).toEqual({ amount: 50000, pointsUsed: 0, pointsValue: 0 });
  });

  it('revenue-cash: includes POS_SALE-purpose receipts, which the aggregate excludes', async () => {
    const receiptWhere: string[] = [];
    const cashReceipts = [
      {
        id: 'r1',
        documentNumber: 'PT000002',
        cashAccountId: 'cashAcc',
        totalAmount: 80000,
        purpose: CashReceiptPurpose.POS_SALE,
        voucherDate: '2026-07-12',
      },
    ];
    const paymentAccounts = [{ accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH }];

    const handler = buildHandler({ cashReceipts, paymentAccounts, receiptWhere });
    const dto: PosDailySummaryDetailDto = {
      ...BASE_DTO,
      category: PosDailySummaryDetailCategory.RevenueCash,
    };
    const res = await handler.execute(new GetPosDailySummaryDetailQuery(dto, actor));

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ documentNumber: 'PT000002', amount: 80000 });
    // The stub applies no filtering, so assert on the clause itself: it must not be issued.
    expect(receiptWhere.some((sql) => sql.includes('purpose != :posSale'))).toBe(false);
  });

  it('revenue-bank-transfer: unchanged — still lists invoice payments and still excludes POS_SALE', async () => {
    const receiptWhere: string[] = [];
    const invoices = [
      { id: 'i1', code: 'HD002', type: InvoiceType.SALE, customerId: 'c1', issuedAt: new Date('2026-07-10') },
    ];
    const payments = [
      {
        invoiceId: 'i1',
        paymentMethod: InvoicePaymentMethod.BANK_TRANSFER,
        amount: 120000,
        depositAccountId: 'dep1',
      },
    ];
    const paymentAccounts = [{ accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH }];
    const customers = [{ id: 'c1', name: 'Khách A' }];
    const depositAccounts = [{ id: 'dep1', name: 'Techcombank' }];

    const handler = buildHandler({
      invoices,
      payments,
      paymentAccounts,
      customers,
      depositAccounts,
      receiptWhere,
    });
    const dto: PosDailySummaryDetailDto = {
      ...BASE_DTO,
      category: PosDailySummaryDetailCategory.RevenueBankTransfer,
    };
    const res = await handler.execute(new GetPosDailySummaryDetailQuery(dto, actor));

    expect(res.rows).toEqual([
      expect.objectContaining({
        documentNumber: 'HD002',
        documentType: 'Bán hàng',
        bankAccountName: 'Techcombank',
        amount: 120000,
      }),
    ]);
    expect(receiptWhere.some((sql) => sql.includes('purpose != :posSale'))).toBe(true);
  });

  it('resolves staffName from the voucher staff_id on both cash categories', async () => {
    const users = [{ id: 'u9', firstName: 'Trần', lastName: 'Thu Ngân' }];
    const paymentAccounts = [{ accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH }];

    const thu = await buildHandler({
      cashReceipts: [
        {
          id: 'r1',
          documentNumber: 'PT000003',
          cashAccountId: 'cashAcc',
          totalAmount: 10000,
          purpose: CashReceiptPurpose.OTHER,
          staffId: 'u9',
          voucherDate: '2026-07-13',
        },
      ],
      paymentAccounts,
      users,
    }).execute(
      new GetPosDailySummaryDetailQuery(
        { ...BASE_DTO, category: PosDailySummaryDetailCategory.RevenueCash },
        actor,
      ),
    );
    expect(thu.rows[0].staffName).toBe('Trần Thu Ngân');

    const chi = await buildHandler({
      cashPayments: [
        {
          id: 'p1',
          documentNumber: 'PC000003',
          cashAccountId: 'cashAcc',
          totalAmount: 20000,
          staffId: 'u9',
          voucherDate: '2026-07-14',
        },
      ],
      paymentAccounts,
      users,
    }).execute(
      new GetPosDailySummaryDetailQuery(
        { ...BASE_DTO, category: PosDailySummaryDetailCategory.ExpenseCash },
        actor,
      ),
    );
    expect(chi.rows[0].staffName).toBe('Trần Thu Ngân');
  });

  it('leaves staffName undefined when the voucher has no staff_id — the shape every consumer writes', async () => {
    const paymentAccounts = [{ accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH }];
    const cashPayments = [
      {
        id: 'p1',
        documentNumber: 'PC000004',
        cashAccountId: 'cashAcc',
        totalAmount: 465000,
        staffId: null,
        voucherDate: '2026-07-15',
      },
    ];

    const handler = buildHandler({ cashPayments, paymentAccounts });
    const res = await handler.execute(
      new GetPosDailySummaryDetailQuery(
        { ...BASE_DTO, category: PosDailySummaryDetailCategory.ExpenseCash },
        actor,
      ),
    );

    expect(res.rows[0].staffName).toBeUndefined();
  });

  it('falls back to partnerNameSnapshot when the voucher carries no payer/payee name', async () => {
    const paymentAccounts = [{ accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH }];
    const cashReceipts = [
      {
        id: 'r1',
        documentNumber: 'PT000005',
        cashAccountId: 'cashAcc',
        totalAmount: 40000,
        purpose: CashReceiptPurpose.DEBT_COLLECTION,
        payerName: null,
        partnerNameSnapshot: 'Công ty TNHH B',
        voucherDate: '2026-07-16',
      },
    ];

    const handler = buildHandler({ cashReceipts, paymentAccounts });
    const res = await handler.execute(
      new GetPosDailySummaryDetailQuery(
        { ...BASE_DTO, category: PosDailySummaryDetailCategory.RevenueCash },
        actor,
      ),
    );

    expect(res.rows[0].customerName).toBe('Công ty TNHH B');
  });

  it('labels POS_SALE receipts from the source invoice type, not from the document code', async () => {
    const paymentAccounts = [{ accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH }];
    const receipt = (id: string, doc: string, refId: string) => ({
      id,
      documentNumber: doc,
      cashAccountId: 'cashAcc',
      totalAmount: 1000,
      purpose: CashReceiptPurpose.POS_SALE,
      referenceType: CashReceiptReferenceType.INVOICE,
      referenceId: refId,
      voucherDate: '2026-07-10',
    });
    // i3 is the PT000007 shape: a POS_SALE receipt whose source document is coded
    // RTN- but whose invoice type is EXCHANGE. Reading the code prefix gives the
    // wrong label; only invoices.type gives the right one.
    const invoices = [
      { id: 'i1', type: InvoiceType.SALE },
      { id: 'i2', type: InvoiceType.RETURN },
      { id: 'i3', type: InvoiceType.EXCHANGE },
    ];

    const handler = buildHandler({
      cashReceipts: [
        receipt('r1', 'PT000001', 'i1'),
        receipt('r2', 'PT000002', 'i2'),
        receipt('r3', 'PT000007', 'i3'),
      ],
      invoices,
      paymentAccounts,
    });
    const res = await handler.execute(
      new GetPosDailySummaryDetailQuery(
        { ...BASE_DTO, category: PosDailySummaryDetailCategory.RevenueCash },
        actor,
      ),
    );

    const byDoc = new Map(res.rows.map((r) => [r.documentNumber, r.documentType]));
    expect(byDoc.get('PT000001')).toBe('Bán hàng');
    expect(byDoc.get('PT000002')).toBe('Đổi trả');
    expect(byDoc.get('PT000007')).toBe('Đổi trả, mua thêm');
  });

  it('labels RETURN_CANCEL receipts "Huỷ trả hàng" even though they carry purpose OTHER', async () => {
    const paymentAccounts = [{ accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH }];
    // Branch order matters: purpose is OTHER here, so a purpose-first check would
    // drop every one of these into "Thu khác".
    const cashReceipts = [
      {
        id: 'r1',
        documentNumber: 'PT000003',
        cashAccountId: 'cashAcc',
        totalAmount: 1430000,
        purpose: CashReceiptPurpose.OTHER,
        referenceType: CashReceiptReferenceType.RETURN_CANCEL,
        referenceId: 'i1',
        voucherDate: '2026-07-10',
      },
    ];
    const invoices = [{ id: 'i1', type: InvoiceType.RETURN }];

    const handler = buildHandler({ cashReceipts, invoices, paymentAccounts });
    const res = await handler.execute(
      new GetPosDailySummaryDetailQuery(
        { ...BASE_DTO, category: PosDailySummaryDetailCategory.RevenueCash },
        actor,
      ),
    );

    expect(res.rows[0].documentType).toBe('Huỷ trả hàng');
  });

  it('derives the label from structured columns, so editing `reason` cannot change it', async () => {
    const paymentAccounts = [{ accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH }];
    const base = {
      id: 'r1',
      documentNumber: 'PT000001',
      cashAccountId: 'cashAcc',
      totalAmount: 1000,
      purpose: CashReceiptPurpose.POS_SALE,
      referenceType: CashReceiptReferenceType.INVOICE,
      referenceId: 'i1',
      voucherDate: '2026-07-10',
    };
    const invoices = [{ id: 'i1', type: InvoiceType.SALE }];
    const run = async (reason: string | null) => {
      const handler = buildHandler({
        cashReceipts: [{ ...base, reason }],
        invoices,
        paymentAccounts,
      });
      const res = await handler.execute(
        new GetPosDailySummaryDetailQuery(
          { ...BASE_DTO, category: PosDailySummaryDetailCategory.RevenueCash },
          actor,
        ),
      );
      return res.rows[0].documentType;
    };

    expect(await run('POS sale INV-202608-00001')).toBe('Bán hàng');
    expect(await run('ghi chú tay của thu ngân')).toBe('Bán hàng');
    expect(await run(null)).toBe('Bán hàng');
  });

  it('labels a receipt whose source invoice falls outside the issuedAt window', async () => {
    const paymentAccounts = [{ accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH }];
    const cashReceipts = [
      {
        id: 'r1',
        documentNumber: 'PT000009',
        cashAccountId: 'cashAcc',
        totalAmount: 500000,
        purpose: CashReceiptPurpose.POS_SALE,
        referenceType: CashReceiptReferenceType.INVOICE,
        referenceId: 'old-invoice',
        voucherDate: '2026-07-10',
      },
    ];
    // The date-windowed query returns NOTHING — the invoice is older than the
    // filter. Only the by-reference_id lookup can see it. If the implementation
    // ever reuses `fetchWindowInvoices`, this row degrades to "Thu khác" and this
    // test goes red, which is the whole point of ADR-04.
    const handler = buildHandler({
      cashReceipts,
      invoices: [],
      invoicesByReferenceId: [{ id: 'old-invoice', type: InvoiceType.EXCHANGE }],
      paymentAccounts,
    });
    const res = await handler.execute(
      new GetPosDailySummaryDetailQuery(
        {
          ...BASE_DTO,
          issuedAt: { from: '2026-07-10', to: '2026-07-10' },
          category: PosDailySummaryDetailCategory.RevenueCash,
        },
        actor,
      ),
    );

    expect(res.rows[0].documentType).toBe('Đổi trả, mua thêm');
  });

  it('revenue-bank-transfer keeps the old two-way receipt labels — the new mapping does not leak', async () => {
    const paymentAccounts = [
      { accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH },
      { accountId: 'bankAcc', paymentMethod: PaymentAccountMethod.BANK_TRANSFER },
    ];
    const cashReceipts = [
      {
        id: 'r1',
        documentNumber: 'PT000010',
        cashAccountId: 'bankAcc',
        totalAmount: 90000,
        purpose: CashReceiptPurpose.OTHER,
        referenceType: CashReceiptReferenceType.RETURN_CANCEL,
        referenceId: 'i1',
        voucherDate: '2026-07-10',
      },
    ];
    const invoices = [{ id: 'i1', type: InvoiceType.RETURN }];

    const handler = buildHandler({ cashReceipts, invoices, paymentAccounts });
    const res = await handler.execute(
      new GetPosDailySummaryDetailQuery(
        { ...BASE_DTO, category: PosDailySummaryDetailCategory.RevenueBankTransfer },
        actor,
      ),
    );

    const row = res.rows.find((r) => r.documentNumber === 'PT000010');
    expect(row?.documentType).toBe('Thu khác');
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
    const cashReceipts = [
      {
        id: 'r1',
        documentNumber: 'PT000006',
        cashAccountId: 'cashAcc',
        totalAmount: 100000,
        purpose: CashReceiptPurpose.OTHER,
        voucherDate: '2026-07-01',
      },
      {
        id: 'r2',
        documentNumber: 'PT000007',
        cashAccountId: 'cashAcc',
        totalAmount: 200000,
        purpose: CashReceiptPurpose.OTHER,
        voucherDate: '2026-07-02',
      },
    ];
    const paymentAccounts = [{ accountId: 'cashAcc', paymentMethod: PaymentAccountMethod.CASH }];

    const handler = buildHandler({ cashReceipts, paymentAccounts });
    const dto: PosDailySummaryDetailDto = {
      ...BASE_DTO,
      category: PosDailySummaryDetailCategory.RevenueCash,
      columnFilters: [{ col: 'amount', gte: 150000 }],
      page: 1,
      limit: 50,
    };
    const res = await handler.execute(new GetPosDailySummaryDetailQuery(dto, actor));

    expect(res.total).toBe(1);
    expect(res.rows).toEqual([
      expect.objectContaining({ documentNumber: 'PT000007', amount: 200000 }),
    ]);
    // Totals reflect the filtered set (PT000007 only, 200000) — not the unfiltered 300000.
    expect(res.totals.amount).toBe(200000);
  });
});
