import { BadRequestException } from '@nestjs/common';
import { CashReceiptPurpose } from '../../../accounting/cash-vouchers/enums';
import { DebtPaymentMethod } from '../../../pos/entities/debt-payment.entity';
import { ReceivablesDetailByProductReport } from './receivables-detail-by-product.report';

const ORG = 'org-1';
const CUSTOMER = 'c1';
const actor = { userId: 'u1', organizationId: ORG, branchId: 'b1', roles: [] } as any;

const OPENING = 2531500;

function makeInvoiceDebt(overrides: Partial<any> = {}) {
  return {
    id: 'debt-1',
    invoiceId: 'inv-1',
    customerId: CUSTOMER,
    originalAmount: 5415000,
    issuedAt: '2026-07-09',
    referenceCode: 'REF-1',
    ...overrides,
  };
}

function makeInvoice() {
  return {
    id: 'inv-1',
    code: '2607050008',
    branchId: 'br1',
    issuedAt: new Date('2026-07-09T00:00:00Z'),
  };
}

function makeLines(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `line-${i}`,
    invoiceId: 'inv-1',
    itemId: `item-${i}`,
    itemCode: `SKU-${i}`,
    itemName: `Item ${i}`,
    unit: 'Đôi',
    quantity: 1,
    unitPrice: 1200000,
    lineDiscount: 360000,
    lineTotal: 840000,
    sortOrder: i,
  }));
}

function makeDebtPayment() {
  return {
    id: 'pay-1',
    debtId: 'debt-1',
    amount: 3000000,
    paymentMethod: DebtPaymentMethod.CASH,
    paidAt: new Date('2026-07-13T00:00:00Z'),
    cashReceiptId: 'cr-1',
  };
}

function makeCashReceipt() {
  return {
    id: 'cr-1',
    documentNumber: 'PT000002',
    purpose: CashReceiptPurpose.DEBT_COLLECTION,
    reason: 'Thu nợ từ Dev Test',
    branchId: 'br1',
  };
}

function makeReport(opts: {
  openingDebts?: any[];
  openingPayments?: any[];
  periodDebts?: any[];
  periodPaymentsQbResult?: any[];
  invoices?: any[];
  invoiceLines?: any[];
  cashReceipts?: any[];
  branches?: any[];
  categories?: any[];
  items?: any[];
}) {
  const invoiceDebtsRepo: any = {
    // 1st call = opening (LessThan), 2nd call = in-period (Between) — matches call order in buildData.
    find: jest
      .fn()
      .mockResolvedValueOnce(opts.openingDebts ?? [])
      .mockResolvedValueOnce(opts.periodDebts ?? []),
  };
  const paymentQb: any = {
    innerJoin: jest.fn(() => paymentQb),
    where: jest.fn(() => paymentQb),
    andWhere: jest.fn(() => paymentQb),
    // 1st call = payments before the period, 2nd call = payments in the period.
    getMany: jest
      .fn()
      .mockResolvedValueOnce(opts.openingPayments ?? [])
      .mockResolvedValueOnce(opts.periodPaymentsQbResult ?? []),
  };
  const debtPaymentsRepo: any = { createQueryBuilder: jest.fn(() => paymentQb) };
  const invoicesRepo: any = { find: jest.fn(async () => opts.invoices ?? []) };
  const invoiceItemsRepo: any = { find: jest.fn(async () => opts.invoiceLines ?? []) };
  const cashReceiptsRepo: any = { find: jest.fn(async () => opts.cashReceipts ?? []) };
  const branchesRepo: any = { find: jest.fn(async () => opts.branches ?? [{ id: 'br1', name: 'Chi nhánh 211 TP. Đà Nẵng' }]) };
  const categoriesRepo: any = { find: jest.fn(async () => opts.categories ?? []) };
  const itemsRepo: any = { find: jest.fn(async () => opts.items ?? []) };

  return new ReceivablesDetailByProductReport(
    invoiceDebtsRepo,
    debtPaymentsRepo,
    invoicesRepo,
    invoiceItemsRepo,
    cashReceiptsRepo,
    branchesRepo,
    categoriesRepo,
    itemsRepo,
  );
}

const ALL_COLUMNS = [
  'date',
  'documentNumber',
  'documentType',
  'documentDescription',
  'sku',
  'itemName',
  'unit',
  'quantity',
  'unitPrice',
  'revenueGoods',
  'revenuePromotion',
  'revenueTotal',
  'lineCollected',
  'lineDebtIncrease',
  'lineDebtDecrease',
  'runningBalance',
  'branchName',
];

describe('ReceivablesDetailByProductReport.buildData', () => {
  it('requires customerId', async () => {
    const report = makeReport({});
    await expect(
      report.buildData(
        {
          reportType: 'receivables-detail-by-product',
          columns: ['date'],
          filters: { period: { from: '2026-07-01', to: '2026-07-31' } },
        } as any,
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires the period filter', async () => {
    const report = makeReport({});
    await expect(
      report.buildData(
        {
          reportType: 'receivables-detail-by-product',
          columns: ['date'],
          filters: { customerId: CUSTOMER },
        } as any,
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('reproduces the confirmed mockup numbers: 13-line invoice (6 fully paid, 1 split, 6 unpaid) + 1 payment receipt, with correct sequential (waterfall) allocation and running balance', async () => {
    const report = makeReport({
      // A single prior debt (no prior payment) seeds "Số dư công nợ đầu kỳ" = 2,531,500.
      openingDebts: [makeInvoiceDebt({ id: 'debt-0', invoiceId: 'inv-0', originalAmount: OPENING, issuedAt: '2026-06-01' })],
      openingPayments: [],
      periodDebts: [makeInvoiceDebt()],
      periodPaymentsQbResult: [makeDebtPayment()],
      invoices: [makeInvoice()],
      invoiceLines: makeLines(13),
      cashReceipts: [makeCashReceipt()],
    });

    const result = await report.buildData(
      {
        reportType: 'receivables-detail-by-product',
        columns: ALL_COLUMNS,
        filters: { customerId: CUSTOMER, period: { from: '2026-07-01', to: '2026-07-31' } },
      } as any,
      actor,
    );

    // rows: [opening, 13 item lines, invoice "Cộng", payment row, payment "Cộng"] = 17
    expect(result.total).toBe(17);
    const rows = result.rows;

    expect(rows[0].documentDescription).toBe('Số dư công nợ đầu kỳ');
    expect(rows[0].runningBalance).toBe(OPENING);

    // First 6 item lines: fully collected in cash, no debt increase.
    for (let i = 1; i <= 6; i++) {
      expect(rows[i].lineCollected).toBe(840000);
      expect(rows[i].lineDebtIncrease).toBe(0);
      expect(rows[i].runningBalance).toBe(OPENING);
    }

    // 7th item line (rows[7]): split 465,000 collected / 375,000 debt.
    expect(rows[7].lineCollected).toBe(465000);
    expect(rows[7].lineDebtIncrease).toBe(375000);
    expect(rows[7].runningBalance).toBe(OPENING + 375000);

    // Lines 8-13 (rows[8..13]): fully unpaid, 840,000 debt increase each, running balance climbs by 840,000 each time.
    const expectedBalances = [1, 2, 3, 4, 5, 6].map((n) => OPENING + 375000 + 840000 * n);
    for (let i = 0; i < 6; i++) {
      expect(rows[8 + i].lineDebtIncrease).toBe(840000);
      expect(rows[8 + i].runningBalance).toBe(expectedBalances[i]);
    }
    expect(rows[13].runningBalance).toBe(7946500); // matches the confirmed mockup value exactly

    // Invoice "Cộng" row (rows[14]) — "Cộng" label shown in the date column.
    expect(rows[14].date).toBe('Cộng');
    expect(rows[14].documentNumber).toBeNull();
    expect(rows[14].quantity).toBe(13);
    expect(rows[14].revenueTotal).toBe(10920000);
    expect(rows[14].lineCollected).toBe(5505000);
    expect(rows[14].lineDebtIncrease).toBe(5415000);
    expect(rows[14].runningBalance).toBe(rows[13].runningBalance);

    // Payment row (rows[15]).
    expect(rows[15].documentNumber).toBe('PT000002');
    expect(rows[15].documentType).toBe('Phiếu thu nợ - Tiền mặt');
    expect(rows[15].documentDescription).toBe('Thu nợ từ Dev Test');
    expect(rows[15].lineDebtDecrease).toBe(3000000);
    expect(rows[15].runningBalance).toBe(Number(rows[14].runningBalance) - 3000000);
    // Payment vouchers carry their own branchId (cash_receipts.branch_id) —
    // must resolve to the branch name, same as invoice rows, not stay blank.
    expect(rows[15].branchName).toBe('Chi nhánh 211 TP. Đà Nẵng');

    // Payment "Cộng" row (rows[16]).
    expect(rows[16].date).toBe('Cộng');
    expect(rows[16].lineDebtDecrease).toBe(3000000);
    expect(rows[16].runningBalance).toBe(rows[15].runningBalance);

    expect(result.totals?.lineDebtIncrease).toBe(5415000);
    expect(result.totals?.lineDebtDecrease).toBe(3000000);
    expect(result.totals?.runningBalance).toBe(rows[16].runningBalance);
  });

  it('gives every document group a "Cộng" row even when the invoice has a single line', async () => {
    const report = makeReport({
      periodDebts: [makeInvoiceDebt({ id: 'debt-2', invoiceId: 'inv-2', originalAmount: 2800000 })],
      invoices: [{ id: 'inv-2', code: '2607050010', branchId: 'br1', issuedAt: new Date('2026-07-15T00:00:00Z') }],
      invoiceLines: [
        {
          id: 'line-x',
          invoiceId: 'inv-2',
          itemId: 'item-x',
          itemCode: 'X',
          itemName: 'X',
          unit: 'Đôi',
          quantity: 3,
          unitPrice: 1200000,
          lineDiscount: 800000,
          lineTotal: 2800000,
          sortOrder: 0,
        },
      ],
    });

    const result = await report.buildData(
      {
        reportType: 'receivables-detail-by-product',
        columns: ALL_COLUMNS,
        filters: { customerId: CUSTOMER, period: { from: '2026-07-01', to: '2026-07-31' } },
      } as any,
      actor,
    );

    // rows: [opening, 1 item line, "Cộng"] = 3
    expect(result.total).toBe(3);
    expect(result.rows[2].quantity).toBe(3);
    expect(result.rows[2].revenueTotal).toBe(2800000);
  });
});
